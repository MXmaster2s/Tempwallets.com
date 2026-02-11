/**
 * Account types
 */
export enum AccountType {
  EOA = 'EOA', // Externally Owned Account (standard wallet)
  ERC4337 = 'ERC4337', // Smart Contract Account (ERC-4337)
}

/**
 * Base account interface
 */
export interface IAccount {
  getAddress(): Promise<string>;
  getBalance(): Promise<string>;
  send(to: string, amount: string): Promise<string>;
}

/**
 * Token transfer parameters
 */
export interface TokenTransferParams {
  to: string;
  amount: string;
  tokenAddress?: string;
  decimals?: number;
}

/**
 * Transaction result
 */
export interface TransactionResult {
  txHash: string;
  from: string;
  to: string;
  value: string;
  blockNumber?: number;
  timestamp?: number;
}

/**
 * Balance information
 */
export interface BalanceInfo {
  chain: string;
  address: string;
  nativeBalance: string;
  tokens: TokenBalance[];
}

/**
 * Token balance
 */
export interface TokenBalance {
  address: string | null; // null for native tokens
  symbol: string;
  balance: string;
  decimals: number;
  balanceHuman?: string;
  valueUsd?: number;
}
