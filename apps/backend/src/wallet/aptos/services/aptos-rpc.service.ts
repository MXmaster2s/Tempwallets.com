import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { getNetworkConfig, AptosNetwork } from '../config/aptos-chain.config.js';

interface ConnectionPool {
  clients: Aptos[];
  currentIndex: number;
  lastHealthCheck: Date;
}

@Injectable()
export class AptosRpcService implements OnModuleDestroy {
  private readonly logger = new Logger(AptosRpcService.name);
  private readonly pools = new Map<string, ConnectionPool>();

  // ADD: Track ongoing initializations to prevent race conditions
  private readonly initializingPools = new Map<string, Promise<void>>();

  private readonly MAX_CONNECTIONS_PER_NETWORK = parseInt(
    process.env.APTOS_MAX_CONNECTIONS_PER_NETWORK || '10',
    10,
  );
  private readonly RPC_TIMEOUT_MS = parseInt(
    process.env.APTOS_RPC_TIMEOUT_MS || '30000',
    10,
  );

  /**
   * Get or create pooled connection for network
   * CRITICAL: Implements round-robin load balancing
   */
  async getClient(network: 'mainnet' | 'testnet' | 'devnet'): Promise<Aptos> {
    // Check if pool exists
    if (!this.pools.has(network)) {
      // Check if initialization is already in progress
      if (this.initializingPools.has(network)) {
        // Wait for ongoing initialization to complete
        await this.initializingPools.get(network);
      } else {
        // Start new initialization
        const initPromise = this.initializePool(network);
        this.initializingPools.set(network, initPromise);

        try {
          await initPromise;
        } finally {
          this.initializingPools.delete(network);
        }
      }
    }

    const pool = this.pools.get(network);
    if (!pool || pool.clients.length === 0) {
      throw new Error(`No connections available for ${network}`);
    }

    // Round-robin: cycle through connections
    const client = pool.clients[pool.currentIndex];
    if (!client) {
      throw new Error(`No client available at index ${pool.currentIndex}`);
    }
    pool.currentIndex = (pool.currentIndex + 1) % pool.clients.length;

    return client;
  }

  /**
   * CRITICAL: Initialize connection pool with failover RPCs
   */
  private async initializePool(network: AptosNetwork): Promise<void> {
    const config = getNetworkConfig(network);
    const clients: Aptos[] = [];

    // Create one client per RPC URL (up to MAX_CONNECTIONS limit)
    const rpcUrls = config.rpcUrls.slice(0, this.MAX_CONNECTIONS_PER_NETWORK);

    for (const rpcUrl of rpcUrls) {
      try {
        const aptosConfig = new AptosConfig({
          network: Network.CUSTOM,
          fullnode: rpcUrl,
        });

        const client = new Aptos(aptosConfig);

        // CRITICAL: Verify connection works with timeout
        await this.healthCheckWithTimeout(client, rpcUrl);

        clients.push(client);
        this.logger.log(`Connected to ${network} RPC: ${rpcUrl}`);
      } catch (error) {
        this.logger.warn(
          `Failed to connect to ${rpcUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        // Continue to next RPC - don't fail if one is down
      }
    }

    if (clients.length === 0) {
      throw new Error(`No working RPC endpoints for ${network}`);
    }

    this.pools.set(network, {
      clients,
      currentIndex: 0,
      lastHealthCheck: new Date(),
    });

    this.logger.log(
      `Initialized ${network} pool with ${clients.length} connections`,
    );
  }

  /**
   * Health check with timeout: verify RPC responds
   */
  private async healthCheckWithTimeout(
    client: Aptos,
    rpcUrl: string,
  ): Promise<void> {
    try {
      await this.withTimeout(
        client.getLedgerInfo(),
        this.RPC_TIMEOUT_MS,
        `Health check timeout for ${rpcUrl}`,
      );
    } catch (error) {
      throw new Error(
        `Health check failed for ${rpcUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Wrap promise with timeout
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
      ),
    ]);
  }

  /**
   * Execute operation with automatic failover and retry
   * CRITICAL: This is your main method - all services use this
   */
  async withRetry<T>(
    network: 'mainnet' | 'testnet' | 'devnet',
    operation: (client: Aptos) => Promise<T>,
    operationName: string = 'operation',
  ): Promise<T> {
    const maxAttempts = 3;
    const delays = [1000, 2000, 4000]; // Exponential backoff

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const client = await this.getClient(network);
        return await operation(client);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `${operationName} attempt ${attempt + 1}/${maxAttempts} failed: ${lastError.message}`,
        );

        // Don't retry on last attempt
        if (attempt < maxAttempts - 1 && delays[attempt] !== undefined) {
          await this.sleep(delays[attempt]!);
        }
      }
    }

    throw new Error(
      `${operationName} failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * CRITICAL: Cleanup on module destroy
   */
  async onModuleDestroy() {
    this.logger.log('Cleaning up RPC connections...');
    this.pools.clear();
  }
}
