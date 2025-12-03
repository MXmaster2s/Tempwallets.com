import {
  encodeAddress,
  decodeAddress,
  checkAddress,
} from '@polkadot/util-crypto';
import { Logger } from '@nestjs/common';

/**
 * SS58 Address Utilities with Validation
 *
 * Issue #7: Missing Address Validation Before Storage
 * - Validates SS58 format and checksum before accepting addresses
 * - Validates prefix matches expected chain prefix
 * - Prevents cross-chain address confusion
 */
export class SS58Util {
  private readonly logger = new Logger(SS58Util.name);

  /**
   * Encode a public key or address to SS58 format
   *
   * @param address - Public key (Uint8Array) or SS58 address
   * @param prefix - SS58 prefix for the chain
   * @returns SS58 encoded address
   */
  encode(address: Uint8Array | string, prefix: number): string {
    try {
      // If already a string, decode first to get the raw public key
      let publicKey: Uint8Array;
      if (typeof address === 'string') {
        publicKey = decodeAddress(address);
      } else {
        publicKey = address;
      }

      return encodeAddress(publicKey, prefix);
    } catch (error) {
      this.logger.error(
        `Failed to encode address: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error(
        `Invalid address for encoding: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Decode SS58 address to public key
   *
   * @param address - SS58 encoded address
   * @returns Decoded public key and prefix information
   */
  decode(address: string): { publicKey: Uint8Array; prefix: number } {
    try {
      const publicKey = decodeAddress(address);

      // Try common prefixes to detect which one matches
      // Common prefixes: 0 (Polkadot), 2 (Kusama), 42 (Substrate generic/testnet), 6 (Bifrost), 7 (Unique), 47 (AssetHub), 63 (Hydration)
      const commonPrefixes = [0, 2, 42, 6, 7, 47, 63];
      let detectedPrefix: number | null = null;

      for (const prefix of commonPrefixes) {
        const result = checkAddress(address, prefix);
        const [isValid] = result;
        if (isValid) {
          detectedPrefix = prefix;
          break;
        }
      }

      if (detectedPrefix === null) {
        // If none of the common prefixes match, try to infer from address format
        // Addresses starting with '1' are usually prefix 0, '5' are usually prefix 42, etc.
        // But this is a fallback - the address should match one of the common prefixes
        this.logger.warn(
          `Could not detect prefix for address ${address}, using fallback detection`,
        );
        // Default to 42 (Substrate generic) as it's commonly used for testnets
        detectedPrefix = 42;
      }

      return { publicKey, prefix: detectedPrefix };
    } catch (error) {
      this.logger.error(
        `Failed to decode address: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error(
        `Invalid SS58 address: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Validate SS58 address format and checksum
   *
   * @param address - SS58 encoded address
   * @returns true if valid
   */
  validate(address: string): boolean {
    try {
      // Try to decode the address - if it succeeds, the address is valid
      // decodeAddress will throw if the checksum is invalid
      decodeAddress(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate SS58 address and check prefix matches expected chain prefix
   *
   * @param address - SS58 encoded address
   * @param expectedPrefix - Expected SS58 prefix for the chain
   * @returns true if valid and prefix matches
   */
  validateWithPrefix(address: string, expectedPrefix: number): boolean {
    try {
      // checkAddress(address, prefix) returns [isValid, errorMessage]
      // If isValid is true, the address is valid for that prefix
      // If isValid is false, the second element contains the error message
      const result = checkAddress(address, expectedPrefix);
      const [isValid, errorMessage] = result;

      if (!isValid) {
        // If validation fails, log the error for debugging
        if (errorMessage && typeof errorMessage === 'string') {
          this.logger.warn(
            `Address validation failed for prefix ${expectedPrefix}: ${errorMessage}`,
          );
        }
        return false;
      }

      // If isValid is true, the address is valid for the expected prefix
      return true;
    } catch (error) {
      this.logger.error(
        `SS58 validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Validate and decode address, ensuring prefix matches
   *
   * @param address - SS58 encoded address
   * @param expectedPrefix - Expected SS58 prefix
   * @returns Decoded public key
   * @throws Error if validation fails
   */
  validateAndDecode(address: string, expectedPrefix: number): Uint8Array {
    if (!this.validateWithPrefix(address, expectedPrefix)) {
      throw new Error(
        `Invalid SS58 address or prefix mismatch: expected prefix ${expectedPrefix}`,
      );
    }

    return decodeAddress(address);
  }

  /**
   * Detect SS58 prefix from address (inspired by Edgeware example)
   * Uses decodeAddress which works regardless of prefix, then detects which prefix matches
   *
   * @param address - SS58 encoded address
   * @returns Detected prefix number, or null if cannot be determined
   */
  detectPrefix(address: string): number | null {
    try {
      // First validate the address is decodable
      decodeAddress(address);

      // Try common prefixes to detect which one matches
      // Common prefixes: 0 (Polkadot), 2 (Kusama), 42 (Substrate generic/testnet), 6 (Bifrost), 7 (Unique), 47 (AssetHub), 63 (Hydration)
      const commonPrefixes = [0, 2, 42, 6, 7, 47, 63];

      for (const prefix of commonPrefixes) {
        const result = checkAddress(address, prefix);
        const [isValid] = result;
        if (isValid) {
          return prefix;
        }
      }

      // If none match, return null (address is valid but prefix unknown)
      this.logger.warn(`Could not detect prefix for address ${address}`);
      return null;
    } catch (error) {
      this.logger.error(
        `Failed to detect prefix: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Decode address to public key bytes (prefix-agnostic, like Edgeware example)
   *
   * @param address - SS58 encoded address
   * @returns Decoded public key as Uint8Array
   */
  decodeToBytes(address: string): Uint8Array {
    try {
      return decodeAddress(address);
    } catch (error) {
      this.logger.error(
        `Failed to decode address: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error(
        `Invalid SS58 address: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

// Export singleton instance
export const ss58Util = new SS58Util();
