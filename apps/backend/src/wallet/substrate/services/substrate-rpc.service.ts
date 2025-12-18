import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ApiPromise, WsProvider } from '@polkadot/api';
import {
  SubstrateChainKey,
  getChainConfig,
} from '../config/substrate-chain.config.js';
import { MetadataCacheService } from './metadata-cache.service.js';

/**
 * Substrate RPC Service with Connection Pooling
 *
 * Issue #9: RPC Connection Pool Not Implemented
 * - Reuse WebSocket connections instead of creating new ones
 * - Implement OnModuleDestroy for cleanup
 * - Error handling and reconnection logic
 */
@Injectable()
export class SubstrateRpcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubstrateRpcService.name);
  private readonly connections = new Map<string, ApiPromise>();
  private readonly connectionPromises = new Map<string, Promise<ApiPromise>>();
  private readonly connectionState = new Map<
    string,
    { isConnecting: boolean; lastError?: Error; reconnectAttempts: number }
  >();
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_BASE = 1000; // 1 second base delay
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 60 seconds

  constructor(private readonly metadataCache: MetadataCacheService) {}

  /**
   * Configure console interceptors to suppress Polkadot.js API verbose logs
   * and start health checks on module initialization
   */
  onModuleInit() {
    // Intercept console methods to filter out verbose WebSocket disconnection logs
    // Polkadot.js API logs directly to console, so we intercept at that level
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;

    // Filter function to check if message should be suppressed
    const shouldSuppress = (args: unknown[]): boolean => {
      return args.some(
        (arg) =>
          typeof arg === 'string' && arg.includes('API-WS: disconnected'),
      );
    };

    console.error = (...args: unknown[]) => {
      if (shouldSuppress(args)) {
        return; // Suppress verbose disconnection logs
      }
      originalConsoleError.apply(console, args);
    };

    console.log = (...args: unknown[]) => {
      if (shouldSuppress(args)) {
        return; // Suppress verbose disconnection logs
      }
      originalConsoleLog.apply(console, args);
    };

    // Start periodic health checks for all connections
    this.startHealthChecks();
  }

  /**
   * Get or create pooled connection for a chain
   * Implements proper connection state management to prevent race conditions
   *
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns ApiPromise instance
   */
  async getConnection(
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<ApiPromise> {
    const chainConfig = getChainConfig(chain, useTestnet);
    const connectionKey = `${chain}:${chainConfig.isTestnet ? 'testnet' : 'mainnet'}`;

    // Return existing healthy connection if available
    if (this.connections.has(connectionKey)) {
      const api = this.connections.get(connectionKey)!;
      // Verify connection is actually connected (not just marked as connected)
      if (api.isConnected) {
        try {
          // Quick health check: ensure API is ready
          await Promise.race([
            api.isReady,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Health check timeout')), 2000),
            ),
          ]);
          return api;
        } catch {
          // Connection appears connected but isn't responding - mark for cleanup
          this.logger.warn(
            `Connection health check failed for ${connectionKey}, will recreate`,
          );
          await this.cleanupConnection(connectionKey, api);
        }
      } else {
        // Connection exists but is disconnected - cleanup and recreate
        await this.cleanupConnection(connectionKey, api);
      }
    }

    // Check if connection is currently being created (prevents race conditions)
    if (this.connectionPromises.has(connectionKey)) {
      return this.connectionPromises.get(connectionKey)!;
    }

    // Check connection state to prevent excessive reconnection attempts
    const state = this.connectionState.get(connectionKey);
    if (state?.isConnecting) {
      // Wait for existing connection attempt
      const existingPromise = this.connectionPromises.get(connectionKey);
      if (existingPromise) {
        return existingPromise;
      }
    }

    // Create new connection with retry logic
    const connectionPromise = this.createConnectionWithRetry(
      chainConfig.rpc,
      connectionKey,
    );
    this.connectionPromises.set(connectionKey, connectionPromise);

    try {
      const api = await connectionPromise;
      this.connections.set(connectionKey, api);
      this.connectionPromises.delete(connectionKey);
      // Reset connection state on success
      this.connectionState.set(connectionKey, {
        isConnecting: false,
        reconnectAttempts: 0,
      });
      return api;
    } catch (error) {
      this.connectionPromises.delete(connectionKey);
      // Update state with error
      const currentState = this.connectionState.get(connectionKey) || {
        isConnecting: false,
        reconnectAttempts: 0,
      };
      this.connectionState.set(connectionKey, {
        isConnecting: false,
        lastError: error instanceof Error ? error : new Error(String(error)),
        reconnectAttempts: currentState.reconnectAttempts + 1,
      });
      throw error;
    }
  }

  /**
   * Create new API connection with proper configuration and event handling
   */
  private async createConnection(
    rpcUrl: string,
    connectionKey: string,
  ): Promise<ApiPromise> {
    this.logger.log(`Creating connection to ${connectionKey} (${rpcUrl})`);

    try {
      // Configure WsProvider with automatic reconnection
      // autoConnectMs: delay between reconnection attempts (2 seconds)
      // This helps prevent rapid reconnection loops
      const provider = new WsProvider(rpcUrl, 2000);

      // Setup connection event listeners for better monitoring
      provider.on('connected', () => {
        this.logger.debug(`WebSocket connected to ${connectionKey}`);
      });

      provider.on('disconnected', () => {
        this.logger.debug(`WebSocket disconnected from ${connectionKey}`);
        // Mark connection as potentially unhealthy
        const api = this.connections.get(connectionKey);
        if (api && !api.isConnected) {
          // Connection will be cleaned up on next access
          this.logger.debug(`Connection ${connectionKey} marked for cleanup`);
        }
      });

      provider.on('error', (error) => {
        this.logger.warn(
          `WebSocket error for ${connectionKey}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

      // Create API with timeout
      const api = await Promise.race([
        ApiPromise.create({ provider }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Connection timeout after 20s')),
            20000,
          ),
        ),
      ]);

      // Wait for API to be ready with timeout
      await Promise.race([
        api.isReady,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('API ready timeout after 20s')),
            20000,
          ),
        ),
      ]);

      this.logger.log(`✓ Connected to ${connectionKey}`);
      return api;
    } catch (error) {
      this.logger.error(
        `Failed to create connection to ${connectionKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Create connection with exponential backoff retry logic
   */
  private async createConnectionWithRetry(
    rpcUrl: string,
    connectionKey: string,
    attempt: number = 1,
  ): Promise<ApiPromise> {
    const state = this.connectionState.get(connectionKey) || {
      isConnecting: false,
      reconnectAttempts: 0,
    };

    // Mark as connecting
    this.connectionState.set(connectionKey, {
      ...state,
      isConnecting: true,
    });

    try {
      return await this.createConnection(rpcUrl, connectionKey);
    } catch (error) {
      if (attempt < this.MAX_RECONNECT_ATTEMPTS) {
        const delay = this.RECONNECT_DELAY_BASE * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Connection attempt ${attempt}/${this.MAX_RECONNECT_ATTEMPTS} failed for ${connectionKey}, retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.createConnectionWithRetry(rpcUrl, connectionKey, attempt + 1);
      }
      throw error;
    } finally {
      // Reset connecting state
      const currentState = this.connectionState.get(connectionKey);
      if (currentState) {
        this.connectionState.set(connectionKey, {
          ...currentState,
          isConnecting: false,
        });
      }
    }
  }

  /**
   * Cleanup a connection properly
   */
  private async cleanupConnection(
    connectionKey: string,
    api: ApiPromise,
  ): Promise<void> {
    try {
      // Remove from connections map first to prevent reuse
      this.connections.delete(connectionKey);

      // Disconnect gracefully (don't wait too long)
      await Promise.race([
        api.disconnect(),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            this.logger.warn(`Cleanup timeout for ${connectionKey}`);
            resolve();
          }, 5000),
        ),
      ]);
    } catch (error) {
      // Ignore cleanup errors - connection may already be closed
      this.logger.debug(
        `Error during cleanup of ${connectionKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Start periodic health checks for all connections
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      const keys = Array.from(this.connections.keys());
      for (const key of keys) {
        const api = this.connections.get(key);
        if (api) {
          try {
            // Quick health check - verify connection is responsive
            if (!api.isConnected) {
              this.logger.warn(`Health check: ${key} is disconnected`);
              await this.cleanupConnection(key, api);
            } else {
              // Verify API is ready (quick check with timeout)
              await Promise.race([
                api.isReady,
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('Health check timeout')), 3000),
                ),
              ]);
            }
          } catch (error) {
            this.logger.warn(
              `Health check failed for ${key}, cleaning up: ${error instanceof Error ? error.message : String(error)}`,
            );
            await this.cleanupConnection(key, api);
          }
        }
      }
    }, this.HEALTH_CHECK_INTERVAL);

    this.logger.log(
      `Started connection health checks every ${this.HEALTH_CHECK_INTERVAL / 1000}s`,
    );
  }

  /**
   * Get account balance
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Balance in smallest units (string)
   */
  async getBalance(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<string> {
    const api = await this.getConnection(chain, useTestnet);

    try {
      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      if (!api.query.system?.account) {
        throw new Error('System account query not available');
      }

      // Add timeout for the query itself (10 seconds) to prevent hanging
      const queryPromise = api.query.system.account(address);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Query timeout for ${chain} after 10s`)),
          10000,
        ),
      );

      const accountInfo = await Promise.race([queryPromise, timeoutPromise]);
      // @ts-ignore - accountInfo.data.free is a Balance type
      const balance = accountInfo.data.free.toString();
      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to get balance for ${address} on ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get account nonce
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Account nonce
   */
  async getNonce(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<number> {
    const api = await this.getConnection(chain, useTestnet);

    try {
      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      if (!api.query.system?.account) {
        throw new Error('System account query not available');
      }
      const accountInfo = await api.query.system.account(address);
      // @ts-ignore - accountInfo.nonce is a Nonce type
      return accountInfo.nonce.toNumber();
    } catch (error) {
      this.logger.error(
        `Failed to get nonce for ${address} on ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get current genesis hash for a chain
   * Used for Issue #8: Genesis Hash Verification
   *
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Genesis hash
   */
  async getGenesisHash(
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<string> {
    return this.metadataCache.get(chain, 'genesisHash', async () => {
      const api = await this.getConnection(chain, useTestnet);
      const genesisHash = api.genesisHash.toHex();
      return genesisHash;
    });
  }

  /**
   * Check if connections are healthy
   */
  async checkConnections(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};

    for (const [key, api] of this.connections.entries()) {
      try {
        status[key] = api.isConnected;
      } catch {
        status[key] = false;
      }
    }

    return status;
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    this.logger.log('Disconnecting all Substrate RPC connections...');

    const disconnectPromises: Promise<void>[] = [];

    for (const [key, api] of this.connections.entries()) {
      disconnectPromises.push(
        this.cleanupConnection(key, api).catch((error) => {
          this.logger.error(
            `Error disconnecting ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }),
      );
    }

    await Promise.all(disconnectPromises);
    this.connections.clear();
    this.connectionPromises.clear();
    this.connectionState.clear();
    this.logger.log('All Substrate RPC connections closed');
  }
}
