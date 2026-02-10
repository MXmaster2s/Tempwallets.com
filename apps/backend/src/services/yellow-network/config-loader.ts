/**
 * Yellow Network Configuration Loader
 *
 * Dynamically fetches contract addresses and network configuration from Clearnode.
 * This ensures addresses are always up-to-date if Yellow Network deploys new contracts.
 *
 * Usage:
 * ```typescript
 * const configLoader = new ConfigLoader(process.env.YELLOW_NETWORK_WS_URL!);
 * await configLoader.loadConfig();
 * const custodyAddress = configLoader.getCustodyAddress(137); // Polygon
 * ```
 *
 * Reference:
 * - Dynamic Retrieval Guide: /Users/monstu/Developer/Tempwallets.com/Docs/LIGHTNING_NODE_FINAL_PLAN.md#dynamic-contract-address-retrieval
 */

import type { Address } from 'viem';
import { WebSocketManager } from './websocket-manager.js';
import type { NetworkConfig, ClearnodeConfig, RPCRequest } from './types.js';

/**
 * Configuration Loader Class
 *
 * Fetches and caches Yellow Network configuration including:
 * - Clearnode broker address (for signature verification)
 * - Custody contract addresses per chain
 * - Adjudicator contract addresses per chain
 * - Supported blockchain networks
 */
export class ConfigLoader {
  private config: ClearnodeConfig | null = null;
  private ws: WebSocketManager;
  private lastFetched: number = 0;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(wsUrl: string) {
    this.ws = new WebSocketManager({
      url: wsUrl,
      reconnectAttempts: 3,
      requestTimeout: 30000,
    });
  }

  /**
   * Load configuration from Clearnode
   * Call this on application startup
   *
   * @param forceRefresh - Force refresh even if cache is valid
   * @returns Clearnode configuration
   */
  /**
   * @param sharedWs  Optional already-connected WebSocketManager to reuse.
   *                  When provided the ConfigLoader will NOT open its own
   *                  second WebSocket connection and will NOT disconnect after
   *                  fetching – that is the caller's responsibility.
   *                  Pass `this.ws` from NitroliteClient.initialize() so that
   *                  get_config is fetched over the single existing connection.
   */
  async loadConfig(
    sharedWs?: WebSocketManager,
    forceRefresh = false,
  ): Promise<ClearnodeConfig> {
    const now = Date.now();

    // Return cached config if still valid
    if (
      !forceRefresh &&
      this.config &&
      now - this.lastFetched < this.CACHE_TTL
    ) {
      console.log('[ConfigLoader] Using cached config');
      return this.config;
    }

    console.log('[ConfigLoader] Fetching fresh config from Clearnode...');

    // Use the shared (already-open) connection when available so we never open
    // a second parallel WebSocket to the same server.
    const ws = sharedWs ?? this.ws;
    const ownsConnection = !sharedWs;

    // Only connect if we own (and are responsible for) this ws instance
    if (ownsConnection && !ws.isConnected()) {
      await ws.connect();
    }

    try {
      // Request configuration via get_config RPC method
      const requestId = ws.getNextRequestId();
      const request: RPCRequest = {
        req: [requestId, 'get_config', {}, Date.now()],
        sig: [] as string[], // Public method - no signature needed
      };

      const response = await ws.send(request);
      const configData = response.res[2];

      // Parse configuration
      this.config = {
        broker_address: configData.broker_address as Address,
        networks: configData.networks.map((network: any) => ({
          chain_id: network.chain_id,
          name: network.name,
          custody_address: network.custody_address as Address,
          adjudicator_address: network.adjudicator_address as Address,
        })),
      };

      this.lastFetched = now;

      console.log('[ConfigLoader] Config loaded successfully:');
      console.log(`  - Clearnode: ${this.config.broker_address}`);
      console.log(`  - Networks: ${this.config.networks.length}`);
      this.config.networks.forEach((network) => {
        console.log(`    • ${network.name} (${network.chain_id})`);
      });

      // Only close the connection if we opened it ourselves
      if (ownsConnection) {
        this.disconnect();
      }

      return this.config;
    } catch (error) {
      console.error('[ConfigLoader] Failed to load config:', error);
      throw new Error(`Failed to load Yellow Network config: ${error}`);
    }
  }

  /**
   * Get custody contract address for a specific chain
   *
   * @param chainId - Blockchain chain ID
   * @returns Custody contract address
   * @throws Error if config not loaded or chain not supported
   */
  getCustodyAddress(chainId: number): Address {
    this.ensureConfigLoaded();

    const network = this.config!.networks.find((n) => n.chain_id === chainId);
    if (!network) {
      throw new Error(
        `Chain ${chainId} not supported. Supported chains: ${this.getSupportedChains().join(', ')}`,
      );
    }

    return network.custody_address;
  }

  /**
   * Get adjudicator contract address for a specific chain
   *
   * @param chainId - Blockchain chain ID
   * @returns Adjudicator contract address
   * @throws Error if config not loaded or chain not supported
   */
  getAdjudicatorAddress(chainId: number): Address {
    this.ensureConfigLoaded();

    const network = this.config!.networks.find((n) => n.chain_id === chainId);
    if (!network) {
      throw new Error(
        `Chain ${chainId} not supported. Supported chains: ${this.getSupportedChains().join(', ')}`,
      );
    }

    return network.adjudicator_address;
  }

  /**
   * Get Clearnode broker address for signature verification
   *
   * @returns Clearnode broker wallet address
   * @throws Error if config not loaded
   */
  getClearnodeAddress(): Address {
    this.ensureConfigLoaded();
    return this.config!.broker_address;
  }

  /**
   * Get all supported blockchain chain IDs
   *
   * @returns Array of supported chain IDs
   * @throws Error if config not loaded
   */
  getSupportedChains(): number[] {
    this.ensureConfigLoaded();
    return this.config!.networks.map((n) => n.chain_id);
  }

  /**
   * Get network configuration for a specific chain
   *
   * @param chainId - Blockchain chain ID
   * @returns Network configuration
   * @throws Error if config not loaded or chain not supported
   */
  getNetworkConfig(chainId: number): NetworkConfig {
    this.ensureConfigLoaded();

    const network = this.config!.networks.find((n) => n.chain_id === chainId);
    if (!network) {
      throw new Error(
        `Chain ${chainId} not supported. Supported chains: ${this.getSupportedChains().join(', ')}`,
      );
    }

    return network;
  }

  /**
   * Get all network configurations
   *
   * @returns Array of all network configurations
   * @throws Error if config not loaded
   */
  getAllNetworks(): NetworkConfig[] {
    this.ensureConfigLoaded();
    return this.config!.networks;
  }

  /**
   * Get full configuration object
   *
   * @returns Complete Clearnode configuration
   * @throws Error if config not loaded
   */
  getConfig(): ClearnodeConfig {
    this.ensureConfigLoaded();
    return this.config!;
  }

  /**
   * Check if configuration is loaded
   *
   * @returns True if config is loaded
   */
  isConfigLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Check if cache is still valid
   *
   * @returns True if cache is valid
   */
  isCacheValid(): boolean {
    if (!this.config) return false;
    const now = Date.now();
    return now - this.lastFetched < this.CACHE_TTL;
  }

  /**
   * Clear cached configuration
   */
  clearCache(): void {
    console.log('[ConfigLoader] Clearing cache');
    this.config = null;
    this.lastFetched = 0;
  }

  /**
   * Disconnect WebSocket connection
   */
  disconnect(): void {
    this.ws.disconnect();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Ensure configuration is loaded before access
   * @throws Error if config not loaded
   */
  private ensureConfigLoaded(): void {
    if (!this.config) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }
  }
}

/**
 * Singleton Config Loader Instance
 * Use this for application-wide configuration access
 */
let globalConfigLoader: ConfigLoader | null = null;

/**
 * Initialize global config loader
 *
 * @param wsUrl - WebSocket URL for Clearnode
 * @returns Config loader instance
 */
export function initializeConfigLoader(wsUrl: string): ConfigLoader {
  if (!globalConfigLoader) {
    globalConfigLoader = new ConfigLoader(wsUrl);
  }
  return globalConfigLoader;
}

/**
 * Get global config loader instance
 *
 * @returns Config loader instance
 * @throws Error if not initialized
 */
export function getConfigLoader(): ConfigLoader {
  if (!globalConfigLoader) {
    throw new Error(
      'ConfigLoader not initialized. Call initializeConfigLoader() first.',
    );
  }
  return globalConfigLoader;
}

/**
 * Helper function to load config on application startup
 *
 * @param wsUrl - WebSocket URL for Clearnode
 * @returns Loaded configuration
 */
export async function loadYellowNetworkConfig(
  wsUrl: string,
): Promise<ClearnodeConfig> {
  const configLoader = initializeConfigLoader(wsUrl);
  return await configLoader.loadConfig();
}
