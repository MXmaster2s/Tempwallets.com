import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import WalletManagerTron from '@tetherto/wdk-wallet-tron';
import WalletManagerBtc from '@tetherto/wdk-wallet-btc';
import WalletManagerSolana from '@tetherto/wdk-wallet-solana';
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337';
import { SeedRepository } from './seed.repository.js';

export interface WalletAddresses {
  ethereum: string;
  tron: string;
  bitcoin: string;
  solana: string;
  ethereumErc4337: string;
  baseErc4337: string;
  arbitrumErc4337: string;
  polygonErc4337: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private seedRepository: SeedRepository,
    private configService: ConfigService,
  ) {}

  /**
   * Create or import a wallet seed phrase
   * @param userId - The user ID
   * @param mode - Either 'random' to generate or 'mnemonic' to import
   * @param mnemonic - The mnemonic phrase (required if mode is 'mnemonic')
   */
  async createOrImportSeed(
    userId: string,
    mode: 'random' | 'mnemonic',
    mnemonic?: string,
  ): Promise<void> {
    let seedPhrase: string;

    if (mode === 'random') {
      seedPhrase = WDK.getRandomSeedPhrase();
      this.logger.log(`Generated random seed phrase for user ${userId}`);
    } else if (mode === 'mnemonic') {
      if (!mnemonic) {
        throw new BadRequestException('Mnemonic is required when mode is "mnemonic"');
      }
      // Basic validation - should be 12 or 24 words
      const words = mnemonic.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        throw new BadRequestException('Mnemonic must be 12 or 24 words');
      }
      seedPhrase = mnemonic;
      this.logger.log(`Imported mnemonic for user ${userId}`);
    } else {
      throw new BadRequestException('Mode must be either "random" or "mnemonic"');
    }

    await this.seedRepository.createOrUpdateSeed(userId, seedPhrase);
  }

  /**
   * Get all wallet addresses for all chains
   * Auto-creates wallet if it doesn't exist
   * @param userId - The user ID
   * @returns Object containing addresses for all chains
   */
  async getAddresses(userId: string): Promise<WalletAddresses> {
    // Check if wallet exists, create if not
    const hasSeed = await this.seedRepository.hasSeed(userId);
    
    if (!hasSeed) {
      this.logger.log(`No wallet found for user ${userId}. Auto-creating...`);
      await this.createOrImportSeed(userId, 'random');
      this.logger.log(`Successfully auto-created wallet for user ${userId}`);
    }

    const seedPhrase = await this.seedRepository.getSeedPhrase(userId);

    const wdk = this.createWdkInstance(seedPhrase);

    const accounts = {
      ethereum: await wdk.getAccount('ethereum', 0),
      tron: await wdk.getAccount('tron', 0),
      bitcoin: await wdk.getAccount('bitcoin', 0),
      solana: await wdk.getAccount('solana', 0),
      ethereumErc4337: await wdk.getAccount('ethereum-erc4337', 0),
      baseErc4337: await wdk.getAccount('base-erc4337', 0),
      arbitrumErc4337: await wdk.getAccount('arbitrum-erc4337', 0),
      polygonErc4337: await wdk.getAccount('polygon-erc4337', 0),
    };

    const addresses: Partial<WalletAddresses> = {};

    for (const [chain, account] of Object.entries(accounts)) {
      try {
        const address = await account.getAddress();
        addresses[chain as keyof WalletAddresses] = address;
        this.logger.log(`Successfully got address for ${chain}: ${address}`);
      } catch (error) {
        this.logger.error(`Error getting address for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        addresses[chain as keyof WalletAddresses] = null as any;
      }
    }

    return addresses as WalletAddresses;
  }

  /**
   * Get balances for all chains
   * Auto-creates wallet if it doesn't exist
   * @param userId - The user ID
   * @returns Array of balance objects
   */
  async getBalances(userId: string): Promise<Array<{ chain: string; balance: string }>> {
    // Check if wallet exists, create if not
    const hasSeed = await this.seedRepository.hasSeed(userId);
    
    if (!hasSeed) {
      this.logger.log(`No wallet found for user ${userId}. Auto-creating...`);
      await this.createOrImportSeed(userId, 'random');
      this.logger.log(`Successfully auto-created wallet for user ${userId}`);
    }

    const seedPhrase = await this.seedRepository.getSeedPhrase(userId);
    const wdk = this.createWdkInstance(seedPhrase);

    const accounts = {
      ethereum: await wdk.getAccount('ethereum', 0),
      tron: await wdk.getAccount('tron', 0),
      bitcoin: await wdk.getAccount('bitcoin', 0),
      solana: await wdk.getAccount('solana', 0),
      ethereumErc4337: await wdk.getAccount('ethereum-erc4337', 0),
      baseErc4337: await wdk.getAccount('base-erc4337', 0),
      arbitrumErc4337: await wdk.getAccount('arbitrum-erc4337', 0),
      polygonErc4337: await wdk.getAccount('polygon-erc4337', 0),
    };

    const balances: Array<{ chain: string; balance: string }> = [];

    for (const [chain, account] of Object.entries(accounts)) {
      try {
        const balance = await account.getBalance();
        balances.push({
          chain,
          balance: balance.toString(),
        });
        this.logger.log(`Successfully got balance for ${chain}: ${balance.toString()}`);
      } catch (error) {
        this.logger.error(`Error fetching balance for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        balances.push({
          chain,
          balance: '0',
        });
      }
    }

    return balances;
  }

  /**
   * Get ERC-4337 paymaster token balances
   * @param userId - The user ID
   * @returns Array of paymaster token balances
   */
  async getErc4337PaymasterBalances(
    userId: string,
  ): Promise<Array<{ chain: string; balance: string }>> {
    const seedPhrase = await this.seedRepository.getSeedPhrase(userId);
    const wdk = this.createWdkInstance(seedPhrase);

    const erc4337Accounts = {
      Ethereum: await wdk.getAccount('ethereum-erc4337', 0),
      Base: await wdk.getAccount('base-erc4337', 0),
      Arbitrum: await wdk.getAccount('arbitrum-erc4337', 0),
      Polygon: await wdk.getAccount('polygon-erc4337', 0),
    };

    const balances: Array<{ chain: string; balance: string }> = [];

    for (const [chainName, account] of Object.entries(erc4337Accounts)) {
      try {
        // Try to get paymaster token balance if the method exists
        const balance = 'getPaymasterTokenBalance' in account
          ? await (account as any).getPaymasterTokenBalance()
          : null;
        
        balances.push({
          chain: chainName,
          balance: balance ? balance.toString() : '0',
        });
      } catch (error) {
        this.logger.error(`Error fetching paymaster balance for ${chainName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        balances.push({
          chain: chainName,
          balance: '0',
        });
      }
    }

    return balances;
  }

  /**
   * Create a WDK instance with all wallet managers registered
   * @param seedPhrase - The seed phrase
   * @returns Configured WDK instance
   */
  private createWdkInstance(seedPhrase: string) {
    return new WDK(seedPhrase)
      .registerWallet('ethereum', WalletManagerEvm, {
        provider: this.configService.get<string>('ETH_RPC_URL') || 'https://eth.llamarpc.com',
      })
      .registerWallet('tron', WalletManagerTron, {
        provider: this.configService.get<string>('TRON_RPC_URL') || 'https://api.trongrid.io',
      })
      .registerWallet('bitcoin', WalletManagerBtc as any, {
        provider: this.configService.get<string>('BTC_RPC_URL') || 'https://blockstream.info/api',
      })
      .registerWallet('solana', WalletManagerSolana, {
        rpcUrl: this.configService.get<string>('SOL_RPC_URL') || 'https://api.mainnet-beta.solana.com',
      })
      .registerWallet('ethereum-erc4337', WalletManagerEvmErc4337, {
        chainId: 1,
        provider: this.configService.get<string>('ETH_ERC4337_RPC_URL') || 'https://eth.llamarpc.com',
        bundlerUrl: this.configService.get<string>('ETH_BUNDLER_URL') || 'https://api.candide.dev/public/v3/ethereum',
        paymasterUrl: this.configService.get<string>('ETH_PAYMASTER_URL') || 'https://api.candide.dev/public/v3/ethereum',
        paymasterAddress: this.configService.get<string>('ETH_PAYMASTER_ADDRESS') || '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
        entryPointAddress: this.configService.get<string>('ENTRY_POINT_ADDRESS') || '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        safeModulesVersion: this.configService.get<string>('SAFE_MODULES_VERSION') || '0.3.0',
        paymasterToken: {
          address: this.configService.get<string>('ETH_PAYMASTER_TOKEN') || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
        transferMaxFee: parseInt(this.configService.get<string>('TRANSFER_MAX_FEE') || '100000000000000'),
      })
      .registerWallet('base-erc4337', WalletManagerEvmErc4337, {
        chainId: 8453,
        provider: this.configService.get<string>('BASE_RPC_URL') || 'https://mainnet.base.org',
        bundlerUrl: this.configService.get<string>('BASE_BUNDLER_URL') || 'https://api.candide.dev/public/v3/base',
        paymasterUrl: this.configService.get<string>('BASE_PAYMASTER_URL') || 'https://api.candide.dev/public/v3/base',
        paymasterAddress: this.configService.get<string>('BASE_PAYMASTER_ADDRESS') || '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
        entryPointAddress: this.configService.get<string>('ENTRY_POINT_ADDRESS') || '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        safeModulesVersion: this.configService.get<string>('SAFE_MODULES_VERSION') || '0.3.0',
        paymasterToken: {
          address: this.configService.get<string>('BASE_PAYMASTER_TOKEN') || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        },
        transferMaxFee: parseInt(this.configService.get<string>('TRANSFER_MAX_FEE') || '100000000000000'),
      })
      .registerWallet('arbitrum-erc4337', WalletManagerEvmErc4337, {
        chainId: 42161,
        provider: this.configService.get<string>('ARB_RPC_URL') || 'https://arb1.arbitrum.io/rpc',
        bundlerUrl: this.configService.get<string>('ARB_BUNDLER_URL') || 'https://api.candide.dev/public/v3/arbitrum',
        paymasterUrl: this.configService.get<string>('ARB_PAYMASTER_URL') || 'https://api.candide.dev/public/v3/arbitrum',
        paymasterAddress: this.configService.get<string>('ARB_PAYMASTER_ADDRESS') || '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
        entryPointAddress: this.configService.get<string>('ENTRY_POINT_ADDRESS') || '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        safeModulesVersion: this.configService.get<string>('SAFE_MODULES_VERSION') || '0.3.0',
        paymasterToken: {
          address: this.configService.get<string>('ARB_PAYMASTER_TOKEN') || '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        },
        transferMaxFee: parseInt(this.configService.get<string>('TRANSFER_MAX_FEE') || '100000000000000'),
      })
      .registerWallet('polygon-erc4337', WalletManagerEvmErc4337, {
        chainId: 137,
        provider: this.configService.get<string>('POLYGON_RPC_URL') || 'https://polygon-rpc.com',
        bundlerUrl: this.configService.get<string>('POLYGON_BUNDLER_URL') || 'https://api.candide.dev/public/v3/polygon',
        paymasterUrl: this.configService.get<string>('POLYGON_PAYMASTER_URL') || 'https://api.candide.dev/public/v3/polygon',
        paymasterAddress: this.configService.get<string>('POLYGON_PAYMASTER_ADDRESS') || '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
        entryPointAddress: this.configService.get<string>('ENTRY_POINT_ADDRESS') || '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        safeModulesVersion: this.configService.get<string>('SAFE_MODULES_VERSION') || '0.3.0',
        paymasterToken: {
          address: this.configService.get<string>('POLYGON_PAYMASTER_TOKEN') || '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        },
        transferMaxFee: parseInt(this.configService.get<string>('TRANSFER_MAX_FEE') || '100000000000000'),
      });
  }
}

