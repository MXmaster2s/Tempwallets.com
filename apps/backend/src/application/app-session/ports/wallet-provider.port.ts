/**
 * WALLET PROVIDER PORT (INTERFACE)
 *
 * Application Layer - Defines contract for wallet operations
 *
 * This port abstracts wallet address resolution and signing operations.
 * The infrastructure layer provides concrete implementations.
 *
 * Simplification from current code:
 * - No EOA vs ERC-4337 distinction (Yellow Network doesn't care)
 * - Just needs an address that can sign EIP-712 messages
 * - Removes unnecessary complexity
 */

export interface WalletInfo {
  address: string;
  canSign: boolean;
}

/**
 * Wallet Provider Port Interface
 */
export interface IWalletProviderPort {
  /**
   * Get wallet address for user and chain
   * Auto-creates wallet if it doesn't exist
   */
  getWalletAddress(userId: string, chain: string): Promise<string>;

  /**
   * Get private key for user's wallet on a specific chain
   * Needed for signing transactions (e.g., custody deposits)
   */
  getPrivateKey(userId: string, chain: string): Promise<string>;

  /**
   * Get all wallet addresses for a user
   * Returns map of chain -> address
   */
  getAllWalletAddresses(userId: string): Promise<Record<string, string>>;
}

/**
 * Dependency injection token
 */
export const WALLET_PROVIDER_PORT = Symbol('WALLET_PROVIDER_PORT');
