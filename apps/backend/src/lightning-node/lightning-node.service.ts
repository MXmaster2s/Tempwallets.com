import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { base, mainnet, arbitrum } from 'viem/chains';
import { NitroliteClient, type MainWallet } from '../services/yellow-network/index.js';
import type { FundChannelDto, ResizeChannelDto } from './dto/index.js';
import { SeedRepository } from '../wallet/seed.repository.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { IAccount } from '../wallet/types/account.types.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class LightningNodeService {
  private readonly logger = new Logger(LightningNodeService.name);
  private wsUrl: string;
  private userClients: Map<string, NitroliteClient> = new Map();
  
  // Prevent concurrent authentication for the same user+chain (race condition fix)
  private authLocks: Map<string, Promise<NitroliteClient>> = new Map();

  constructor(
    private configService: ConfigService,
    private seedRepository: SeedRepository,
    private walletService: WalletService,
    private prisma: PrismaService,
  ) {
    this.wsUrl = this.configService.get<string>('YELLOW_NETWORK_WS_URL') || '';
    if (!this.wsUrl) {
      this.logger.warn('YELLOW_NETWORK_WS_URL not configured');
    }

    const pimlicoApiKey = this.configService.get<string>('PIMLICO_API_KEY');
    if (!pimlicoApiKey) {
      this.logger.warn('⚠️ PIMLICO_API_KEY not configured - transactions will require gas');
    } else {
      this.logger.log('✅ Pimlico configured - gasless EIP-7702 transactions enabled');
    }
  }

  // Database persistence helpers for channel management
  
  /**
   * Check if user already has an active channel for this chain/token
   */
  private async getExistingChannel(userId: string, chainId: number, token: string) {
    try {
      const channel = await this.prisma.paymentChannel.findFirst({
        where: {
          userId,
          chainId,
          token: token.toLowerCase(),
          status: 'active'
        }
      });
      return channel;
    } catch (error) {
      this.logger.error(`[DB Error] Failed to fetch existing channel for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Save channel to database after creation
   */
  private async saveChannelToDB(
    userId: string, 
    channelId: string, 
    chainId: number, 
    chainName: string, 
    token: string
  ) {
    try {
      await this.prisma.paymentChannel.create({
        data: {
          userId,
          channelId,
          chainId,
          chain: chainName,
          token: token.toLowerCase(),
          status: 'active'
        }
      });
      this.logger.log(`[DB] Saved channel ${channelId} for user ${userId}`);
    } catch (error) {
      this.logger.error(`[DB Critical] Failed to save channel ${channelId}:`, error);
      // Don't throw - channel was created successfully on-chain
    }
  }

  /**
   * Mark channel as closed in database
   */
  private async markChannelClosed(channelId: string) {
    try {
      await this.prisma.paymentChannel.update({
        where: { channelId },
        data: { status: 'closed', closedAt: new Date() }
      });
      this.logger.log(`[DB] Marked channel ${channelId} as closed`);
    } catch (error) {
      this.logger.warn(`[DB Warning] Could not mark channel ${channelId} closed:`, error);
    }
  }

  private async getUserWalletAddress(userId: string, chainName: string): Promise<{ address: Address; isEOA: boolean; chainKey: string }> {
    const baseChain = chainName.toLowerCase().replace(/erc4337$/i, '');
    const allAddresses = await this.walletService.getAddresses(userId);
    
    this.logger.log(`[getUserWalletAddress] All addresses for user ${userId}:`, JSON.stringify(allAddresses, null, 2));
    
    // ALWAYS use EOA address (which is the EIP-7702 enabled address)
    // This ensures consistency across all Lightning Node operations
    let walletAddress = allAddresses[baseChain as keyof typeof allAddresses];
    let isEOA = true;
    let chainKey = baseChain;

    if (!walletAddress) {
      throw new BadRequestException(`No wallet address found for chain ${chainName}`);
    }

    this.logger.log(`[getUserWalletAddress] ✅ Using address: ${walletAddress} (chain: ${chainKey})`);
    return { address: walletAddress as Address, isEOA, chainKey };
  }

  private getChain(chainName: string) {
    switch (chainName.toLowerCase()) {
      case 'base': return base;
      case 'ethereum': case 'mainnet': return mainnet;
      case 'arbitrum': return arbitrum;
      default: return base;
    }
  }

  private getDefaultRpcUrl(chainName: string): string {
    switch (chainName.toLowerCase()) {
      case 'base': return 'https://mainnet.base.org';
      case 'ethereum': case 'mainnet': return 'https://eth.llamarpc.com';
      case 'arbitrum': return 'https://arb1.arbitrum.io/rpc';
      default: return 'https://mainnet.base.org';
    }
  }

  private async getUserNitroliteClient(
    userId: string,
    chainName: string,
    walletAddress: Address,
    isEOA: boolean,
    chainKey: string,
    options?: { preferNativeEoa?: boolean },
  ): Promise<NitroliteClient> {
    // Always normalize cache key to the signer address to avoid signature/address drift
    const normalizedAddress = walletAddress.toLowerCase();
    const nativeSuffix = options?.preferNativeEoa ? '-native' : '-7702';
    const cacheKey = `${userId}-${chainName}-${normalizedAddress}${nativeSuffix}`;

    // Add debug logging to track client instances
    console.log(`[LightningNodeService] getUserNitroliteClient called for ${cacheKey}`);
    console.log(`[LightningNodeService] Cache has key: ${this.userClients.has(cacheKey)}`);
    console.log(`[LightningNodeService] Total cached clients: ${this.userClients.size}`);

    // Check if client exists and is initialized
    if (this.userClients.has(cacheKey)) {
      const cached = this.userClients.get(cacheKey)!;
      const isInitialized = cached.isInitialized();
      console.log(`[LightningNodeService] ✅ Using cached client (initialized: ${isInitialized})`);
      
      if (cached.isInitialized()) {
        return cached;
      }
      
      // If not initialized, clean up and create new one
      console.log(`[LightningNodeService] ⚠️ Cached client not initialized, cleaning up...`);
      this.userClients.delete(cacheKey);
    }

    // **CRITICAL: Check if authentication is already in progress for this user+chain**
    // This prevents race condition where multiple requests trigger concurrent authentications
    if (this.authLocks.has(cacheKey)) {
      console.log(`[LightningNodeService] ⏳ Authentication already in progress, waiting...`);
      return await this.authLocks.get(cacheKey)!;
    }

    console.log(`[LightningNodeService] 🔄 Creating NEW client for ${cacheKey}`);

    // Create a promise for this authentication and store it
  const authPromise = this.createNitroliteClient(userId, chainName, walletAddress, isEOA, chainKey, cacheKey, options?.preferNativeEoa);
    this.authLocks.set(cacheKey, authPromise);

    try {
      const client = await authPromise;
      return client;
    } finally {
      // Always remove the lock when done (success or failure)
      this.authLocks.delete(cacheKey);
      console.log(`[LightningNodeService] 🔓 Auth lock released for ${cacheKey}`);
    }
  }

  /**
   * Internal method to create and initialize a new NitroliteClient
   * Separated from getUserNitroliteClient to support mutex locking
   */
  private async createNitroliteClient(
    userId: string,
    chainName: string,
    walletAddress: Address,
    isEOA: boolean,
    chainKey: string,
    cacheKey: string,
    preferNativeEoa = false,
  ): Promise<NitroliteClient> {
    if (!this.wsUrl) {
      throw new BadRequestException('YELLOW_NETWORK_WS_URL not configured');
    }

    const baseChain = chainName.toLowerCase().replace(/erc4337$/i, '');
    const chain = this.getChain(baseChain);
    const rpcUrl = this.configService.get<string>(`${baseChain.toUpperCase()}_RPC_URL`) || this.getDefaultRpcUrl(baseChain);

    const seedPhrase = await this.seedRepository.getSeedPhrase(userId);
    if (!seedPhrase) {
      throw new BadRequestException(`No wallet seed found for user ${userId}`);
    }

    const eip7702Chains = ['ethereum', 'base', 'arbitrum', 'optimism'];
    if (!eip7702Chains.includes(baseChain)) {
      throw new BadRequestException(`EIP-7702 not supported on ${baseChain}`);
    }

    // When explicitly requested, bypass EIP-7702 and use a plain EOA for signing/channel creation.
    if (preferNativeEoa) {
      const nativeFactory = (this.walletService as any).nativeEoaFactory;
      if (!nativeFactory) {
        throw new BadRequestException('Native EOA Factory not available');
      }

      const nativeAccount: IAccount = await nativeFactory.createAccount(
        seedPhrase,
        baseChain,
        0,
      );

      const nativeAddress = await nativeAccount.getAddress();
      this.logger.warn(`[createNitroliteClient] ⚠️ Using native EOA for Yellow Network (no EIP-7702): ${nativeAddress}`);

      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      }) as PublicClient;

      // CRITICAL FIX: Derive viem account directly from seed to avoid personal_sign issues
      // Alchemy Base doesn't support personal_sign, so we need a proper viem account
      // that uses eth_signTypedData_v4 (EIP-712) for all signing operations
      const viemAccount = mnemonicToAccount(seedPhrase, {
        accountIndex: 0,
        addressIndex: 0,
      });

      // Verify address match
      if (viemAccount.address.toLowerCase() !== nativeAddress.toLowerCase()) {
        throw new BadRequestException(
          `Address derivation mismatch: viem=${viemAccount.address}, expected=${nativeAddress}`
        );
      }

      const walletClient = createWalletClient({
        account: viemAccount,
        chain,
        transport: http(rpcUrl),
      }) as WalletClient;

      const mainWallet: MainWallet = {
        address: nativeAddress as Address,
        signTypedData: async (typedData: any) => {
          // Use viem account's signTypedData directly (uses eth_signTypedData_v4)
          return await viemAccount.signTypedData({
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
        },
      };

      const nitroliteClient = new NitroliteClient({
        wsUrl: this.wsUrl,
        mainWallet,
        publicClient,
        walletClient,
        useSessionKeys: true,
        application: 'tempwallets-lightning',
      });

      await nitroliteClient.initialize();
      this.userClients.set(cacheKey, nitroliteClient);
      return nitroliteClient;
    }

    const eip7702Factory = (this.walletService as any).eip7702AccountFactory;
    if (!eip7702Factory) {
      throw new BadRequestException('EIP-7702 Account Factory not available');
    }

    const eip7702Account: IAccount = await eip7702Factory.createAccount(
      seedPhrase,
      baseChain as 'ethereum' | 'base' | 'arbitrum' | 'optimism',
      0,
      userId,
    );

    const accountAddress = await eip7702Account.getAddress();
    const derivedMatchesInput = accountAddress.toLowerCase() === walletAddress.toLowerCase();

    this.logger.log(`[createNitroliteClient] 🔑 EIP-7702 derived address: ${accountAddress}`);
    this.logger.log(`[createNitroliteClient] 📋 Wallet address from cache: ${walletAddress}`);
    this.logger.log(`[createNitroliteClient] ✅ Address match: ${derivedMatchesInput}`);

    // ⚠️ If the persisted wallet address diverges from the signer (seed-derived) address,
    // use the signer (accountAddress) everywhere. A mismatch here will yield InvalidStateSignatures
    // when the adjudicator verifies state signatures because the recovered signer won't match
    // the participant address we send to Yellow Network.
    const canonicalAddress = accountAddress as Address;
    if (!derivedMatchesInput) {
      this.logger.warn(
        `[createNitroliteClient] Address mismatch detected. ` +
        `Using signer address ${canonicalAddress} instead of cached ${walletAddress} to keep signatures valid.`,
      );
    }

    this.logger.log(`[createNitroliteClient] 🎯 Using address for Yellow Network: ${canonicalAddress}`);
    
    const eip7702Wrapper = eip7702Account as any;
    const smartAccountClient = eip7702Wrapper.client;
    const eoaAccount = eip7702Wrapper.eoaAccount;

    if (!smartAccountClient) {
      throw new BadRequestException('Failed to get smart account client from EIP-7702 wrapper');
    }
    if (!eoaAccount) {
      throw new BadRequestException('Failed to get EOA account from EIP-7702 wrapper');
    }

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    }) as PublicClient;

    // NOTE: Using EOA wallet client to avoid EIP-1271 requirement in Nitrolite SDK channel creation
    // SmartAccount (permissionless SimpleAccount) was failing 1271 checks: "Simple account isn't 1271 compliant"
    const walletClient = createWalletClient({
      account: eoaAccount,
      chain,
      transport: http(rpcUrl),
    }) as WalletClient;

    const mainWallet: MainWallet = {
  address: canonicalAddress, // Use the signer address consistently
      signTypedData: async (typedData: any) => {
        const eoaAccount = eip7702Wrapper.eoaAccount;
        if (!eoaAccount || !eoaAccount.signTypedData) {
          throw new Error('EIP-7702 EOA account not available for signing');
        }
        return await eoaAccount.signTypedData({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
      },
    };

    const nitroliteClient = new NitroliteClient({
      wsUrl: this.wsUrl,
      mainWallet,
      publicClient,
      walletClient,
      useSessionKeys: true,
      application: 'tempwallets-lightning',
    });

    await nitroliteClient.initialize();
    this.userClients.set(cacheKey, nitroliteClient);

    return nitroliteClient;
  }

  /**
   * Authenticate user with Yellow Network
   * Returns session key data that can be cached on frontend
   */
  async authenticate(userId: string, chain: string) {
  const { address: userWalletAddress, isEOA, chainKey } = await this.getUserWalletAddress(userId, chain);
  // For channel creation, force native EOA mode to avoid 1271 issues on delegated 7702 accounts
  const nitroliteClient = await this.getUserNitroliteClient(userId, chain, userWalletAddress, isEOA, chainKey, { preferNativeEoa: true });

    // Get session key data from the authenticated client
    const sessionKeyData = (nitroliteClient as any).auth?.sessionKey;
    
    if (!sessionKeyData) {
      throw new BadRequestException('Authentication failed - no session key');
    }

    return {
      ok: true,
      authenticated: true,
      walletAddress: userWalletAddress,
      sessionKey: sessionKeyData.account.address,
      jwtToken: sessionKeyData.jwtToken,
      expiresAt: sessionKeyData.expiresAt,
      message: 'Authenticated with Yellow Network'
    };
  }

  async fundChannel(dto: FundChannelDto) {
    const { userId, chain, asset, amount } = dto;

    const { address: userWalletAddress, isEOA, chainKey } = await this.getUserWalletAddress(userId, chain);
    const nitroliteClient = await this.getUserNitroliteClient(userId, chain, userWalletAddress, isEOA, chainKey);

    try {
      const decimals = 6;
      const amountInSmallestUnits = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));

      const tokenAddressMap: Record<string, Record<string, Address>> = {
        base: {
          usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
          usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address,
        },
        arbitrum: {
          usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
          usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
        },
        ethereum: {
          usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
        },
      };

      const tokenAddress = tokenAddressMap[chain]?.[asset.toLowerCase()];
      if (!tokenAddress) {
        throw new BadRequestException(`Token ${asset} not supported on chain ${chain}`);
      }

      // Call depositToCustody on the NitroliteClient (which delegates to SDKChannelService)
      const depositTxHash = await nitroliteClient.depositToCustody(tokenAddress, amountInSmallestUnits);
      
      const publicClient = (nitroliteClient as any).publicClient;
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositTxHash });

      // Get updated custody balance
      const balance = await nitroliteClient.getCustodyBalance(tokenAddress);

      return {
        success: true,
        txHash: depositTxHash,
        blockNumber: receipt.blockNumber.toString(),
        balance: balance.toString(),
        balanceFormatted: (Number(balance) / Math.pow(10, decimals)).toFixed(decimals),
        asset,
        chain,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[Deposit] Failed: ${err.message}`);
      throw new BadRequestException(`Deposit failed: ${err.message}`);
    }
  }

  async getCustodyBalance(userId: string, chain: string, asset: string) {
    const { address: userWalletAddress, isEOA, chainKey } = await this.getUserWalletAddress(userId, chain);
    const nitroliteClient = await this.getUserNitroliteClient(userId, chain, userWalletAddress, isEOA, chainKey);

    try {
      const tokenAddressMap: Record<string, Record<string, Address>> = {
        base: {
          usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
          usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address,
        },
        arbitrum: {
          usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
          usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
        },
        ethereum: {
          usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
        },
      };

      const tokenAddress = tokenAddressMap[chain]?.[asset.toLowerCase()];
      if (!tokenAddress) {
        throw new BadRequestException(`Token ${asset} not supported on chain ${chain}`);
      }

      // Get custody balance using NitroliteClient method
      const balance = await nitroliteClient.getCustodyBalance(tokenAddress);
      const decimals = 6;

      return {
        success: true,
        balance: balance.toString(),
        balanceFormatted: (Number(balance) / Math.pow(10, decimals)).toFixed(decimals),
        asset,
        chain,
        walletAddress: userWalletAddress,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[Balance] Failed: ${err.message}`);
      throw new BadRequestException(`Failed to fetch balance: ${err.message}`);
    }
  }

  async getUnifiedBalance(userId: string, chain: string) {
    const { address: userWalletAddress, isEOA, chainKey } = await this.getUserWalletAddress(userId, chain);
    const nitroliteClient = await this.getUserNitroliteClient(userId, chain, userWalletAddress, isEOA, chainKey);

    try {
      // Get unified balance from Clearnode (off-chain balance)
      const balances = await nitroliteClient.getUnifiedBalance();
      
      this.logger.log(`[UnifiedBalance] Fetched ${balances.length} asset balances for user ${userId}`);
      
      return {
        success: true,
        balances,
        walletAddress: userWalletAddress,
        chain,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[UnifiedBalance] Failed: ${err.message}`);
      throw new BadRequestException(`Failed to fetch unified balance: ${err.message}`);
    }
  }

  /**
   * Resize channel - Move funds between Custody and Unified Balance
   * 
   * @param dto - ResizeChannelDto containing userId, chain, asset, amount, and destination
   * @returns Updated balances after resize
   */
  /**
   * Create Payment Channel
   *
   * Creates a 2-party channel between user and Clearnode.
   * This is the SECOND step after depositing to Custody.
   * After creating a channel, you can resize it to move funds to unified balance.
   */
  async createChannel(dto: { userId: string; chain: string; asset: string; initialDeposit?: string }) {
    const { userId, chain, asset, initialDeposit } = dto;

    const { address: userWalletAddress, isEOA, chainKey } = await this.getUserWalletAddress(userId, chain);
    const nitroliteClient = await this.getUserNitroliteClient(userId, chain, userWalletAddress, isEOA, chainKey);

    try {
      // Token address mapping
      const tokenAddressMap: Record<string, Record<string, Address>> = {
        base: {
          usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
          usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address,
        },
        arbitrum: {
          usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
          usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
        },
        ethereum: {
          usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
        },
        polygon: {
          usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as Address,
          usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as Address,
        },
      };

      const tokenAddress = tokenAddressMap[chain]?.[asset.toLowerCase()];
      if (!tokenAddress) {
        throw new BadRequestException(`Token ${asset} not supported on chain ${chain}`);
      }

      // Get chain ID from config
      const clearnodeConfig = nitroliteClient.getConfig();
      const network = clearnodeConfig.networks.find(n => n.name === chain);
      if (!network) {
        throw new BadRequestException(`Chain ${chain} not found in Clearnode config`);
      }
      const chainId = network.chain_id;

      this.logger.log(`[CreateChannel] Creating channel for user ${userWalletAddress}`);
      this.logger.log(`[CreateChannel] Chain: ${chain} (ID: ${chainId})`);
      this.logger.log(`[CreateChannel] Token: ${asset} (${tokenAddress})`);

      // Parse initial deposit if provided
      let depositAmount: bigint | undefined;
      if (initialDeposit && parseFloat(initialDeposit) > 0) {
        const decimals = 6; // USDC/USDT decimals
        depositAmount = BigInt(Math.floor(parseFloat(initialDeposit) * Math.pow(10, decimals)));
        this.logger.log(`[CreateChannel] Initial deposit: ${initialDeposit} ${asset} (${depositAmount} smallest units)`);
      }

      // Create channel via SDK
      const channel = await nitroliteClient.createChannel(
        chainId,
        tokenAddress,
        depositAmount,
      );

      this.logger.log(`[CreateChannel] ✅ Channel created successfully!`);
      this.logger.log(`[CreateChannel] Channel ID: ${channel.channelId}`);

      // Save channel to database
      await this.saveChannelToDB(userId, channel.channelId, chainId, chain, tokenAddress);

      // Fetch updated balances
      const [custodyBalance, unifiedBalances] = await Promise.all([
        nitroliteClient.getCustodyBalance(tokenAddress),
        nitroliteClient.getUnifiedBalance(),
      ]);

      const decimals = 6;
      return {
        success: true,
        message: 'Payment channel created successfully',
        channelId: channel.channelId,
        chainId: channel.chainId,
        participants: channel.participants,
        custodyBalance: custodyBalance.toString(),
        custodyBalanceFormatted: (Number(custodyBalance) / Math.pow(10, decimals)).toFixed(decimals),
        unifiedBalance: unifiedBalances,
      };
    } catch (error) {
      const err = error as Error;

      // Log full error details for debugging
      this.logger.error(`[CreateChannel] ❌ Failed with error:`, {
        message: err.message,
        name: err.name,
        stack: err.stack,
        raw: error,
      });

      // Re-throw with original error details preserved
      throw new BadRequestException({
        message: `Create channel failed: ${err.message}`,
        error: err.name,
        details: error,
      });
    }
  }

  async resizeChannel(dto: ResizeChannelDto) {
    const { userId, chain, asset, amount, destination } = dto;

  const { address: userWalletAddress, isEOA, chainKey } = await this.getUserWalletAddress(userId, chain);
  // For auto-create path, force native EOA mode to avoid 1271 failures on delegated addresses
  const nitroliteClient = await this.getUserNitroliteClient(userId, chain, userWalletAddress, isEOA, chainKey, { preferNativeEoa: true });
    const signerAddress = (nitroliteClient as any).getSignerAddress?.() || userWalletAddress;

    try {
      const decimals = 6;
      const amountInSmallestUnits = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));

      // Token address mapping
      const tokenAddressMap: Record<string, Record<string, Address>> = {
        base: {
          usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
          usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address,
        },
        arbitrum: {
          usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
          usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
        },
        ethereum: {
          usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
        },
      };

      const tokenAddress = tokenAddressMap[chain]?.[asset.toLowerCase()];
      if (!tokenAddress) {
        throw new BadRequestException(`Token ${asset} not supported on chain ${chain}`);
      }

      // Resolve chainId for resync fallback
      const clearnodeConfig = nitroliteClient.getConfig();
      const network = clearnodeConfig.networks.find(n => n.name === chain);
      if (!network) {
        throw new BadRequestException(`Chain ${chain} not found in Clearnode config`);
      }
      const targetChainId = network.chain_id;

      // Check database first for existing channel
      const storedChannel = await this.getExistingChannel(userId, targetChainId, tokenAddress);
      
      let activeChannelId: string | undefined;
      let allChannels: any[] = [];

      if (storedChannel) {
        this.logger.log(`[ResizeChannel] ✅ Found existing channel in database: ${storedChannel.channelId}`);
        activeChannelId = storedChannel.channelId;
        
        // Use stored channel directly
        allChannels = [{
          channelId: activeChannelId,
          chainId: targetChainId,
          participants: [signerAddress, 'CLEARNODE'],
          status: 'OPEN'
        }];
      } else {
        this.logger.log(`[ResizeChannel] No channel in database. Checking Yellow Network...`);
        
        // Get the active channel (filter by user to avoid noise)
        allChannels = await nitroliteClient.getChannels(signerAddress);
        if (!allChannels || allChannels.length === 0) {
          this.logger.warn(`[ResizeChannel] No channels returned for ${userWalletAddress}. Attempting resync...`);
          await nitroliteClient.resyncChannelState(targetChainId);
          allChannels = await nitroliteClient.getChannels(signerAddress);
        }

        // If still no channel, try to auto-create one when custody balance exists
        if (!allChannels || allChannels.length === 0) {
        this.logger.warn(`[ResizeChannel] Still no channel after resync. Checking custody balance to auto-create channel...`);
        const custodyBalance = await nitroliteClient.getCustodyBalance(tokenAddress);

        if (custodyBalance > BigInt(0)) {
          // STALE CHANNEL CLEANUP: Before auto-creating, check for stale/duplicate channels that block creation
          this.logger.log(`[ResizeChannel] 🧹 Checking for stale channels that might block creation...`);
          try {
            // Use QueryService to get ALL channels (unfiltered)
            const queryService = (nitroliteClient as any).queryService;
            if (queryService && typeof queryService.getAllChannelsUnfiltered === 'function') {
              const allUnfilteredChannels = await queryService.getAllChannelsUnfiltered();
              
              // Filter for user's channels on the target chain
              const userStaleChannels = allUnfilteredChannels.filter(ch => 
                ch.chainId === targetChainId &&
                ch.participants?.some(p => p.toLowerCase() === signerAddress.toLowerCase())
              );

              if (userStaleChannels.length > 0) {
                this.logger.warn(`[ResizeChannel] 🚨 Found ${userStaleChannels.length} stale channel(s) for user on chain ${targetChainId}`);
                
                // Attempt to close each stale channel
                for (const staleChannel of userStaleChannels) {
                  try {
                    this.logger.log(`[ResizeChannel] Attempting to close stale channel ${staleChannel.channelId}...`);
                    
                    // Get the channel's asset address from allocations or use current token
                    const assetAddress = tokenAddress; // Could be enhanced to extract from channel data
                    
                    await nitroliteClient.closeChannel(staleChannel.channelId, targetChainId, signerAddress, assetAddress);
                    this.logger.log(`[ResizeChannel] ✅ Successfully closed stale channel ${staleChannel.channelId}`);
                  } catch (closeErr) {
                    const errorMsg = closeErr instanceof Error ? closeErr.message : String(closeErr);
                    this.logger.error(`[ResizeChannel] ⚠️ Failed to close stale channel ${staleChannel.channelId}:`, errorMsg);
                    // Continue trying other channels
                  }
                }
                
                // Wait a moment for channel closure to propagate
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                this.logger.log(`[ResizeChannel] 🔄 Retrying channel creation after cleanup...`);
              } else {
                this.logger.log(`[ResizeChannel] ✅ No stale channels found`);
              }
            }
          } catch (cleanupErr) {
            const errorMsg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
            this.logger.error(`[ResizeChannel] ⚠️ Stale channel cleanup failed (non-fatal):`, errorMsg);
            // Continue with creation attempt anyway
          }

          // Smart-account guard relaxed: allow EIP-7702 delegated EOAs (bytecode present with ef0100 prefix).
          // Only block clearly non-1271 contract wallets to avoid false positives for 7702.
          const publicClient = (nitroliteClient as any).publicClient as PublicClient | undefined;
          if (publicClient) {
            const code = await publicClient.getBytecode({ address: signerAddress });

            // EIP-7702 delegation bytecode starts with 0xef0100 + delegation address; treat this as EOA-compatible.
            const isDelegated7702 = code && code.startsWith('0xef0100');
            const hasCode = code && code !== '0x';

            this.logger.log(`[ResizeChannel] Bytecode check for signer ${signerAddress}: hasCode=${!!hasCode}, isDelegated7702=${!!isDelegated7702}`);

            if (hasCode && !isDelegated7702) {
              // We don't see a 7702 delegation prefix; this is likely a contract wallet without 1271.
              this.logger.warn(`[ResizeChannel] Blocking auto-create: contract wallet detected without EIP-1271 (no 0xef0100 delegation prefix).`);
              throw new BadRequestException({
                message: 'Channel creation blocked: wallet is a smart account without EIP-1271 support.',
                error: 'SMART_ACCOUNT_NO_1271',
                details: {
                  userAddress: signerAddress,
                  hint: 'Use an EOA (EIP-7702 delegated EOA) or a smart account that implements isValidSignature (EIP-1271). Current account cannot validate channel state signatures.',
                }
              });
            }
          }

          // Use precise amount requested by user, or full custody balance (whichever is smaller)
          const amountToLock = amountInSmallestUnits < custodyBalance ? amountInSmallestUnits : custodyBalance;
          
          const decimals = 6;
          const custodyFormatted = (Number(custodyBalance) / Math.pow(10, decimals)).toFixed(decimals);
          const requestedFormatted = (Number(amountInSmallestUnits) / Math.pow(10, decimals)).toFixed(decimals);
          const lockFormatted = (Number(amountToLock) / Math.pow(10, decimals)).toFixed(decimals);
          
          this.logger.log(`[ResizeChannel] Custody balance: ${custodyFormatted} ${asset}`);
          this.logger.log(`[ResizeChannel] Requested amount: ${requestedFormatted} ${asset}`);
          this.logger.log(`[ResizeChannel] Creating channel with: ${lockFormatted} ${asset}...`);
          
          const newChannel = await nitroliteClient.createChannel(
            targetChainId, 
            tokenAddress, 
            amountToLock // Use precise amount requested by user
          );

          this.logger.log(`[ResizeChannel] ✅ Channel created with ${lockFormatted} ${asset} (ID: ${newChannel.channelId})`);

          // Save to database immediately
          await this.saveChannelToDB(userId, newChannel.channelId, targetChainId, chain, tokenAddress);

          // Update active channel ID
          activeChannelId = newChannel.channelId;

          // Update the list for downstream processing
          allChannels = [{
            channelId: newChannel.channelId,
            chainId: targetChainId,
            participants: [signerAddress, 'PENDING_PARTNER'], 
            status: 'OPEN'
          } as any];

       
        } else {
          throw new BadRequestException({
            message: 'No active channel found. Please create and fund a payment channel first.',
            error: 'CHANNEL_NOT_FOUND',
            details: {
              userAddress: userWalletAddress,
              custodyBalance: custodyBalance.toString(),
              hint: 'Steps: (1) Deposit to Custody (2) Create Channel (3) Resize Channel to move funds to Unified Balance',
            }
          });
        }
        }
      }

      // Use stored or found channel ID
      if (!activeChannelId && allChannels.length > 0) {
        // If we didn't get it from DB, extract from allChannels
        const userChannels = allChannels.filter(ch => 
          ch.participants?.some(p => p.toLowerCase() === signerAddress.toLowerCase())
        );
        if (userChannels.length > 0) {
          activeChannelId = userChannels[0].channelId;
        }
      }

      if (!activeChannelId) {
        throw new BadRequestException({
          message: 'No payment channel found for your wallet',
          error: 'CHANNEL_NOT_FOUND',
          details: {
            userAddress: userWalletAddress,
            hint: 'Create a channel first using the create-channel endpoint'
          }
        });
      }

      // Filter channels to find user's channel for verification
      const userChannels = allChannels.filter(ch => {
        // Check if user's address is in participants array
        if (ch.participants && ch.participants.length >= 1) {
          return ch.participants.some(p => p.toLowerCase() === signerAddress.toLowerCase());
        }
        return false;
      });

      this.logger.log(`[ResizeChannel] Found ${allChannels.length} total channels, ${userChannels.length} belong to signer ${signerAddress}`);

      // Use the stored/found channel or first user channel
      const activeChannel = userChannels.length > 0 ? userChannels[0] : null;
      if (!activeChannel || !activeChannelId) {
        throw new BadRequestException({
          message: 'No payment channel found for your wallet',
          error: 'CHANNEL_NOT_FOUND',
          details: {
            userAddress: userWalletAddress,
            totalChannels: allChannels.length,
            userChannels: userChannels.length,
            hint: 'Create a channel first using the create-channel endpoint'
          }
        });
      }

      const channelId = activeChannelId;
      const chainId = activeChannel.chainId || targetChainId;

      this.logger.log(`[ResizeChannel] Moving ${amount} ${asset} ${destination === 'unified' ? 'to unified balance' : 'to custody'}`);
      this.logger.log(`[ResizeChannel] Channel ID: ${channelId}`);
      this.logger.log(`[ResizeChannel] Chain ID: ${chainId}`);

  // Get Clearnode configuration for broker address
  const brokerAddress = clearnodeConfig.broker_address;
      this.logger.log(`[ResizeChannel] Broker Address: ${brokerAddress}`);

      // Determine resize parameters based on destination
      let resizeAmount: bigint;
      let fundsDestination: Address;

      if (destination === 'unified') {
        // Moving from Custody → Unified (allocate more to off-chain)
        resizeAmount = amountInSmallestUnits; // Positive = deposit direction
        fundsDestination = brokerAddress; // Funds go to Clearnode for off-chain ledger
      } else {
        // Moving from Unified → Custody (deallocate from off-chain)
        resizeAmount = -amountInSmallestUnits; // Negative = withdrawal direction
        fundsDestination = signerAddress; // Funds return to the signer wallet
      }

      // Call resizeChannel on NitroliteClient
      await nitroliteClient.resizeChannel(
        channelId as Hash,
        chainId,
        resizeAmount,
        fundsDestination,
        tokenAddress,
      );

      this.logger.log(`[ResizeChannel] ✅ Success!`);

      // Fetch updated balances
      const [custodyBalance, unifiedBalances] = await Promise.all([
        nitroliteClient.getCustodyBalance(tokenAddress),
        nitroliteClient.getUnifiedBalance(),
      ]);

      return {
        success: true,
        message: `Successfully moved ${amount} ${asset} ${destination === 'unified' ? 'to unified balance' : 'to custody'}`,
        channelId,
        custodyBalance: custodyBalance.toString(),
        custodyBalanceFormatted: (Number(custodyBalance) / Math.pow(10, decimals)).toFixed(decimals),
        unifiedBalance: unifiedBalances,
      };
    } catch (error) {
      const err = error as Error;

      // Log full error details for debugging
      this.logger.error(`[ResizeChannel] ❌ Failed with error:`, {
        message: err.message,
        name: err.name,
        stack: err.stack,
        raw: error,
      });

      // Re-throw with original error details preserved
      throw new BadRequestException({
        message: `Resize channel failed: ${err.message}`,
        error: err.name,
        details: error,
      });
    }
  }

  /**
   * Close Channel
   * 
   * Closes a payment channel and returns funds to custody.
   * If channelId is provided, closes that specific channel.
   * Otherwise, auto-detects and closes the user's channel for the given chain/asset.
   * 
   * @param dto { userId, chain, asset, channelId? }
   * @returns Closure status and details
   */
  async closeChannel(dto: { userId: string; chain: string; asset: string; channelId?: string }) {
    const { userId, chain, asset, channelId } = dto;

    const { address: userWalletAddress, isEOA, chainKey } = await this.getUserWalletAddress(userId, chain);
    const nitroliteClient = await this.getUserNitroliteClient(userId, chain, userWalletAddress, isEOA, chainKey, { preferNativeEoa: true });
    const signerAddress = (nitroliteClient as any).getSignerAddress?.() || userWalletAddress;

    try {
      // Token address mapping
      const tokenAddressMap: Record<string, Record<string, Address>> = {
        base: {
          usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
          usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address,
        },
        arbitrum: {
          usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
          usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
        },
        ethereum: {
          usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
          usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
        },
      };

      const tokenAddress = tokenAddressMap[chain]?.[asset.toLowerCase()];
      if (!tokenAddress) {
        throw new BadRequestException(`Token ${asset} not supported on chain ${chain}`);
      }

      // Resolve chainId
      const clearnodeConfig = nitroliteClient.getConfig();
      const network = clearnodeConfig.networks.find(n => n.name === chain);
      if (!network) {
        throw new BadRequestException(`Chain ${chain} not found in Clearnode config`);
      }
      const targetChainId = network.chain_id;

      // If channelId not provided, auto-detect user's channel
      let targetChannelId = channelId as Hash | undefined;
      if (!targetChannelId) {
        this.logger.log(`[CloseChannel] No channelId provided, auto-detecting user's channel...`);
        
        const allChannels = await nitroliteClient.getChannels(signerAddress);
        const userChannels = allChannels.filter(ch => 
          ch.chainId === targetChainId &&
          ch.participants?.some(p => p.toLowerCase() === signerAddress.toLowerCase())
        );

        if (userChannels.length === 0) {
          throw new BadRequestException({
            message: 'No channel found for this user/chain/asset combination',
            error: 'CHANNEL_NOT_FOUND',
            details: {
              userAddress: signerAddress,
              chain,
              chainId: targetChainId,
              asset,
            }
          });
        }

        if (userChannels.length > 1) {
          this.logger.warn(`[CloseChannel] Found ${userChannels.length} channels, closing the first one`);
        }

        targetChannelId = userChannels[0]!.channelId;
        this.logger.log(`[CloseChannel] Auto-detected channel: ${targetChannelId}`);
      }

      // Close the channel
      this.logger.log(`[CloseChannel] Closing channel ${targetChannelId} on chain ${targetChainId}...`);
      await nitroliteClient.closeChannel(targetChannelId as Hash, targetChainId, signerAddress as Address, tokenAddress);

      this.logger.log(`[CloseChannel] ✅ Channel closed successfully`);

      // Mark channel as closed in database
      await this.markChannelClosed(targetChannelId);

      return {
        success: true,
        message: `Channel ${targetChannelId} closed successfully`,
        channelId: targetChannelId,
        chain,
        chainId: targetChainId,
        asset,
        tokenAddress,
      };
    } catch (error) {
      const err = error as Error;

      this.logger.error(`[CloseChannel] ❌ Failed with error:`, {
        message: err.message,
        name: err.name,
        stack: err.stack,
        raw: error,
      });

      throw new BadRequestException({
        message: `Close channel failed: ${err.message}`,
        error: err.name,
        details: error,
      });
    }
  }

  /**
   * Cleanup method to disconnect all cached clients
   * Call this when user logs out or when cleaning up resources
   */
  async disconnectAllClients(): Promise<void> {
    console.log(`[LightningNodeService] Disconnecting ${this.userClients.size} cached clients...`);
    
    for (const [key, client] of this.userClients.entries()) {
      try {
        await client.disconnect();
        console.log(`[LightningNodeService] ✅ Disconnected client: ${key}`);
      } catch (err) {
        console.error(`[LightningNodeService] ❌ Error disconnecting ${key}:`, err);
      }
    }
    
    this.userClients.clear();
    console.log(`[LightningNodeService] All clients disconnected and cache cleared`);
  }

  /**
   * Disconnect a specific user's client
   */
  async disconnectUserClient(userId: string, chain: string): Promise<void> {
    const pattern = `${userId}-${chain}`;
    console.log(`[LightningNodeService] Looking for clients matching: ${pattern}`);
    
    for (const [key, client] of this.userClients.entries()) {
      if (key.startsWith(pattern)) {
        try {
          await client.disconnect();
          this.userClients.delete(key);
          console.log(`[LightningNodeService] ✅ Disconnected and removed: ${key}`);
        } catch (err) {
          console.error(`[LightningNodeService] ❌ Error disconnecting ${key}:`, err);
        }
      }
    }
  }
}
