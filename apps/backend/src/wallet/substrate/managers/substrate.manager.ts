import { Injectable, Logger } from '@nestjs/common';
import {
  SubstrateAddressManager,
  SubstrateAddresses,
} from './substrate-address.manager.js';
import { SubstrateRpcService } from '../services/substrate-rpc.service.js';
import { SubstrateTransactionService } from '../services/substrate-transaction.service.js';
import {
  SubstrateChainKey,
  getEnabledChains,
  getChainConfig,
} from '../config/substrate-chain.config.js';
import {
  TransferParams,
  TransactionResult,
  TransactionHistory,
} from '../types/substrate-transaction.types.js';

/**
 * Substrate Manager
 *
 * Main facade/coordinator for all Substrate operations.
 * Provides a clean interface for wallet integration without exposing internal complexity.
 */
@Injectable()
export class SubstrateManager {
  private readonly logger = new Logger(SubstrateManager.name);

  constructor(
    private readonly addressManager: SubstrateAddressManager,
    private readonly rpcService: SubstrateRpcService,
    private readonly transactionService: SubstrateTransactionService,
  ) {}

  /**
   * Get all Substrate addresses for a user
   *
   * @param userId - User ID
   * @param useTestnet - Whether to use testnet
   * @returns All Substrate addresses
   */
  async getAddresses(
    userId: string,
    useTestnet?: boolean,
  ): Promise<SubstrateAddresses> {
    return this.addressManager.getAddresses(userId, useTestnet);
  }

  /**
   * Get address for a specific chain
   *
   * @param userId - User ID
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns SS58 address or null
   */
  async getAddressForChain(
    userId: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<string | null> {
    return this.addressManager.getAddressForChain(userId, chain, useTestnet);
  }

  /**
   * Get balance for an address on a chain
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Balance in smallest units (as string)
   */
  async getBalance(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<string> {
    return this.rpcService.getBalance(address, chain, useTestnet);
  }

  /**
   * Get balances for all Substrate chains for a user
   *
   * @param userId - User ID
   * @param useTestnet - Whether to use testnet
   * @returns Map of chain -> balance
   */
  async getBalances(
    userId: string,
    useTestnet?: boolean,
  ): Promise<
    Record<SubstrateChainKey, { balance: string; address: string | null }>
  > {
    const addresses = await this.getAddresses(userId, useTestnet);
    const balances: Record<
      string,
      { balance: string; address: string | null }
    > = {};

    // Get balances in parallel with individual timeouts to prevent one slow chain from blocking all
    const balancePromises = Object.entries(addresses).map(
      async ([chain, address]) => {
        if (!address) {
          return { chain, balance: '0', address: null };
        }

        try {
          // Add per-chain timeout (20 seconds) to prevent hanging
          const balancePromise = this.getBalance(
            address,
            chain as SubstrateChainKey,
            useTestnet,
          );

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`Balance fetch timeout for ${chain} after 20s`),
                ),
              20000,
            ),
          );

          const balance = await Promise.race([balancePromise, timeoutPromise]);
          return { chain, balance, address };
        } catch (error) {
          this.logger.warn(
            `Failed to get balance for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          // Return zero balance instead of failing - allows other chains to succeed
          return { chain, balance: '0', address };
        }
      },
    );

    // Use Promise.allSettled to get results even if some chains fail
    const results = await Promise.allSettled(balancePromises);
    results.forEach((result, index) => {
      const chain = Object.keys(addresses)[index] as SubstrateChainKey;
      if (result.status === 'fulfilled') {
        balances[chain] = {
          balance: result.value.balance,
          address: result.value.address,
        };
      } else {
        this.logger.warn(
          `Balance fetch failed for ${chain}, using zero balance`,
        );
        balances[chain] = { balance: '0', address: addresses[chain] };
      }
    });

    this.logger.log(
      `Retrieved balances for ${Object.keys(balances).length} Substrate chains`,
    );
    return balances as Record<
      SubstrateChainKey,
      { balance: string; address: string | null }
    >;
  }

  /**
   * Send a transfer transaction
   *
   * @param userId - User ID
   * @param params - Transfer parameters
   * @param accountIndex - Account index (default: 0)
   * @returns Transaction result
   */
  async sendTransfer(
    userId: string,
    params: TransferParams,
    accountIndex: number = 0,
  ): Promise<TransactionResult> {
    return this.transactionService.sendTransfer(userId, params, accountIndex);
  }

  /**
   * Get transaction history for an address
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @param limit - Number of transactions to fetch
   * @param cursor - Pagination cursor
   * @returns Transaction history
   */
  async getTransactionHistory(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
    limit: number = 10,
    cursor?: string,
  ): Promise<TransactionHistory> {
    return this.transactionService.getTransactionHistory(
      address,
      chain,
      useTestnet,
      limit,
      cursor,
    );
  }

  /**
   * Get transaction history for a user on a specific chain
   *
   * @param userId - User ID
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @param limit - Number of transactions to fetch
   * @param cursor - Pagination cursor
   * @returns Transaction history
   */
  async getUserTransactionHistory(
    userId: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
    limit: number = 10,
    cursor?: string,
  ): Promise<TransactionHistory> {
    const address = await this.getAddressForChain(userId, chain, useTestnet);
    if (!address) {
      return {
        transactions: [],
        total: 0,
        page: 1,
        pageSize: limit,
        hasMore: false,
      };
    }

    return this.getTransactionHistory(
      address,
      chain,
      useTestnet,
      limit,
      cursor,
    );
  }

  /**
   * Get enabled chains
   *
   * @returns Array of enabled chain keys
   */
  getEnabledChains(): SubstrateChainKey[] {
    return getEnabledChains();
  }

  /**
   * Check if a chain is enabled
   *
   * @param chain - Chain key
   * @returns true if enabled
   */
  isChainEnabled(chain: string): boolean {
    return getEnabledChains().includes(chain as SubstrateChainKey);
  }

  /**
   * Get chain configuration
   *
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Chain configuration
   */
  getChainConfig(chain: SubstrateChainKey, useTestnet?: boolean) {
    return getChainConfig(chain, useTestnet);
  }

  /**
   * Clear address cache for a user
   *
   * @param userId - User ID
   */
  clearCache(userId: string): void {
    this.addressManager.clearCache(userId);
  }
}
