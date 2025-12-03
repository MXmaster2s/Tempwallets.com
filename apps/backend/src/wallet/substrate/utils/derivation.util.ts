/**
 * Derivation Path Utilities
 *
 * Issue #10: Account Index Parameter
 * - Implements proper derivation path with account indexing
 * - Supports multiple accounts from same seed (HD wallet capability)
 */

/**
 * Build derivation path for Polkadot/Substrate
 * Standard path format: //44//354//{accountIndex}//0//0
 *
 * @param accountIndex - Account index (default: 0)
 * @returns Derivation path string
 */
export function buildDerivationPath(accountIndex: number = 0): string {
  if (accountIndex < 0) {
    throw new Error('Account index must be non-negative');
  }
  return `//44//354//${accountIndex}//0//0`;
}

/**
 * Parse derivation path to extract account index
 *
 * @param path - Derivation path string
 * @returns Account index or null if invalid
 */
export function parseDerivationPath(path: string): number | null {
  // Match pattern: //44//354//{index}//0//0
  const match = path.match(/^\/\/44\/\/354\/\/(\d+)\/\/0\/\/0$/);
  if (!match || !match[1]) {
    return null;
  }
  return parseInt(match[1], 10);
}

/**
 * Validate derivation path format
 *
 * @param path - Derivation path string
 * @returns true if valid
 */
export function isValidDerivationPath(path: string): boolean {
  return parseDerivationPath(path) !== null;
}

/**
 * Get default derivation path (account index 0)
 */
export function getDefaultDerivationPath(): string {
  return buildDerivationPath(0);
}
