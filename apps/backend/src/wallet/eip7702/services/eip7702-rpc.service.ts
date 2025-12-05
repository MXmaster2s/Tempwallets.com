import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  createPublicClient,
  http,
  PublicClient,
  Address,
  Hex,
  Chain,
  HttpTransport,
  FallbackTransport,
  fallback,
} from 'viem';
import {
  getChainConfig,
  Eip7702ChainConfig,
  SIMPLE_ACCOUNT_7702_IMPLEMENTATION,
} from '../config/eip7702-chain.config.js';

/**
 * EIP-7702 RPC Service
 *
 * Manages viem PublicClient instances for all supported chains.
 *
 * SECURITY FEATURES:
 * - Connection pooling with cleanup
 * - Fallback RPC support for reliability
 * - Timeout handling to prevent hanging requests
 * - No sensitive data in logs
 */
@Injectable()
export class Eip7702RpcService implements OnModuleDestroy {
  private readonly logger = new Logger(Eip7702RpcService.name);
  private readonly clients: Map<number, PublicClient> = new Map();
  private readonly clientLastUsed: Map<number, number> = new Map();

  // Connection settings
  private readonly REQUEST_TIMEOUT = 30_000; // 30 seconds
  private readonly CLIENT_TTL = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start cleanup interval for idle clients
    this.cleanupInterval = setInterval(() => this.cleanupIdleClients(), 60_000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clients.clear();
    this.clientLastUsed.clear();
  }

  /**
   * Get or create a PublicClient for the specified chain
   *
   * @param chainId - Chain ID
   * @returns PublicClient instance
   */
  getClient(chainId: number): PublicClient {
    let client = this.clients.get(chainId);

    if (!client) {
      client = this.createClient(chainId);
      this.clients.set(chainId, client);
    }

    this.clientLastUsed.set(chainId, Date.now());
    return client;
  }

  /**
   * Create a new PublicClient with fallback transports
   */
  private createClient(chainId: number): PublicClient {
    const config = getChainConfig(chainId);

    // Create fallback transport with multiple RPC URLs
    const transports = config.rpcUrls.map((url) =>
      http(url, {
        timeout: this.REQUEST_TIMEOUT,
        retryCount: 2,
        retryDelay: 1000,
      }),
    );

    const transport: FallbackTransport | HttpTransport =
      transports.length > 1
        ? fallback(transports, { rank: true })
        : transports[0]!;

    const client = createPublicClient({
      chain: config.viemChain as Chain,
      transport,
      batch: {
        multicall: true,
      },
    });

    this.logger.debug(`Created RPC client for chain ${chainId}`);
    return client as PublicClient;
  }

  /**
   * Clean up idle clients to prevent memory leaks
   */
  private cleanupIdleClients(): void {
    const now = Date.now();
    for (const [chainId, lastUsed] of this.clientLastUsed.entries()) {
      if (now - lastUsed > this.CLIENT_TTL) {
        this.clients.delete(chainId);
        this.clientLastUsed.delete(chainId);
        this.logger.debug(`Cleaned up idle client for chain ${chainId}`);
      }
    }
  }

  /**
   * Get chain configuration
   */
  getChainConfig(chainId: number): Eip7702ChainConfig {
    return getChainConfig(chainId);
  }

  /**
   * Get bytecode at an address
   * Used to check if EOA has EIP-7702 delegation set
   *
   * @param chainId - Chain ID
   * @param address - Address to check
   * @returns Bytecode or undefined if no code
   */
  async getBytecode(
    chainId: number,
    address: Address,
  ): Promise<Hex | undefined> {
    try {
      const client = this.getClient(chainId);
      const code = await client.getCode({ address });
      return code;
    } catch (error) {
      this.logger.error(
        `Failed to get bytecode for ${address} on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Get transaction count (nonce) for an EOA
   *
   * @param chainId - Chain ID
   * @param address - EOA address
   * @returns Current transaction count
   */
  async getTransactionCount(
    chainId: number,
    address: Address,
  ): Promise<number> {
    try {
      const client = this.getClient(chainId);
      const count = await client.getTransactionCount({ address });
      return count;
    } catch (error) {
      this.logger.error(
        `Failed to get transaction count on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Check if an address has EIP-7702 delegation set
   *
   * @param chainId - Chain ID
   * @param address - Address to check
   * @returns true if address has delegation code
   */
  async isDelegated(chainId: number, address: Address): Promise<boolean> {
    try {
      const code = await this.getBytecode(chainId, address);
      // EIP-7702 delegation sets code starting with 0xef0100
      // followed by the 20-byte implementation address
      if (!code || code === '0x') {
        return false;
      }
      // Check for EIP-7702 delegation designator prefix
      return code.startsWith('0xef0100');
    } catch (error) {
      this.logger.warn(
        `Error checking delegation status on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }

  /**
   * Verify delegation points to expected implementation
   *
   * SECURITY: Validates the delegation target matches our implementation
   *
   * @param chainId - Chain ID
   * @param address - Address to check
   * @returns true if delegation is to our implementation
   */
  async isValidDelegation(chainId: number, address: Address): Promise<boolean> {
    try {
      const code = await this.getBytecode(chainId, address);
      if (!code || code === '0x') {
        return false;
      }

      // EIP-7702 delegation format: 0xef0100 + 20-byte address
      if (!code.startsWith('0xef0100')) {
        return false;
      }

      // Extract implementation address from code
      const implementationAddress = `0x${code.slice(8, 48)}`.toLowerCase();
      const expectedImplementation =
        SIMPLE_ACCOUNT_7702_IMPLEMENTATION.toLowerCase();

      return implementationAddress === expectedImplementation;
    } catch (error) {
      this.logger.warn(
        `Error validating delegation on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }

  /**
   * Get current block number
   *
   * @param chainId - Chain ID
   * @returns Current block number
   */
  async getBlockNumber(chainId: number): Promise<bigint> {
    try {
      const client = this.getClient(chainId);
      return await client.getBlockNumber();
    } catch (error) {
      this.logger.error(
        `Failed to get block number on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Get current gas price
   *
   * @param chainId - Chain ID
   * @returns Gas price in wei
   */
  async getGasPrice(chainId: number): Promise<bigint> {
    try {
      const client = this.getClient(chainId);
      return await client.getGasPrice();
    } catch (error) {
      this.logger.error(
        `Failed to get gas price on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Get EIP-1559 gas fees
   *
   * @param chainId - Chain ID
   * @returns maxFeePerGas and maxPriorityFeePerGas
   */
  async getGasFees(
    chainId: number,
  ): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    try {
      const client = this.getClient(chainId);
      const fees = await client.estimateFeesPerGas();

      return {
        maxFeePerGas: fees.maxFeePerGas ?? (await this.getGasPrice(chainId)),
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000_000n, // 1 gwei default
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get EIP-1559 fees on chain ${chainId}, falling back to legacy: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      // Fallback to legacy gas price
      const gasPrice = await this.getGasPrice(chainId);
      return {
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice / 10n,
      };
    }
  }

  /**
   * Wait for transaction confirmation with reorg protection
   *
   * SECURITY: Waits for chain-specific confirmation depth
   *
   * @param chainId - Chain ID
   * @param txHash - Transaction hash
   * @returns Transaction receipt
   */
  async waitForTransaction(
    chainId: number,
    txHash: Hex,
  ): Promise<{
    blockNumber: bigint;
    blockHash: Hex;
    status: 'success' | 'reverted';
    gasUsed: bigint;
  }> {
    try {
      const client = this.getClient(chainId);
      const config = getChainConfig(chainId);

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        confirmations: config.confirmationBlocks,
        timeout: 120_000, // 2 minute timeout
      });

      return {
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        status: receipt.status,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      this.logger.error(
        `Failed to wait for transaction ${txHash} on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Check if a transaction has been reorged
   *
   * SECURITY: Detects chain reorgs to prevent double-spending
   *
   * @param chainId - Chain ID
   * @param txHash - Transaction hash
   * @param expectedBlockHash - Expected block hash
   * @returns true if transaction was reorged
   */
  async checkForReorg(
    chainId: number,
    txHash: Hex,
    expectedBlockHash: Hex,
  ): Promise<boolean> {
    try {
      const client = this.getClient(chainId);
      const receipt = await client.getTransactionReceipt({ hash: txHash });

      if (!receipt) {
        // Transaction not found - likely reorged
        return true;
      }

      return receipt.blockHash !== expectedBlockHash;
    } catch {
      // If we can't check, assume reorg for safety
      return true;
    }
  }

  /**
   * Get ETH balance for an address
   *
   * @param chainId - Chain ID
   * @param address - Address to check
   * @returns Balance in wei
   */
  async getBalance(chainId: number, address: Address): Promise<bigint> {
    try {
      const client = this.getClient(chainId);
      return await client.getBalance({ address });
    } catch (error) {
      this.logger.error(
        `Failed to get balance on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }
}

