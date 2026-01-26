/**
 * Yellow Network (Nitrolite) Integration
 *
 * Public API exports for Yellow Network integration.
 *
 * Usage:
 * ```typescript
 * import { NitroliteClient, loadYellowNetworkConfig } from './services/yellow-network';
 *
 * // Load config on startup
 * const config = await loadYellowNetworkConfig(process.env.YELLOW_NETWORK_WS_URL!);
 *
 * // Initialize client
 * const client = new NitroliteClient({
 *   wsUrl: process.env.YELLOW_NETWORK_WS_URL!,
 *   mainWallet,
 *   publicClient,
 *   walletClient
 * });
 *
 * await client.initialize();
 * ```
 */

// ============================================================================
// Main Client
// ============================================================================
export { NitroliteClient } from './nitrolite-client.js';

// ============================================================================
// Configuration
// ============================================================================
export {
  ConfigLoader,
  initializeConfigLoader,
  getConfigLoader,
  loadYellowNetworkConfig,
} from './config-loader.js';

// ============================================================================
// Services (for advanced usage)
// ============================================================================
export { WebSocketManager } from './websocket-manager.js';
export {
  SessionKeyAuth,
  MainWalletAuth,
  type MainWallet,
} from './session-auth.js';
export { ChannelService } from './channel-service.js';
export { AppSessionService } from './app-session-service.js';
export { QueryService } from './query-service.js';

// ============================================================================
// Types
// ============================================================================
export type {
  // RPC Types
  RPCRequest,
  RPCResponse,
  RPCRequestArray,
  RPCResponseArray,

  // Channel Types
  Channel,
  ChannelState,
  ChannelWithState,
  StateIntent,
  Allocation,

  // App Session Types
  AppDefinition,
  AppSession,
  AppSessionState,
  AppSessionAllocation,
  AppSessionIntent,
  AppSessionProtocol,

  // Authentication Types
  AuthRequestParams,
  AuthChallengeResponse,
  AuthVerifyParams,
  AuthVerifyResponse,
  SessionKeyAllowance,

  // Query Types
  LedgerBalance,
  LedgerTransaction,
  NetworkConfig,
  ClearnodeConfig,

  // Configuration Types
  NitroliteConfig,
  WebSocketConfig,
  ConnectionState,

  // Service Response Types
  ServiceResponse,
  SuccessResponse,
  ErrorResponse,

  // Lightning Node Types
  CreateLightningNodeRequest,
  LightningNodeDepositRequest,
  LightningNodeTransferRequest,
  LightningNodeCloseRequest,
} from './types.js';

// ============================================================================
// Type Guards
// ============================================================================
export { isErrorResponse, isSuccessResponse } from './types.js';