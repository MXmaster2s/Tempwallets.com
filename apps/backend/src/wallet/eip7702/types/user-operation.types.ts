import { Address, Hex } from 'viem';

/**
 * ERC-4337 UserOperation structure (v0.7)
 *
 * SECURITY: All fields are validated before submission
 * - nonce must match EntryPoint's tracked nonce for sender
 * - signature must be valid for the sender account
 */
export interface UserOperation {
  /** Smart account address (sender of the UserOp) */
  sender: Address;
  /** Unique nonce to prevent replay */
  nonce: bigint;
  /** Factory address + initCode for account creation (empty if deployed) */
  factory?: Address;
  factoryData?: Hex;
  /** Encoded calls to execute */
  callData: Hex;
  /** Gas limit for execution phase */
  callGasLimit: bigint;
  /** Gas limit for validation phase */
  verificationGasLimit: bigint;
  /** Pre-verification gas (covers bundler costs) */
  preVerificationGas: bigint;
  /** Max fee per gas unit */
  maxFeePerGas: bigint;
  /** Max priority fee (tip) per gas unit */
  maxPriorityFeePerGas: bigint;
  /** Paymaster address (for sponsored transactions) */
  paymaster?: Address;
  /** Gas limit for paymaster validation */
  paymasterVerificationGasLimit?: bigint;
  /** Gas limit for paymaster postOp */
  paymasterPostOpGasLimit?: bigint;
  /** Paymaster-specific data */
  paymasterData?: Hex;
  /** Signature over the UserOp hash */
  signature: Hex;
  /** EIP-7702 authorization (only required for first transaction to set delegation) */
  authorization?: SignedAuthorization;
}

/**
 * Packed UserOperation for v0.7 EntryPoint
 * Used internally by bundlers
 */
export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex; // packed callGasLimit + verificationGasLimit
  preVerificationGas: bigint;
  gasFees: Hex; // packed maxPriorityFeePerGas + maxFeePerGas
  paymasterAndData: Hex;
  signature: Hex;
}

/**
 * EIP-7702 Signed Authorization
 *
 * SECURITY CRITICAL:
 * - chainId prevents cross-chain replay attacks
 * - nonce must match EOA's transaction nonce
 * - address is the smart account implementation to delegate to
 */
export interface SignedAuthorization {
  /** Smart account implementation contract address */
  address: Address;
  /** Chain ID this authorization is valid for (0 = all chains) */
  chainId: number;
  /** EOA transaction nonce at time of signing */
  nonce: number;
  /** ECDSA signature r component */
  r: Hex;
  /** ECDSA signature s component */
  s: Hex;
  /** ECDSA recovery id + 27 */
  yParity: number;
}

/**
 * UserOperation receipt after inclusion on-chain
 */
export interface UserOperationReceipt {
  /** Hash of the UserOperation */
  userOpHash: Hex;
  /** Actual transaction hash on-chain */
  transactionHash: Hex;
  /** Whether execution was successful */
  success: boolean;
  /** Block number of inclusion */
  blockNumber: bigint;
  /** Block hash */
  blockHash: Hex;
  /** Actual gas used */
  actualGasUsed: bigint;
  /** Actual gas cost in wei */
  actualGasCost: bigint;
  /** Reason for failure (if success=false) */
  reason?: string;
  /** Logs emitted during execution */
  logs?: Array<{
    address: Address;
    topics: Hex[];
    data: Hex;
  }>;
}

/**
 * Gas estimation result from bundler
 */
export interface GasEstimate {
  /** Pre-verification gas */
  preVerificationGas: bigint;
  /** Verification gas limit */
  verificationGasLimit: bigint;
  /** Call (execution) gas limit */
  callGasLimit: bigint;
  /** Recommended max fee per gas */
  maxFeePerGas: bigint;
  /** Recommended max priority fee */
  maxPriorityFeePerGas: bigint;
  /** Paymaster verification gas (if sponsored) */
  paymasterVerificationGasLimit?: bigint;
  /** Paymaster post-op gas (if sponsored) */
  paymasterPostOpGasLimit?: bigint;
}

/**
 * Paymaster sponsorship result
 */
export interface PaymasterSponsorshipResult {
  /** Paymaster contract address */
  paymaster: Address;
  /** Encoded paymaster data */
  paymasterData: Hex;
  /** Gas limit for paymaster verification */
  paymasterVerificationGasLimit: bigint;
  /** Gas limit for paymaster post-operation */
  paymasterPostOpGasLimit: bigint;
}

/**
 * Single call within a batch UserOperation
 */
export interface UserOpCall {
  /** Target contract address */
  to: Address;
  /** Value to send in wei */
  value: bigint;
  /** Calldata to execute */
  data: Hex;
}

/**
 * Parameters for building a UserOperation
 */
export interface BuildUserOpParams {
  /** Chain ID */
  chainId: number;
  /** Sender (smart account) address */
  sender: Address;
  /** Calls to execute */
  calls: UserOpCall[];
  /** Whether to request gas sponsorship */
  sponsored: boolean;
  /** EIP-7702 authorization (for first tx) */
  authorization?: SignedAuthorization;
}

/**
 * Result of UserOperation submission
 */
export interface UserOpSubmissionResult {
  /** UserOperation hash from bundler */
  userOpHash: Hex;
  /** Whether this was the first tx (included authorization) */
  isFirstTransaction: boolean;
}

/**
 * UserOperation status during lifecycle
 */
export type UserOpStatus =
  | 'pending' // Submitted to bundler
  | 'submitted' // Included in bundle tx
  | 'confirmed' // On-chain with sufficient confirmations
  | 'failed' // Execution reverted
  | 'dropped'; // Removed from mempool

/**
 * Full UserOperation status with details
 */
export interface UserOpStatusDetails {
  status: UserOpStatus;
  userOpHash: Hex;
  transactionHash?: Hex;
  blockNumber?: bigint;
  confirmations?: number;
  reason?: string;
}

