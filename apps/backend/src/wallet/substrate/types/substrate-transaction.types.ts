/**
 * Substrate Transaction Types
 *
 * Issue #2: Missing Transaction Signing Implementation
 * - Transaction construction, signing, and broadcasting types
 */

import { SubstrateChainKey } from '../config/substrate-chain.config.js';

/**
 * Transfer method type
 * - transferAllowDeath: Can kill account if balance drops to zero (recommended default)
 * - transferKeepAlive: Will fail if transfer would drop account below existential deposit
 */
export type TransferMethod = 'transferAllowDeath' | 'transferKeepAlive';

/**
 * Transaction parameters for constructing a transfer
 */
export interface TransferParams {
  from: string; // SS58 address
  to: string; // SS58 address
  amount: string; // Amount in smallest units (as string to avoid precision loss)
  chain: SubstrateChainKey;
  useTestnet?: boolean;
  transferMethod?: TransferMethod; // Default: 'transferAllowDeath'
}

/**
 * Transaction parameters for constructing any extrinsic
 */
export interface TransactionParams {
  from: string; // SS58 address
  chain: SubstrateChainKey;
  useTestnet?: boolean;
  method: string; // e.g., 'balances.transfer'
  args: Record<string, any>; // Method arguments
}

/**
 * Fee estimation result
 */
export interface FeeEstimate {
  partialFee: string; // Fee in smallest units
  weight: string; // Transaction weight
  class: string; // Transaction class (Normal, Operational, Mandatory)
}

/**
 * Transaction status
 */
export type TransactionStatus =
  | 'pending'
  | 'inBlock'
  | 'finalized'
  | 'failed'
  | 'error';

/**
 * Transaction result
 */
export interface TransactionResult {
  txHash: string; // Transaction hash
  blockHash?: string; // Block hash (if finalized)
  status: TransactionStatus;
  error?: string; // Error message if failed
}

/**
 * Transaction history entry
 */
export interface TransactionHistoryEntry {
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
  timestamp?: number;
  from: string;
  to?: string;
  amount?: string;
  fee?: string;
  status: TransactionStatus;
  method?: string; // Extrinsic method
  args?: Record<string, any>; // Method arguments
}

/**
 * Paginated transaction history
 */
export interface TransactionHistory {
  transactions: TransactionHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string; // For cursor-based pagination
}

/**
 * Signed transaction
 */
export interface SignedTransaction {
  txHash: string; // Pre-computed transaction hash
  signedTx: string; // Hex-encoded signed transaction
  nonce: number;
  era?: number; // Mortality era
}
