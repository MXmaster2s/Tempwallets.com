/**
 * CUSTODY CONTRACT PORT (INTERFACE)
 *
 * Application Layer - Defines contract for custody operations
 *
 * Custody operations are ON-CHAIN transactions that move funds
 * between user's wallet and Yellow Network's custody contract.
 *
 * This creates/updates the "unified balance" in Yellow Network.
 */

export interface DepositParams {
  userPrivateKey: string;
  userAddress: string;
  tokenAddress: string;
  amount: bigint;
  chainId: number;
}

export interface WithdrawParams {
  userPrivateKey: string;
  userAddress: string;
  tokenAddress: string;
  amount: bigint;
  chainId: number;
}

export interface ICustodyContractPort {
  /**
   * Approve USDC/USDT spending for custody contract
   */
  approveToken(params: DepositParams): Promise<string>;

  /**
   * Deposit funds to custody contract (creates unified balance)
   * This is an on-chain transaction
   */
  deposit(params: DepositParams): Promise<string>;

  /**
   * Withdraw funds from custody contract back to wallet
   * This is an on-chain transaction
   */
  withdraw(params: WithdrawParams): Promise<string>;

  /**
   * Get unified balance from Yellow Network
   */
  getUnifiedBalance(userAddress: string, asset: string): Promise<string>;
}

/**
 * Dependency injection token
 */
export const CUSTODY_CONTRACT_PORT = Symbol('CUSTODY_CONTRACT_PORT');
