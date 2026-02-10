/**
 * Yellow Network (Nitrolite/Clearnode) TypeScript Type Definitions
 *
 * These types define the interfaces for interacting with Yellow Network's
 * Nitrolite state channels and Clearnode WebSocket RPC protocol.
 *
 * References:
 * - Official Protocol Docs: https://docs.yellow.org/docs/protocol/introduction
 * - Implementation Checklist: /Users/monstu/Developer/crawl4Ai/yellow/docs_protocol_implementation-checklist.md
 * - App Sessions Guide: /Users/monstu/Developer/crawl4Ai/yellow/docs_protocol_off-chain_app-sessions.md
 */

import type { Address, Hash, Hex } from 'viem';

// ============================================================================
// RPC Message Format
// ============================================================================

/**
 * Compact JSON array format for RPC requests
 * Format: [requestId, method, params, timestamp]
 */
export type RPCRequestArray = [
  number, // requestId - unique identifier
  string, // method - RPC method name
  any, // params - method parameters (object or empty {})
  number, // timestamp - Unix timestamp in milliseconds
];

/**
 * RPC Request Wrapper with Signatures
 * Sent to clearnode WebSocket endpoint
 */
export interface RPCRequest {
  req: RPCRequestArray;
  sig: string[]; // ECDSA signatures (EIP-712 for private methods, empty for public)
}

/**
 * Compact JSON array format for RPC responses
 * Format: [requestId, method, result, timestamp]
 */
export type RPCResponseArray = [
  number, // requestId - matches request
  string, // method - same as request or 'error'
  any, // result - method response data or error object
  number?, // timestamp - optional server timestamp
];

/**
 * RPC Response Wrapper with Clearnode Signature
 * Received from clearnode WebSocket endpoint
 */
export interface RPCResponse {
  res: RPCResponseArray;
  sig?: string[]; // Clearnode signature (for verification)
  error?: {
    code?: string; // Error code (if any)
    message: string; // Descriptive error message
  };
}

// ============================================================================
// Channel Types (Payment Channels - 2 Party Only)
// ============================================================================

/**
 * Channel State Intent Enum
 * Defines the type of operation for channel state
 */
export enum StateIntent {
  INITIALIZE = 1, // Create channel
  RESIZE = 2, // Add/remove funds
  FINALIZE = 3, // Close channel
}

/**
 * Allocation in channel state
 * Format: [participantIndex, amount]
 */
export type Allocation = [bigint, bigint];

/**
 * Channel State Structure
 * Represents the current state of a payment channel
 */
export interface ChannelState {
  intent: StateIntent; // Operation intent
  version: bigint; // State version number
  data: Hex; // Application-specific data (usually '0x')
  allocations: Allocation[]; // Fund allocations per participant
}

/**
 * Channel Definition
 * Immutable channel configuration
 */
export interface Channel {
  participants: Address[]; // Dynamic array of participants (Yellow Network protocol uses address[], not address[2])
  adjudicator: Address; // Adjudicator contract address
  challenge: bigint; // Challenge period in seconds
  nonce: bigint; // Unique nonce for channel ID
}

/**
 * Complete Channel with ID and State
 */
export interface ChannelWithState extends Channel {
  channelId: Hash; // Computed channel identifier
  state: ChannelState; // Current channel state
  chainId: number; // Blockchain chain ID
  status: 'active' | 'open' | 'resizing' | 'closed'; // Channel status
}

// ============================================================================
// App Session Types (Lightning Nodes - Multi-Party)
// ============================================================================

/**
 * App Session Protocol Version
 * Always use NitroRPC/0.4 for new implementations
 */
export type AppSessionProtocol = 'NitroRPC/0.2' | 'NitroRPC/0.4';

/**
 * App Session State Intent
 * Defines the type of operation within an app session
 */
export type AppSessionIntent = 'DEPOSIT' | 'OPERATE' | 'WITHDRAW';

/**
 * App Definition
 * Defines governance rules and participants for an app session
 */
export interface AppDefinition {
  protocol: AppSessionProtocol; // Protocol version (use 'NitroRPC/0.4')
  participants: Address[]; // Array of participant wallet addresses (2+)
  weights: number[]; // Voting weight per participant
  quorum: number; // Minimum weight required for approval
  challenge: number; // Challenge period in seconds (default: 86400)
  nonce: number; // Unique identifier (typically timestamp)
  application?: string; // Optional application name
}

/**
 * App Session Allocation
 * Human-readable format for participant funds
 */
export interface AppSessionAllocation {
  participant: Address; // Participant wallet address
  asset: string; // Asset identifier (e.g., 'usdc', 'eth')
  amount: string; // Amount in human-readable format (e.g., '100.0')
}

/**
 * App Session State
 * Complete state of an app session
 */
export interface AppSessionState {
  app_session_id: Hash; // Unique session identifier
  status: 'open' | 'closed'; // Session status
  version: number; // Current state version
  session_data?: string; // Application-specific state (JSON)
  allocations: AppSessionAllocation[]; // Current fund allocations
  signatures?: string[]; // Participant signatures
}

/**
 * Complete App Session with Metadata
 */
export interface AppSession extends AppSessionState {
  definition: AppDefinition; // App governance definition
  createdAt: Date; // Creation timestamp
  updatedAt: Date; // Last update timestamp
  closedAt?: Date; // Closure timestamp (if closed)
}

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Session Key Allowance
 * Spending limit per asset for session key
 */
export interface SessionKeyAllowance {
  asset: string; // Asset identifier (e.g., 'usdc')
  amount: string; // Maximum spendable amount
}

/**
 * Authentication Request Parameters
 * Step 1 of 3-step auth flow
 */
export interface AuthRequestParams {
  address: Address; // Main wallet address
  session_key: Address; // Session key wallet address
  application?: string; // Application identifier
  allowances?: SessionKeyAllowance[]; // Spending limits (unrestricted if omitted)
  scope?: string; // Permitted operations (not enforced yet)
  expires_at: number; // Expiration timestamp (ms)
}

/**
 * Authentication Challenge Response
 * Step 2 of 3-step auth flow (server-generated)
 */
export interface AuthChallengeResponse {
  challenge_message: string; // UUID to sign with session key
}

/**
 * Authentication Verify Parameters
 * Step 3 of 3-step auth flow
 */
export interface AuthVerifyParams {
  challenge: string; // Challenge from step 2
  session_key_sig: string; // Signature of challenge by session key
}

/**
 * Authentication Verify Response
 * Contains JWT token for authenticated session
 */
export interface AuthVerifyResponse {
  address: Address; // Authenticated wallet address
  session_key: Address; // Session key address
  jwt_token: string; // JWT for subsequent requests
  success: boolean; // Authentication status
}

/**
 * EIP-712 Typed Data for Authentication
 * Main wallet signs this during auth_verify
 */
export interface AuthPolicyTypedData {
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    Policy: Array<{ name: string; type: string }>;
    Allowance: Array<{ name: string; type: string }>;
  };
  primaryType: 'Policy';
  domain: {
    name: string; // Application name
  };
  message: {
    challenge: string;
    scope: string;
    wallet: Address;
    session_key: Address;
    expires_at: number;
    allowances: SessionKeyAllowance[];
  };
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Unified Balance Entry
 * Off-chain ledger balance for an asset
 */
export interface LedgerBalance {
  asset: string; // Asset identifier
  amount: string; // Balance in human-readable format
  locked: string; // Amount locked in app sessions
  available: string; // Available for operations
}

/**
 * Ledger Transaction Entry
 * Historical transaction record
 */
export interface LedgerTransaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'transfer' | 'app_deposit' | 'app_withdraw';
  asset: string;
  amount: string;
  from?: Address;
  to?: Address;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

/**
 * Network Configuration from get_config
 */
export interface NetworkConfig {
  chain_id: number;
  name: string;
  custody_address: Address;
  adjudicator_address: Address;
}

/**
 * Clearnode Configuration Response
 */
export interface ClearnodeConfig {
  broker_address: Address; // Clearnode wallet address for signature verification
  networks: NetworkConfig[]; // Supported blockchain networks
}

/**
 * Asset catalog entry (pushed via `assets` notification)
 */
export interface AssetInfo {
  token: Address; // ERC-20 address or 0x0 for native
  chain_id: number; // EVM chain id
  symbol: string; // Ticker symbol (e.g., 'usdc')
  decimals: number; // Token decimals
}

// ============================================================================
// WebSocket Connection Types
// ============================================================================

/**
 * WebSocket Connection State
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * WebSocket Manager Configuration
 */
export interface WebSocketConfig {
  url: string; // WebSocket endpoint URL
  reconnectAttempts?: number; // Max reconnection attempts (default: 5)
  reconnectDelay?: number; // Initial reconnect delay in ms (default: 1000)
  maxReconnectDelay?: number; // Max reconnect delay in ms (default: 30000)
  requestTimeout?: number; // Request timeout in ms (default: 30000)
}

// ============================================================================
// Nitrolite Client Configuration
// ============================================================================

/**
 * Main Nitrolite Client Configuration
 */
export interface NitroliteConfig {
  wsUrl: string; // Clearnode WebSocket URL
  useSessionKeys?: boolean; // Use session keys (recommended)
  defaultChainId?: number; // Default blockchain chain ID
  clearnodeAddress?: Address; // Clearnode address (for verification)
  custodyAddresses?: Record<number, Address>; // Custody contracts per chain
  adjudicatorAddresses?: Record<number, Address>; // Adjudicator contracts per chain
  application?: string; // Application identifier
  sessionKeyExpiry?: number; // Session key expiry in ms (default: 24h)
  scope?: string; // Requested auth scope (comma-separated permissions)
  allowances?: SessionKeyAllowance[]; // Optional spend caps per asset
}

// ============================================================================
// Service Method Response Types
// ============================================================================

/**
 * Generic Success Response
 */
export interface SuccessResponse<T = any> {
  ok: true;
  data: T;
}

/**
 * Generic Error Response
 */
export interface ErrorResponse {
  ok: false;
  error: string;
  details?: any;
}

/**
 * Service Response Type (Success or Error)
 */
export type ServiceResponse<T = any> = SuccessResponse<T> | ErrorResponse;

// ============================================================================
// Lightning Node (High-Level) Types
// ============================================================================

/**
 * Lightning Node Creation Request
 * High-level abstraction over App Session
 */
export interface CreateLightningNodeRequest {
  userId: string;
  participants: Address[];
  weights?: number[]; // Default: equal weights
  quorum?: number; // Default: majority (51%)
  token: string; // Asset (e.g., 'USDC')
  initialAllocations?: {
    participant: Address;
    amount: string;
  }[];
}

/**
 * Lightning Node Deposit Request
 * Add funds to Lightning Node from unified balance
 */
export interface LightningNodeDepositRequest {
  userId: string;
  appSessionId: Hash;
  amount: string;
  asset: string;
}

/**
 * Lightning Node Transfer Request
 * Gasless transfer within Lightning Node
 */
export interface LightningNodeTransferRequest {
  userId: string;
  appSessionId: Hash;
  recipientAddress: Address;
  amount: string;
  asset: string;
}

/**
 * Lightning Node Close Request
 * Close Lightning Node and return funds to unified balance
 */
export interface LightningNodeCloseRequest {
  userId: string;
  appSessionId: Hash;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(
  response: ServiceResponse,
): response is ErrorResponse {
  return response.ok === false;
}

/**
 * Type guard to check if response is successful
 */
export function isSuccessResponse<T>(
  response: ServiceResponse<T>,
): response is SuccessResponse<T> {
  return response.ok === true;
}
