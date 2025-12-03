import { Injectable, Logger } from '@nestjs/common';
import { Account, AccountAddress, Ed25519Account } from '@aptos-labs/ts-sdk';
import { normalizeAddress, validateAddress } from '../utils/address.utils.js';

/**
 * Aptos Address Manager
 * Handles BIP-44 derivation for Aptos addresses
 * Derivation path: m/44'/637'/0'/0'/0' (637 is Aptos coin type)
 */
@Injectable()
export class AptosAddressManager {
  private readonly logger = new Logger(AptosAddressManager.name);

  /**
   * Derive Aptos address from seed phrase using BIP-44
   * @param seedPhrase - BIP-39 mnemonic seed phrase
   * @param accountIndex - Account index (default: 0)
   * @returns Normalized Aptos address (0x + 64 hex chars)
   */
  async deriveAddress(
    seedPhrase: string,
    accountIndex: number = 0,
  ): Promise<string> {
    if (!seedPhrase || typeof seedPhrase !== 'string') {
      throw new Error('Seed phrase is required');
    }

    try {
      // Derive account using Aptos SDK
      // BIP-44 path: m/44'/637'/0'/0'/{accountIndex} (637 is Aptos coin type)
      const derivationPath = `m/44'/637'/0'/0'/${accountIndex}`;
      const account = await Account.fromDerivationPath({
        mnemonic: seedPhrase,
        path: derivationPath,
      });

      const address = account.accountAddress.toString();
      const normalized = normalizeAddress(address);

      this.logger.debug(
        `Derived Aptos address for account index ${accountIndex}: ${normalized}`,
      );

      return normalized;
    } catch (error) {
      this.logger.error(
        `Failed to derive Aptos address: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Failed to derive Aptos address: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Derive Ed25519 keypair from seed phrase
   * @param seedPhrase - BIP-39 mnemonic seed phrase
   * @param accountIndex - Account index (default: 0)
   * @returns Aptos Account instance with keypair
   */
  async deriveKeypair(
    seedPhrase: string,
    accountIndex: number = 0,
  ): Promise<Ed25519Account> {
    if (!seedPhrase || typeof seedPhrase !== 'string') {
      throw new Error('Seed phrase is required');
    }

    try {
      // BIP-44 path: m/44'/637'/0'/0'/{accountIndex}
      const derivationPath = `m/44'/637'/0'/0'/${accountIndex}`;
      // Use legacy: true (default) to get Ed25519Account
      const account = Account.fromDerivationPath({
        mnemonic: seedPhrase,
        path: derivationPath,
        legacy: true,
      });

      this.logger.debug(
        `Derived Aptos keypair for account index ${accountIndex}`,
      );

      return account;
    } catch (error) {
      this.logger.error(
        `Failed to derive Aptos keypair: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Failed to derive Aptos keypair: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Normalize address to standard format
   * Delegates to address utils
   */
  normalizeAddress(address: string): string {
    return normalizeAddress(address);
  }

  /**
   * Validate Aptos address format
   * Delegates to address utils
   */
  validateAddress(address: string): boolean {
    return validateAddress(address);
  }

  /**
   * Get public key from address (if available)
   * Note: This requires the account object, not just the address
   */
  getPublicKeyFromAccount(account: Account): string {
    return account.publicKey.toString();
  }
}

