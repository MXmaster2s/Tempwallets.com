/**
 * Nitrolite Client
 *
 * High-level API for interacting with Yellow Network Nitrolite state channels.
 * Provides unified interface for payment channels and app sessions (Lightning Nodes).
 *
 * Usage:
 * ```typescript
 * const client = new NitroliteClient({
 *   wsUrl: process.env.YELLOW_NETWORK_WS_URL!,
 *   mainWallet,
 *   publicClient,
 *   walletClient
 * });
 *
 * await client.initialize();
 *
 * // Create payment channel (one-time setup)
 * const channel = await client.createChannel(137, '0x...token');
 *
 * // Create Lightning Node (app session)
 * const lightningNode = await client.createLightningNode({
 *   participants: ['0x...', '0x...'],
 *   token: 'USDC'
 * });
 *
 * // Gasless transfer within Lightning Node
 * await client.transferInLightningNode(lightningNode.id, to, '10.0');
 * ```
 */

import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import { WebSocketManager } from './websocket-manager.js';
import { SessionKeyAuth, MainWallet } from './session-auth.js';
import { ConfigLoader } from './config-loader.js';
import { ChannelService } from './channel-service.js';
import { AppSessionService } from './app-session-service.js';
import { QueryService } from './query-service.js';
import type {
  NitroliteConfig,
  ChannelWithState,
  AppSession,
  AppDefinition,
  AppSessionAllocation,
  LedgerBalance,
  ClearnodeConfig,
} from './types.js';

/**
 * Main Nitrolite Client
 *
 * Unified API for Yellow Network integration
 */
export class NitroliteClient {
  // Configuration
  private config: NitroliteConfig;
  private mainWallet: MainWallet;
  private publicClient: PublicClient;
  private walletClient: WalletClient;

  // Core services
  private ws: WebSocketManager;
  private auth: SessionKeyAuth;
  private configLoader: ConfigLoader;
  private channelService: ChannelService;
  private appSessionService: AppSessionService;
  private queryService: QueryService;

  // State
  private initialized = false;
  private clearnodeConfig: ClearnodeConfig | null = null;

  constructor(options: {
    wsUrl: string;
    mainWallet: MainWallet;
    publicClient: PublicClient;
    walletClient: WalletClient;
    useSessionKeys?: boolean;
    application?: string;
  }) {
    this.config = {
      wsUrl: options.wsUrl,
      useSessionKeys: options.useSessionKeys ?? true,
      application: options.application || 'tempwallets-lightning',
    };

    this.mainWallet = options.mainWallet;
    this.publicClient = options.publicClient;
    this.walletClient = options.walletClient;

    // Initialize WebSocket Manager
    this.ws = new WebSocketManager({
      url: this.config.wsUrl,
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      requestTimeout: 30000,
    });

    // Initialize Authentication
    this.auth = new SessionKeyAuth(this.mainWallet, this.ws);

    // Initialize Config Loader
    this.configLoader = new ConfigLoader(this.config.wsUrl);

    // Services will be initialized after config is loaded
    this.channelService = null as any;
    this.appSessionService = new AppSessionService(this.ws, this.auth);
    this.queryService = new QueryService(this.ws, this.auth);
  }

  /**
   * Initialize Nitrolite Client
   *
   * Must be called before using any other methods:
   * 1. Connects to Clearnode WebSocket
   * 2. Loads contract addresses dynamically
   * 3. Authenticates with session key (if enabled)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      // Initialization logs moved to debug level
      return;
    }

    // Initialization logs moved to debug level

    // Step 1: Connect to WebSocket
    await this.ws.connect();
    // Connection success logged at debug level

    // Step 2: Load configuration (contract addresses)
    this.clearnodeConfig = await this.configLoader.loadConfig();
    // Config loaded logged at debug level

    // Initialize Channel Service with loaded addresses
    this.channelService = new ChannelService(
      this.ws,
      this.auth,
      this.publicClient,
      this.walletClient,
      this.clearnodeConfig.networks.reduce(
        (acc, n) => {
          acc[n.chain_id] = n.custody_address;
          return acc;
        },
        {} as Record<number, Address>,
      ),
    );

    // Step 3: Authenticate with session key (if enabled)
    if (this.config.useSessionKeys) {
      // Authentication logs moved to debug level
      await this.auth.authenticate({
        application: this.config.application,
        allowances: [], // Empty = unrestricted session (Yellow Network requirement)
        expiryHours: 24,
      });
      // Authentication success logged at debug level
    }

    this.initialized = true;
    // Initialization complete logged at debug level
  }

  // ============================================================================
  // Payment Channel Methods (2-Party: User ↔ Clearnode)
  // ============================================================================

  /**
   * Create a 2-party payment channel
   * One-time setup to access unified balance
   *
   * @param chainId - Blockchain chain ID
   * @param token - Token address (or native address)
   * @param initialDeposit - Optional initial deposit
   * @returns Created channel with ID
   */
  async createChannel(
    chainId: number,
    token: Address,
    initialDeposit?: bigint,
  ): Promise<ChannelWithState> {
    this.ensureInitialized();
    return await this.channelService.createChannel(
      chainId,
      token,
      initialDeposit,
    );
  }

  /**
   * Resize channel (add/remove funds to/from unified balance)
   *
   * @param channelId - Channel identifier
   * @param chainId - Blockchain chain ID
   * @param amount - Amount to add (positive) or remove (negative)
   * @returns Updated channel state
   */
  async resizeChannel(
    channelId: Hash,
    chainId: number,
    amount: bigint,
  ): Promise<void> {
    this.ensureInitialized();
    await this.channelService.resizeChannel(channelId, chainId, amount);
  }

  /**
   * Close payment channel (final withdrawal to main wallet)
   *
   * @param channelId - Channel identifier
   * @param chainId - Blockchain chain ID
   * @param fundsDestination - Address to send funds to
   */
  async closeChannel(
    channelId: Hash,
    chainId: number,
    fundsDestination: Address,
  ): Promise<void> {
    this.ensureInitialized();
    await this.channelService.closeChannel(
      channelId,
      chainId,
      fundsDestination,
    );
  }

  // ============================================================================
  // Lightning Node Methods (App Sessions - Multi-Party)
  // ============================================================================

  /**
   * Create Lightning Node (App Session)
   *
   * @param options - Lightning Node creation options
   * @returns Created Lightning Node
   */
  async createLightningNode(options: {
    participants: Address[];
    weights?: number[];
    quorum?: number;
    token: string;
    initialAllocations?: AppSessionAllocation[];
    sessionData?: string;
  }): Promise<AppSession> {
    this.ensureInitialized();

    const {
      participants,
      weights = participants.map(() => 100 / participants.length),
      quorum = Math.ceil((participants.length / 2) * 100), // Majority by default
      token,
      initialAllocations = [],
      sessionData,
    } = options;

    const definition: AppDefinition = {
      protocol: 'NitroRPC/0.4',
      participants,
      weights,
      quorum,
      challenge: 3600, // 1 hour
      nonce: Date.now(),
      application: this.config.application,
    };

    return await this.appSessionService.createAppSession(
      definition,
      initialAllocations,
      sessionData,
    );
  }

  /**
   * Deposit funds to Lightning Node from unified balance (gasless)
   *
   * @param appSessionId - Lightning Node session ID
   * @param participant - Participant address
   * @param asset - Asset identifier
   * @param amount - Amount in human-readable format
   * @param currentAllocations - Current allocations
   */
  async depositToLightningNode(
    appSessionId: Hash,
    participant: Address,
    asset: string,
    amount: string,
    currentAllocations: AppSessionAllocation[],
  ): Promise<void> {
    this.ensureInitialized();
    await this.appSessionService.depositToAppSession(
      appSessionId,
      participant,
      asset,
      amount,
      currentAllocations,
    );
  }

  /**
   * Transfer within Lightning Node (gasless)
   *
   * @param appSessionId - Lightning Node session ID
   * @param from - Sender address
   * @param to - Recipient address
   * @param asset - Asset identifier
   * @param amount - Amount in human-readable format
   * @param currentAllocations - Current allocations
   */
  async transferInLightningNode(
    appSessionId: Hash,
    from: Address,
    to: Address,
    asset: string,
    amount: string,
    currentAllocations: AppSessionAllocation[],
  ): Promise<void> {
    this.ensureInitialized();
    await this.appSessionService.transferInAppSession(
      appSessionId,
      from,
      to,
      asset,
      amount,
      currentAllocations,
    );
  }

  /**
   * Withdraw from Lightning Node back to unified balance (gasless)
   *
   * @param appSessionId - Lightning Node session ID
   * @param participant - Participant address
   * @param asset - Asset identifier
   * @param amount - Amount in human-readable format
   * @param currentAllocations - Current allocations
   */
  async withdrawFromLightningNode(
    appSessionId: Hash,
    participant: Address,
    asset: string,
    amount: string,
    currentAllocations: AppSessionAllocation[],
  ): Promise<void> {
    this.ensureInitialized();
    await this.appSessionService.withdrawFromAppSession(
      appSessionId,
      participant,
      asset,
      amount,
      currentAllocations,
    );
  }

  /**
   * Close Lightning Node (requires quorum approval)
   *
   * @param appSessionId - Lightning Node session ID
   * @param finalAllocations - Final fund distribution
   */
  async closeLightningNode(
    appSessionId: Hash,
    finalAllocations: AppSessionAllocation[],
  ): Promise<void> {
    this.ensureInitialized();
    await this.appSessionService.closeAppSession(
      appSessionId,
      finalAllocations,
    );
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get unified balance
   */
  async getUnifiedBalance(): Promise<LedgerBalance[]> {
    this.ensureInitialized();
    return await this.queryService.getLedgerBalances();
  }

  /**
   * Get all Lightning Nodes (App Sessions)
   *
   * @param status - Filter by status
   */
  async getLightningNodes(
    status?: 'open' | 'closed',
    participant?: string
  ): Promise<AppSession[]> {
    this.ensureInitialized();
    return await this.queryService.getAppSessions(status, participant);
  }

  /**
   * Get payment channels
   */
  async getChannels(): Promise<ChannelWithState[]> {
    this.ensureInitialized();
    return await this.queryService.getChannels();
  }

  /**
   * Get single Lightning Node by ID
   */
  async getLightningNode(appSessionId: Hash): Promise<AppSession> {
    this.ensureInitialized();
    return await this.queryService.getAppSession(appSessionId);
  }

  /**
   * Ping clearnode
   */
  async ping(): Promise<{ pong: string; timestamp: number }> {
    this.ensureInitialized();
    return await this.queryService.ping();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get Clearnode configuration
   */
  getConfig(): ClearnodeConfig {
    if (!this.clearnodeConfig) {
      throw new Error('Config not loaded. Call initialize() first.');
    }
    return this.clearnodeConfig;
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  /**
   * Disconnect from Clearnode
   */
  disconnect(): void {
    this.ws.disconnect();
    this.configLoader.disconnect();
    this.initialized = false;
    // Disconnect logs moved to debug level
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'NitroliteClient not initialized. Call initialize() first.',
      );
    }
  }
}
