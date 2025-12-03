/**
 * Normalizes Aptos address to standard format
 * CRITICAL: Must always produce 66 characters (0x + 64 hex)
 */
export function normalizeAddress(address: string): string {
  if (!address) {
    throw new Error('Address cannot be empty');
  }

  // STRICT: Require 0x prefix
  if (!address.startsWith('0x')) {
    throw new Error('Address must start with 0x prefix');
  }

  // Remove 0x prefix
  let hex = address.slice(2);

  // CRITICAL: Validate hex before padding
  if (!/^[a-fA-F0-9]+$/.test(hex)) {
    throw new Error(`Invalid hex characters in address: ${address}`);
  }

  // CRITICAL: Check length before padding
  if (hex.length > 64) {
    throw new Error(`Address too long: ${hex.length} chars (max 64)`);
  }

  // Lowercase and pad to 64 chars
  hex = hex.toLowerCase().padStart(64, '0');

  return '0x' + hex;
}

/**
 * Validates Aptos address format
 * IMPORTANT: Call this before normalizeAddress in user input
 */
export function validateAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Must start with 0x and have 1-64 hex characters
  const regex = /^0x[a-fA-F0-9]{1,64}$/;
  return regex.test(address);
}

/**
 * Compare two addresses (handles different formats)
 */
export function areAddressesEqual(addr1: string, addr2: string): boolean {
  try {
    return normalizeAddress(addr1) === normalizeAddress(addr2);
  } catch {
    return false; // Invalid address = not equal
  }
}
