import { Injectable, Logger } from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createWalletClient,
  http,
  type TransactionRequest,
  type Hex,
} from 'viem';
import * as chains from 'viem/chains';
import { AddressManager } from '../../managers/address.manager.js';
import { SeedManager } from '../../managers/seed.manager.js';
import { ChainConfigService } from '../../config/chain.config.js';
import { AccountFactory } from '../../factories/account.factory.js';
import { mnemonicToAccount } from 'viem/accounts';
import { EvmTypedData } from '../dto/evm-walletconnect.dto.js';

/**
 * EVM WalletConnect Service
 *
 * Handles WalletConnect/Reown operations for EVM chains:
 * - Transaction signing
 * - Message signing (personal_sign)
 * - Typed data signing (EIP-712)
 * - Account formatting (CAIP-10)
 */
@Injectable()
export class EvmWalletConnectService {
  private readonly logger = new Logger(EvmWalletConnectService.name);

  // Map internal chain names to EVM chain IDs
  private readonly CHAIN_ID_MAP: Record<string, number> = {
    ethereum: 1,
    base: 8453,
    arbitrum: 42161,
    polygon: 137,
    avalanche: 43114,
    moonbeamTestnet: 420420422,
    astarShibuya: 81,
    paseoPassetHub: 420420422,
    hydration: 222222,
    unique: 8880,
    bifrost: 3068,
    bifrostTestnet: 49088,
  };

  // Map chain names to viem chain objects
  private readonly VIEM_CHAINS: Record<string, any> = {
    ethereum: chains.mainnet,
    base: chains.base,
    arbitrum: chains.arbitrum,
    polygon: chains.polygon,
    avalanche: chains.avalanche,
    // For chains not in viem, we'll create custom chain objects using ChainConfigService
  };

  constructor(
    private readonly addressManager: AddressManager,
    private readonly seedManager: SeedManager,
    private readonly chainConfigService: ChainConfigService,
    private readonly accountFactory: AccountFactory,
  ) {}

  /**
   * Format EVM address to CAIP-10 account ID
   * Format: eip155:<chain_id>:<address>
   */
  formatAccountId(chainName: string, address: string): string {
    const chainId = this.CHAIN_ID_MAP[chainName];
    if (!chainId) {
      throw new Error(`Unsupported chain: ${chainName}`);
    }
    return `eip155:${chainId}:${address}`;
  }

  /**
   * Parse CAIP-10 account ID to extract chain ID and address
   */
  parseAccountId(
    accountId: string,
  ): { chainId: number; address: string; chainName: string | null } | null {
    // Format: eip155:<chain_id>:<address>
    const parts = accountId.split(':');
    if (parts.length !== 3 || parts[0] !== 'eip155') {
      return null;
    }

    const chainIdStr = parts[1];
    const address = parts[2];

    if (!chainIdStr || !address) {
      return null;
    }

    const chainId = parseInt(chainIdStr, 10);
    if (isNaN(chainId)) {
      return null;
    }

    // Find chain name by chain ID
    const chainName =
      Object.entries(this.CHAIN_ID_MAP).find(
        ([_, id]) => id === chainId,
      )?.[0] || null;

    return { chainId, address, chainName };
  }

  /**
   * Sign an EVM transaction for WalletConnect
   *
   * @param userId - User ID
   * @param accountId - CAIP-10 account ID (eip155:<chain_id>:<address>)
   * @param transaction - Transaction parameters
   * @param useTestnet - Whether to use testnet
   * @returns Signed transaction or signature
   */
  async signTransaction(
    userId: string,
    accountId: string,
    transaction: TransactionRequest,
    useTestnet: boolean = false,
  ): Promise<{ signature: string }> {
    this.logger.log(
      `Signing EVM transaction for user ${userId}, account ${accountId}`,
    );

    const parsed = this.parseAccountId(accountId);
    if (!parsed || !parsed.chainName) {
      throw new Error(`Invalid account ID format: ${accountId}`);
    }

    const { chainId, address, chainName } = parsed;

    // Verify the address belongs to the user
    const userAddress = await this.addressManager.getAddressForChain(
      userId,
      chainName as any,
    );
    if (userAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`Address ${address} does not belong to user ${userId}`);
    }

    // Get seed phrase and derive account
    const seedPhrase = await this.seedManager.getSeed(userId);

    try {
      // Derive account from seed phrase
      const account = mnemonicToAccount(seedPhrase, {
        addressIndex: 0,
      });

      // Get chain configuration
      const viemChain = this.getViemChain(chainName);

      // Create wallet client
      const walletClient = createWalletClient({
        account,
        chain: viemChain,
        transport: http(viemChain.rpcUrls.default.http[0]),
      });

      // Sign the transaction
      const signature = await walletClient.signTransaction({
        ...transaction,
        account,
        chain: viemChain,
      } as any);

      return { signature };
    } finally {
      // Clear seed from memory (best effort)
      (seedPhrase as any) = '';
    }
  }

  /**
   * Sign a message using personal_sign
   *
   * @param userId - User ID
   * @param accountId - CAIP-10 account ID (eip155:<chain_id>:<address>)
   * @param message - Message to sign (hex-encoded or plain text)
   * @param useTestnet - Whether to use testnet
   * @returns Signature
   */
  async signMessage(
    userId: string,
    accountId: string,
    message: string,
    useTestnet: boolean = false,
  ): Promise<{ signature: string }> {
    this.logger.log(
      `Signing EVM message for user ${userId}, account ${accountId}`,
    );

    const parsed = this.parseAccountId(accountId);
    if (!parsed || !parsed.chainName) {
      throw new Error(`Invalid account ID format: ${accountId}`);
    }

    const { address, chainName } = parsed;

    // Verify the address belongs to the user
    const userAddress = await this.addressManager.getAddressForChain(
      userId,
      chainName as any,
    );
    if (userAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`Address ${address} does not belong to user ${userId}`);
    }

    // Get seed phrase and derive account
    const seedPhrase = await this.seedManager.getSeed(userId);

    try {
      // Derive account from seed phrase
      const account = mnemonicToAccount(seedPhrase, {
        addressIndex: 0,
      });

      // Sign the message using personal_sign format
      const signature = await account.signMessage({
        message: message as any,
      });

      return { signature };
    } finally {
      // Clear seed from memory (best effort)
      (seedPhrase as any) = '';
    }
  }

  /**
   * Sign typed data using EIP-712
   *
   * @param userId - User ID
   * @param accountId - CAIP-10 account ID (eip155:<chain_id>:<address>)
   * @param typedData - EIP-712 typed data structure
   * @param useTestnet - Whether to use testnet
   * @returns Signature
   */
  async signTypedData(
    userId: string,
    accountId: string,
    typedData: EvmTypedData,
    useTestnet: boolean = false,
  ): Promise<{ signature: string }> {
    this.logger.log(
      `Signing EVM typed data for user ${userId}, account ${accountId}`,
    );

    const parsed = this.parseAccountId(accountId);
    if (!parsed || !parsed.chainName) {
      throw new Error(`Invalid account ID format: ${accountId}`);
    }

    const { address, chainName } = parsed;

    // Verify the address belongs to the user
    const userAddress = await this.addressManager.getAddressForChain(
      userId,
      chainName as any,
    );
    if (userAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`Address ${address} does not belong to user ${userId}`);
    }

    // Get seed phrase and derive account
    const seedPhrase = await this.seedManager.getSeed(userId);

    try {
      // Derive account from seed phrase
      const account = mnemonicToAccount(seedPhrase, {
        addressIndex: 0,
      });

      // Sign the typed data using EIP-712
      const signature = await account.signTypedData({
        domain: typedData.domain as any,
        types: typedData.types as any,
        primaryType: typedData.primaryType as any,
        message: typedData.message as any,
      });

      return { signature };
    } finally {
      // Clear seed from memory (best effort)
      (seedPhrase as any) = '';
    }
  }

  /**
   * Get all EVM accounts formatted as CAIP-10 for WalletConnect
   *
   * NOTE: For ERC-4337 smart accounts, we return the EOA (Externally Owned Account)
   * addresses because:
   * 1. Smart accounts don't have private keys - they're controlled by EOAs
   * 2. WalletConnect requires signing, which is done by the EOA
   * 3. The EOA that signs transactions controls the smart account
   * 4. This allows seamless integration - dapps interact with the EOA, which controls
   *    the smart account for transaction execution
   */
  async getFormattedAccounts(
    userId: string,
    useTestnet: boolean = false,
  ): Promise<
    Array<{
      accountId: string;
      chainId: string;
      address: string;
      chainName: string;
    }>
  > {
    const addresses = await this.addressManager.getAddresses(userId);
    const accounts: Array<{
      accountId: string;
      chainId: string;
      address: string;
      chainName: string;
    }> = [];

    // Define supported EVM chains for WalletConnect
    // Using EOA addresses as they control the smart accounts
    const supportedChains = [
      { name: 'ethereum', chainId: 1 },
      { name: 'base', chainId: 8453 },
      { name: 'arbitrum', chainId: 42161 },
      { name: 'polygon', chainId: 137 },
      { name: 'avalanche', chainId: 43114 },
      { name: 'moonbeamTestnet', chainId: 420420422 },
      { name: 'astarShibuya', chainId: 81 },
      { name: 'paseoPassetHub', chainId: 420420422 },
      { name: 'hydration', chainId: 222222 },
      { name: 'unique', chainId: 8880 },
      { name: 'bifrost', chainId: 3068 },
      { name: 'bifrostTestnet', chainId: 49088 },
    ];

    for (const { name, chainId } of supportedChains) {
      // Get EOA address for this chain
      const address = addresses[name as keyof typeof addresses];
      if (!address || typeof address !== 'string') {
        continue;
      }

      const accountId = this.formatAccountId(name, address);

      accounts.push({
        accountId,
        chainId: chainId.toString(),
        address,
        chainName: name,
      });
    }

    this.logger.log(
      `Returning ${accounts.length} EVM accounts for WalletConnect`,
    );
    return accounts;
  }

  /**
   * Get viem chain object for a given chain name
   */
  private getViemChain(chainName: string): any {
    // Check if we have a predefined viem chain
    if (this.VIEM_CHAINS[chainName]) {
      return this.VIEM_CHAINS[chainName];
    }

    // For custom chains, create a chain object from ChainConfigService
    const config = this.chainConfigService.getEvmChainConfig(chainName as any);

    // Ensure chainId is defined
    if (!config || config.chainId === undefined) {
      throw new Error(`Cannot get chain configuration for ${chainName}`);
    }

    return {
      id: config.chainId,
      name: config.name,
      network: chainName,
      nativeCurrency: config.nativeCurrency,
      rpcUrls: {
        default: {
          http: [config.rpcUrl],
        },
        public: {
          http: [config.rpcUrl],
        },
      },
      blockExplorers: config.blockExplorer
        ? {
            default: {
              name: 'Explorer',
              url: config.blockExplorer,
            },
          }
        : undefined,
    };
  }
}
