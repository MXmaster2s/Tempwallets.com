import { Address } from 'viem';

/**
 * EIP-7702 Delegation Status
 *
 * Tracks whether an EOA has delegated to a smart account implementation
 */
export interface DelegationStatus {
  /** User ID */
  userId: string;
  /** Chain ID */
  chainId: number;
  /** EOA address */
  address: Address;
  /** Whether delegation is active on-chain */
  isDelegated: boolean;
  /** Smart account implementation address (if delegated) */
  delegationAddress?: Address;
  /** When authorization was signed */
  authorizedAt?: Date;
  /** Last verification timestamp */
  lastVerifiedAt?: Date;
}

/**
 * Database record for delegation tracking
 */
export interface DelegationRecord {
  id: string;
  walletId: string;
  address: string;
  chainId: number;
  delegationAddress: string;
  authorizedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for signing EIP-7702 authorization
 */
export interface AuthorizationParams {
  /** Smart account implementation to delegate to */
  implementationAddress: Address;
  /** Chain ID (0 for all chains - NOT RECOMMENDED) */
  chainId: number;
  /** Current EOA nonce */
  nonce: number;
}

/**
 * Result of delegation check
 */
export interface DelegationCheckResult {
  /** Whether account has code (delegated) */
  isDelegated: boolean;
  /** The code hash if delegated */
  codeHash?: string;
  /** Whether code matches expected implementation */
  isValidImplementation: boolean;
}

