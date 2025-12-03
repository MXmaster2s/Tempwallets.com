import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
export class SubstrateRpcService implements OnModuleDestroy {
  private readonly logger = new Logger(SubstrateRpcService.name);
  private readonly connections = new Map<string, ApiPromise>();
  private readonly connectionPromises = new Map<string, Promise<ApiPromise>>();

  constructor(private readonly metadataCache: MetadataCacheService) {}

  /**
   * Get or create pooled connection for a chain
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

    // Return existing connection if available
    if (this.connections.has(connectionKey)) {
      const api = this.connections.get(connectionKey)!;
      // Check if connection is still valid
      if (api.isConnected) {
        return api;
      }
      // Connection lost, remove and recreate
      this.logger.warn(`Connection lost for ${connectionKey}, reconnecting...`);
      this.connections.delete(connectionKey);
    }

    // Check if connection is being created
    if (this.connectionPromises.has(connectionKey)) {
      return this.connectionPromises.get(connectionKey)!;
    }

    // Create new connection
    const connectionPromise = this.createConnection(
      chainConfig.rpc,
      connectionKey,
    );
    this.connectionPromises.set(connectionKey, connectionPromise);

    try {
      const api = await connectionPromise;
      this.connections.set(connectionKey, api);
      this.connectionPromises.delete(connectionKey);
      return api;
    } catch (error) {
      this.connectionPromises.delete(connectionKey);
      throw error;
    }
  }

  /**
   * Create new API connection
   */
  private async createConnection(
    rpcUrl: string,
    connectionKey: string,
  ): Promise<ApiPromise> {
    this.logger.log(`Creating connection to ${connectionKey} (${rpcUrl})`);

    try {
      const provider = new WsProvider(rpcUrl);

      // Create API with shorter timeout (15s) to fail faster
      const api = await Promise.race([
        ApiPromise.create({ provider }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Connection timeout after 15s')),
            15000,
          ),
        ),
      ]);

      // Wait for API to be ready with shorter timeout (15s)
      await Promise.race([
        api.isReady,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('API ready timeout after 15s')),
            15000,
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
    this.logger.log('Disconnecting all Substrate RPC connections...');

    const disconnectPromises: Promise<void>[] = [];

    for (const [key, api] of this.connections.entries()) {
      disconnectPromises.push(
        api
          .disconnect()
          .then(() => {
            this.logger.log(`Disconnected ${key}`);
          })
          .catch((error) => {
            this.logger.error(
              `Error disconnecting ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }),
      );
    }

    await Promise.all(disconnectPromises);
    this.connections.clear();
    this.connectionPromises.clear();
    this.logger.log('All Substrate RPC connections closed');
  }
}
