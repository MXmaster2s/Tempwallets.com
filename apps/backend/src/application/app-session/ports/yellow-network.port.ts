/**
 * YELLOW NETWORK PORT (INTERFACE)
 *
 * Application Layer - Defines contract for Yellow Network integration
 *
 * This is a PORT in the Hexagonal Architecture (Ports & Adapters pattern).
 * The application layer defines WHAT it needs, not HOW it's implemented.
 *
 * Infrastructure layer provides the ADAPTER that implements this interface.
 *
 * Why use ports?
 * - Dependency Inversion: Application doesn't depend on infrastructure
 * - Testability: Easy to mock for unit tests
 * - Flexibility: Can swap Yellow Network for different implementation
 */

export interface CreateSessionParams {
  sessionId: string;
  definition: {
    protocol: string;
    participants: string[];
    weights: number[];
    quorum: number;
    challenge: number;
    nonce: number;
  };
  allocations: Array<{
    participant: string;
    asset: string;
    amount: string;
  }>;
}

export interface UpdateSessionParams {
  sessionId: string;
  intent: 'DEPOSIT' | 'OPERATE' | 'WITHDRAW';
  allocations: Array<{
    participant: string;
    asset: string;
    amount: string;
  }>;
}

export interface YellowSessionData {
  app_session_id: string;
  definition: {
    protocol: string;
    participants: string[];
    weights: number[];
    quorum: number;
    challenge: number;
    nonce: number;
  };
  allocations: Array<{
    participant: string;
    asset: string;
    amount: string;
  }>;
  version: number;
  status: 'open' | 'closed';
  session_data?: any;
}

/**
 * Yellow Network Port Interface
 *
 * Defines all operations needed to interact with Yellow Network.
 */
export interface IYellowNetworkPort {
  /**
   * Authenticate wallet with Yellow Network
   * Creates session keys and establishes WebSocket connection
   *
   * @param userId - User ID for seed phrase lookup
   * @param walletAddress - Wallet address to authenticate
   */
  authenticate(userId: string, walletAddress: string): Promise<void>;

  /**
   * Create a new app session
   */
  createSession(params: CreateSessionParams): Promise<YellowSessionData>;

  /**
   * Update app session allocations
   * Used for deposits, withdrawals, and transfers
   */
  updateSession(params: UpdateSessionParams): Promise<YellowSessionData>;

  /**
   * Close app session
   * Returns funds to unified balance
   */
  closeSession(
    sessionId: string,
    finalAllocations: Array<{
      participant: string;
      asset: string;
      amount: string;
    }>
  ): Promise<void>;

  /**
   * Query specific app session
   */
  querySession(sessionId: string): Promise<YellowSessionData>;

  /**
   * Query all app sessions for a participant
   */
  querySessions(filters: {
    participant?: string;
    status?: 'open' | 'closed';
  }): Promise<YellowSessionData[]>;
}

/**
 * Dependency injection token for Yellow Network port
 * Used in NestJS providers configuration
 */
export const YELLOW_NETWORK_PORT = Symbol('YELLOW_NETWORK_PORT');
