import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { base, mainnet, arbitrum } from 'viem/chains';
import { NitroliteClient, type MainWallet } from '../services/yellow-network/index.js';
import type { FundChannelDto } from './dto/index.js';
import { SeedRepository } from '../wallet/seed.repository.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { IAccount } from '../wallet/types/account.types.js';

@Injectable()
export class LightningNodeService {
  private readonly logger = new Logger(LightningNodeService.name);
  private wsUrl: string;
  private userClients: Map<string, NitroliteClient> = new Map();

  constructor(
    private configService: ConfigService,
    private seedRepository: SeedRepository,
    private walletService: WalletService,
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

  private async getUserWalletAddress(userId: string, chainName: string): Promise<{ address: Address; isEOA: boolean; chainKey: string }> {
    const baseChain = chainName.toLowerCase().replace(/erc4337$/i, '');
    const allAddresses = await this.walletService.getAddresses(userId);
    
    let walletAddress = allAddresses[baseChain as keyof typeof allAddresses];
    let isEOA = true;
    let chainKey = baseChain;

    if (!walletAddress) {
      const erc4337Chain = `${baseChain}Erc4337`;
      walletAddress = allAddresses[erc4337Chain as keyof typeof allAddresses];
      if (walletAddress) {
        isEOA = false;
        chainKey = erc4337Chain;
      }
    }

    if (!walletAddress) {
      throw new BadRequestException(`No wallet address found for chain ${chainName}`);
    }

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
  ): Promise<NitroliteClient> {
    const cacheKey = `${userId}-${chainName}-${walletAddress}`;

    // Add debug logging to track client instances
    console.log(`[LightningNodeService] getUserNitroliteClient called for ${cacheKey}`);
    console.log(`[LightningNodeService] Cache has key: ${this.userClients.has(cacheKey)}`);
    console.log(`[LightningNodeService] Total cached clients: ${this.userClients.size}`);

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

    console.log(`[LightningNodeService] 🔄 Creating NEW client for ${cacheKey}`);

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
    const eip7702Wrapper = eip7702Account as any;
    const smartAccountClient = eip7702Wrapper.client;

    if (!smartAccountClient) {
      throw new BadRequestException('Failed to get smart account client from EIP-7702 wrapper');
    }

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    }) as PublicClient;

    const walletClient = smartAccountClient as WalletClient;

    const mainWallet: MainWallet = {
      address: accountAddress as Address,
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
    const nitroliteClient = await this.getUserNitroliteClient(userId, chain, userWalletAddress, isEOA, chainKey);

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

      const sdkClient = (nitroliteClient as any).channelService?.sdkClient;
      if (!sdkClient) {
        throw new Error('SDK client not available');
      }

      const depositTxHash = await sdkClient.depositToCustody(tokenAddress, amountInSmallestUnits);
      
      const publicClient = (nitroliteClient as any).publicClient;
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositTxHash });

      const balance = await sdkClient.getAccountBalance(tokenAddress);

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

      const sdkClient = (nitroliteClient as any).channelService?.sdkClient;
      if (!sdkClient) {
        throw new Error('SDK client not available');
      }

      const balance = await sdkClient.getAccountBalance(tokenAddress);
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
