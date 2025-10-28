import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { createEncryptedWalletSecrets, decryptWalletSecrets, type DecryptedWalletData } from '@repo/wallet-sdk';
import { WalletFactory } from '@repo/wallet-sdk';
import { CHAIN_CONFIGS, getChainConfig } from '@repo/wallet-sdk';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a multi-chain wallet for a user
   * @param userId - The user ID
   * @param passkey - User passkey for encryption
   * @returns The created wallet with all chain addresses
   */
  async createWallet(userId: string, passkey: string) {
    try {
      // Generate encrypted secrets
      const walletSecrets = await createEncryptedWalletSecrets(passkey);

      // Create wallet in database
      const wallet = await this.prisma.wallet.create({
        data: {
          userId,
          salt: walletSecrets.salt,
          encryptedSeed: walletSecrets.encryptedSeed.toString('hex'),
          encryptedEntropy: walletSecrets.encryptedEntropy.toString('hex'),
        },
      });

        // Decrypt temporarily to create wallet addresses
        let decrypted: DecryptedWalletData | null = null;
        try {
          decrypted = decryptWalletSecrets(
            {
              salt: walletSecrets.salt,
              encryptedSeed: walletSecrets.encryptedSeed,
              encryptedEntropy: walletSecrets.encryptedEntropy,
            },
            passkey
          );

          // Create a single wallet and derive addresses for all chains
          const factory = new WalletFactory();
          const chainConfigs = {
            ethereum: getChainConfig('ethereum', {
              bundlerUrl: process.env.ETH_BUNDLER_URL || '',
              paymasterUrl: process.env.ETH_PAYMASTER_URL || '',
              paymasterAddress: process.env.ETH_PAYMASTER_ADDRESS || '',
              rpcUrl: process.env.ETH_RPC_URL || '',
            }),
            base: getChainConfig('base', {
              bundlerUrl: process.env.BASE_BUNDLER_URL || '',
              paymasterUrl: process.env.BASE_PAYMASTER_URL || '',
              paymasterAddress: process.env.BASE_PAYMASTER_ADDRESS || '',
              rpcUrl: process.env.BASE_RPC_URL || '',
            }),
            arbitrum: getChainConfig('arbitrum', {
              bundlerUrl: process.env.ARB_BUNDLER_URL || '',
              paymasterUrl: process.env.ARB_PAYMASTER_URL || '',
              paymasterAddress: process.env.ARB_PAYMASTER_ADDRESS || '',
              rpcUrl: process.env.ARB_RPC_URL || '',
            }),
            avalanche: getChainConfig('avalanche', {
              bundlerUrl: process.env.AVA_BUNDLER_URL || '',
              paymasterUrl: process.env.AVA_PAYMASTER_URL || '',
              paymasterAddress: process.env.AVA_PAYMASTER_ADDRESS || '',
              rpcUrl: process.env.AVA_RPC_URL || '',
            }),
          };

          const addresses: Array<{ chain: string; address: string }> = [];
          const walletInstances: Array<{ chain: string; instance: any; address: string }> = [];

          // Derive addresses for all chains from the same mnemonic
          for (const [chainName, config] of Object.entries(chainConfigs)) {
            const walletInstance = await factory.createWallet(decrypted.mnemonic, config);
            
            // Store in database
            await this.prisma.walletAddress.create({
              data: {
                walletId: wallet.id,
                chain: chainName,
                address: walletInstance.address,
              },
            });

            addresses.push({
              chain: chainName,
              address: walletInstance.address,
            });
            
            walletInstances.push({
              chain: chainName,
              instance: walletInstance.wallet,
              address: walletInstance.address,
            });
          }
          
          // Dispose all instances at the end
          walletInstances.forEach(({ instance }) => {
            if (instance && typeof instance.dispose === 'function') {
              instance.dispose();
            }
          });

          return {
            walletId: wallet.id,
            addresses,
          };
        } finally {
          // Ensure decrypted data is cleared from memory
          if (decrypted) {
            // The secret manager's dispose() was already called in decryptWalletSecrets
          }
        }
    } catch (error) {
      this.logger.error(`Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get wallet addresses for all chains
   * @param walletId - The wallet ID
   * @returns List of addresses by chain
   */
  async getWalletAddresses(walletId: string) {
    const addresses = await this.prisma.walletAddress.findMany({
      where: { walletId },
      select: {
        chain: true,
        address: true,
      },
    });

    if (addresses.length === 0) {
      throw new NotFoundException(`No addresses found for wallet ${walletId}`);
    }

    return addresses;
  }

  /**
   * Get a wallet instance for a specific chain for transactions
   * @param walletId - The wallet ID
   * @param passkey - User passkey
   * @param chain - The chain to get the wallet for
   * @returns Wallet instance ready for transactions
   */
  async getWalletInstanceForChain(walletId: string, passkey: string, chain: string) {
    const decrypted = await this.decryptAndLoadWallet(walletId, passkey);
    const factory = new WalletFactory();
    
    // Get the chain configuration
    const chainConfigs: Record<string, any> = {
      ethereum: getChainConfig('ethereum', {
        bundlerUrl: process.env.ETH_BUNDLER_URL || '',
        paymasterUrl: process.env.ETH_PAYMASTER_URL || '',
        paymasterAddress: process.env.ETH_PAYMASTER_ADDRESS || '',
        rpcUrl: process.env.ETH_RPC_URL || '',
      }),
      base: getChainConfig('base', {
        bundlerUrl: process.env.BASE_BUNDLER_URL || '',
        paymasterUrl: process.env.BASE_PAYMASTER_URL || '',
        paymasterAddress: process.env.BASE_PAYMASTER_ADDRESS || '',
        rpcUrl: process.env.BASE_RPC_URL || '',
      }),
      arbitrum: getChainConfig('arbitrum', {
        bundlerUrl: process.env.ARB_BUNDLER_URL || '',
        paymasterUrl: process.env.ARB_PAYMASTER_URL || '',
        paymasterAddress: process.env.ARB_PAYMASTER_ADDRESS || '',
        rpcUrl: process.env.ARB_RPC_URL || '',
      }),
      avalanche: getChainConfig('avalanche', {
        bundlerUrl: process.env.AVA_BUNDLER_URL || '',
        paymasterUrl: process.env.AVA_PAYMASTER_URL || '',
        paymasterAddress: process.env.AVA_PAYMASTER_ADDRESS || '',
        rpcUrl: process.env.AVA_RPC_URL || '',
      }),
    };
    
    const config = chainConfigs[chain];
    if (!config) {
      throw new Error(`Unsupported chain: ${chain}`);
    }
    
    return await factory.createWallet(decrypted.mnemonic, config);
  }

  /**
   * Decrypt and load wallet for operations
   * @param walletId - The wallet ID
   * @param passkey - User passkey
   * @returns Decrypted wallet data (use with caution, dispose after use)
   */
  async decryptAndLoadWallet(walletId: string, passkey: string): Promise<DecryptedWalletData> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    // Convert hex strings back to buffers
    const encryptedPayload = {
      salt: wallet.salt,
      encryptedSeed: Buffer.from(wallet.encryptedSeed, 'hex'),
      encryptedEntropy: Buffer.from(wallet.encryptedEntropy, 'hex'),
    };

    return decryptWalletSecrets(encryptedPayload, passkey);
  }

  /**
   * Get wallet by ID
   */
  async getWalletById(walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        addresses: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    return wallet;
  }
}

