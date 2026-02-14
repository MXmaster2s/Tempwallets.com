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
import { SDKChannelService } from './sdk-channel-service.js';
import { AppSessionService } from './app-session-service.js';
import { QueryService } from './query-service.js';
import type {
  NitroliteConfig,
  ChannelWithState,
  AppSession,
  AppSessionState,
  AppSessionIntent,
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
  private channelService: ChannelService | SDKChannelService;
  private appSessionService: AppSessionService;
  private queryService: QueryService;

  // SDK configuration
  private useSDK: boolean;

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
    useSDK?: boolean; // NEW: Use Yellow Network SDK
  }) {
    this.config = {
      wsUrl: options.wsUrl,
      useSessionKeys: options.useSessionKeys ?? true,
      application: options.application || 'tempwallets-lightning',
    };

    this.mainWallet = options.mainWallet;
    this.publicClient = options.publicClient;
    this.walletClient = options.walletClient;
    this.useSDK = options.useSDK ?? true; // Use SDK by default - it handles ABI encoding correctly for on-chain operations

    // Initialize WebSocket Manager
    this.ws = new WebSocketManager({
      url: this.config.wsUrl,
      reconnectAttempts: 3, // Reduced from 5
      reconnectDelay: 2000, // Increased from 1000ms to 2000ms
      maxReconnectDelay: 60000, // Increased from 30000ms to 60000ms (1 minute)
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
  /**
   * Post-reconnect sync: Invalidate the stale server-side session on reconnect.
   *
   * When the WebSocket closes and reconnects, Yellow Network's server resets the
   * session for that connection. The local session key still looks valid (expiry
   * hasn't passed), but the server will reject it for write operations.
   *
   * We solve this by clearing the local session here (a fast, in-memory operation —
   * no network call). Re-authentication happens lazily the next time the user
   * actually performs an operation, via the auth guards in createChannel(),
   * createLightningNode(), etc.
   */
  async postReconnectSync(): Promise<void> {
    if (this.config.useSessionKeys) {
      // Clear stale local session so isAuthenticated() returns false.
      // The next user operation will trigger a fresh auth automatically.
      this.auth.clearSession();
      console.log(
        '[NitroliteClient] Post-reconnect: Stale session cleared. Will re-authenticate on next operation.',
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      // Initialization logs moved to debug level
      return;
    }

    // Initialization logs moved to debug level

    // Step 1: Connect to WebSocket
    // Set up reconnection handlers for post-reconnect sync
    // DEFENSIVE GUARD: Handle WebSocket disconnects with re-sync
    this.ws.on('connect', async () => {
      // After reconnection, re-sync state
      if (this.initialized) {
        // Only sync if we were already initialized (this is a reconnect, not initial connect)
        await this.postReconnectSync();
      }
    });

    this.ws.on('disconnect', () => {
      console.warn(
        '[NitroliteClient] WebSocket disconnected. Will attempt reconnection...',
      );
    });

    this.ws.on('error', (error) => {
      console.error('[NitroliteClient] WebSocket error:', error);
    });

    await this.ws.connect();
    // Connection success logged at debug level

    // Step 2: Load configuration (contract addresses).
    // Pass the already-open this.ws so ConfigLoader reuses it instead of
    // opening a second parallel WebSocket connection to the same server.
    this.clearnodeConfig = await this.configLoader.loadConfig(this.ws);
    // Config loaded logged at debug level

    // Build custody addresses map
    const custodyAddresses = this.clearnodeConfig.networks.reduce(
      (acc, n) => {
        acc[n.chain_id] = n.custody_address;
        return acc;
      },
      {} as Record<number, Address>,
    );

    // Initialize Channel Service (SDK or Custom)
    if (this.useSDK) {
      console.log(
        '[NitroliteClient] Using Yellow Network SDK for channel operations',
      );

      // For SDK, we need to pick a primary chain. We'll use the first one or Base (8453) if available.
      const baseNetwork = this.clearnodeConfig.networks.find(
        (n) => n.chain_id === 8453,
      );
      const primaryNetwork = baseNetwork || this.clearnodeConfig.networks[0];

      if (!primaryNetwork) {
        throw new Error('No networks found in config');
      }

      this.channelService = new SDKChannelService(
        this.ws,
        this.auth,
        this.publicClient,
        this.walletClient,
        custodyAddresses,
        primaryNetwork.adjudicator_address,
        primaryNetwork.chain_id,
      );

      console.log(
        `[NitroliteClient] SDK initialized for chain ${primaryNetwork.chain_id}`,
      );
    } else {
      console.log(
        '[NitroliteClient] Using custom implementation for channel operations',
      );

      this.channelService = new ChannelService(
        this.ws,
        this.auth,
        this.publicClient,
        this.walletClient,
        custodyAddresses,
      );
    }

    // Step 3: Authenticate with session key (if enabled)
    if (this.config.useSessionKeys) {
      // Authentication logs moved to debug level
      await this.auth.authenticate({
        application: this.config.application,
        allowances: [
          {
            asset: 'usdc',
            amount: '1000', // 1000 USDC spending cap for this session
          },
        ],
        expiryHours: 24,
        scope:
          'transfer,app.create,app.submit,channel.create,channel.update,channel.close', // Include all channel operations
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
    await this.ensureAuthenticated();
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
   * @param fundsDestination - Destination address for funds (typically user's wallet)
   * @param token - Optional token address (recommended for proper allocation format)
   * @param participants - Optional channel participants (recommended for proper allocation format)
   * @returns Updated channel state
   */
  async resizeChannel(
    channelId: Hash,
    chainId: number,
    amount: bigint,
    fundsDestination: Address,
    token?: Address,
    participants?: [Address, Address],
  ): Promise<void> {
    this.ensureInitialized();
    await this.ensureAuthenticated();
    await this.channelService.resizeChannel(
      channelId,
      chainId,
      amount,
      fundsDestination,
      token,
      participants,
    );
  }

  /**
   * Close payment channel (final withdrawal to main wallet)
   *
   * @param channelId - Channel identifier
   * @param chainId - Blockchain chain ID
   * @param fundsDestination - Address to send funds to
   * @param token - Optional token address (recommended for proper allocation format)
   * @param participants - Optional channel participants (recommended for proper allocation format)
   */
  async closeChannel(
    channelId: Hash,
    chainId: number,
    fundsDestination: Address,
    token?: Address,
    participants?: [Address, Address],
  ): Promise<void> {
    this.ensureInitialized();
    await this.ensureAuthenticated();
    await this.channelService.closeChannel(
      channelId,
      chainId,
      fundsDestination,
      token,
      participants,
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
      quorum = 50, // Match session key weight (50 allows single-signature approval)
      token,
      initialAllocations = [],
      sessionData,
    } = options;

    await this.ensureAuthenticated();

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

  /**
   * Submit app state directly with final allocations.
   *
   * Per Yellow Network NitroRPC/0.4, allocations represent the FINAL state
   * after the operation, not the delta. The Clearnode computes deltas.
   *
   * @param appSessionId - App session ID
   * @param intent - DEPOSIT | OPERATE | WITHDRAW
   * @param version - Must be exactly currentVersion + 1
   * @param allocations - FINAL allocation state after this update
   */
  async submitAppState(
    appSessionId: Hash,
    intent: AppSessionIntent,
    version: number,
    allocations: AppSessionAllocation[],
  ): Promise<AppSessionState> {
    this.ensureInitialized();
    return await this.appSessionService.submitAppStateWithVersion(
      appSessionId,
      intent,
      version,
      allocations,
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
   * Get balances within a specific app session
   * Uses get_ledger_balances with app_session_id as account_id
   */
  async getAppSessionBalances(appSessionId: Hash): Promise<LedgerBalance[]> {
    this.ensureInitialized();
    return await this.queryService.getAppSessionBalances(appSessionId);
  }

  /**
   * Get all Lightning Nodes (App Sessions)
   *
   * @param status - Filter by status
   */
  async getLightningNodes(
    status?: 'open' | 'closed',
    participant?: string,
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
   * Re-sync channel state (re-fetch from Yellow Network)
   * Used when channel data is missing or inconsistent
   */
  async resyncChannelState(chainId: number): Promise<ChannelWithState | null> {
    this.ensureInitialized();
    return await this.channelService.resyncChannelState(chainId);
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
   * Get authentication signature (main wallet signature from auth_verify)
   */
  getAuthSignature(): string | null {
    return this.auth.getAuthSignature();
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

  /**
   * Ensure the session key is still valid with the server before any write operation.
   *
   * Called lazily by createChannel / resizeChannel / closeChannel / createLightningNode.
   * If the WebSocket reconnected (which clears the local session via postReconnectSync),
   * or if the 24-hour session expired, this re-authenticates once — no polling, no timers.
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      console.log(
        '[NitroliteClient] Session invalid or cleared — re-authenticating before operation...',
      );
      await this.auth.authenticate({
        application: this.config.application,
        allowances: [
          {
            asset: 'usdc',
            amount: '1000', // 1000 USDC spending cap for this session
          },
        ],
        expiryHours: 24,
        scope:
          'transfer,app.create,app.submit,channel.create,channel.update,channel.close',
      });
    }
  }
}
