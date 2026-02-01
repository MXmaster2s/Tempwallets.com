/**
 * DEPOSIT TO CUSTODY DTO
 *
 * Application Layer - Use Case Input/Output
 *
 * Deposits funds from user's wallet to Yellow Network custody contract.
 * This is an ON-CHAIN operation that credits the unified balance.
 *
 * Flow: Wallet (on-chain) → Custody Contract → Unified Balance (Yellow Network)
 */

export class DepositToCustodyDto {
  userId!: string;
  chain!: string;
  asset!: string;  // e.g., "usdc", "usdt"
  amount!: string; // e.g., "100.0"
}

export class DepositToCustodyResultDto {
  success!: boolean;
  approveTxHash!: string;
  depositTxHash!: string;
  chainId!: number;
  amount!: string;
  asset!: string;
  unifiedBalance!: string;
  message!: string;
}
