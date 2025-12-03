import { Injectable, Logger } from '@nestjs/common';
import { Account, AccountAddress, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { AptosAddressManager } from '../managers/aptos-address.manager.js';
import { normalizeAddress } from '../utils/address.utils.js';

/**
 * Aptos Account Interface
 */
export interface AptosAccountData {
  address: string; // Normalized Aptos account address (0x...)
  publicKey: string; // Public key (hex)
  privateKey: string; // Private key (hex) - handle with care!
  accountAddress: AccountAddress; // Aptos SDK AccountAddress object
  account: Account; // Aptos SDK Account object
}

/**
 * Aptos Account Factory
 * Creates Aptos account instances from seed phrases or private keys
 */
@Injectable()
export class AptosAccountFactory {
  private readonly logger = new Logger(AptosAccountFactory.name);

  constructor(private readonly addressManager: AptosAddressManager) {}

  /**
   * Create account from seed phrase
   * @param seedPhrase - BIP-39 mnemonic seed phrase
   * @param accountIndex - Account index (default: 0)
   * @returns Aptos account data
   */
  async createAccountFromSeed(
    seedPhrase: string,
    accountIndex: number = 0,
  ): Promise<AptosAccountData> {
    if (!seedPhrase || typeof seedPhrase !== 'string') {
      throw new Error('Seed phrase is required');
    }

    // Validate BIP-39 word count
    const trimmedSeed = seedPhrase.trim();
    const wordCount = trimmedSeed.split(/\s+/).length;
    if (![12, 15, 18, 21, 24].includes(wordCount)) {
      throw new Error(
        `Invalid seed phrase: expected 12/15/18/21/24 words, got ${wordCount}`
      );
    }

    // Validate account index
    if (accountIndex < 0 || !Number.isInteger(accountIndex)) {
      throw new Error('Account index must be a non-negative integer');
    }

    try {
      // Derive keypair using address manager
      const account = await this.addressManager.deriveKeypair(
        trimmedSeed,
        accountIndex,
      );

      // Get normalized address
      const addressString = account.accountAddress.toString();
      if (!addressString) {
        throw new Error('Failed to derive address from seed phrase');
      }
      const address = normalizeAddress(addressString);

      // Extract keys - account is Ed25519Account which has privateKey property
      const publicKey = account.publicKey.toString();
      const privateKey = account.privateKey.toString();

      this.logger.debug(`Created Aptos account from seed: ${address}`);

      return {
        address,
        publicKey,
        privateKey,
        accountAddress: account.accountAddress,
        account,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to create account from seed', {
        accountIndex,
        error: message,
      });
      throw error; // Re-throw original error to preserve stack
    }
  }

  /**
   * Create account from private key
   * @param privateKey - Private key in hex format
   * @returns Aptos account data
   */
  createAccountFromPrivateKey(privateKey: string): AptosAccountData {
    if (!privateKey || typeof privateKey !== 'string') {
      throw new Error('Private key is required');
    }

    try {
      // Clean the private key - remove 0x prefix if present
      const cleanKey = privateKey.startsWith('0x')
        ? privateKey.slice(2)
        : privateKey;

      // Validate hex characters
      if (!/^[0-9a-fA-F]+$/.test(cleanKey)) {
        throw new Error('Private key must contain only hex characters');
      }

      // Validate length (Ed25519 private key must be 32 bytes = 64 hex chars)
      if (cleanKey.length !== 64) {
        throw new Error(
          `Invalid private key length: ${cleanKey.length} chars (expected 64 hex chars for Ed25519)`
        );
      }

      // Create Ed25519PrivateKey from hex string
      const ed25519PrivateKey = new Ed25519PrivateKey(`0x${cleanKey.toLowerCase()}`);
      
      // Create account from private key using SDK's proper API
      const account = Account.fromPrivateKey({ 
        privateKey: ed25519PrivateKey,
        legacy: true,  // Use legacy Ed25519Account for compatibility
      });

      // Get normalized address
      const addressString = account.accountAddress.toString();
      if (!addressString) {
        throw new Error('Failed to derive address from private key');
      }
      const address = normalizeAddress(addressString);

      // Extract keys
      const publicKey = account.publicKey.toString();
      const privateKeyHex = account.privateKey.toString();

      this.logger.debug(`Created Aptos account from private key: ${address}`);

      return {
        address,
        publicKey,
        privateKey: privateKeyHex,
        accountAddress: account.accountAddress,
        account,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to create account from private key', {
        error: message,
      });
      throw error; // Re-throw original error to preserve stack
    }
  }

  /**
   * Alias for createAccountFromSeed
   * @param mnemonic - BIP-39 mnemonic
   * @param accountIndex - Account index (default: 0)
   * @returns Aptos account data
   */
  async createAccountFromMnemonic(
    mnemonic: string,
    accountIndex: number = 0,
  ): Promise<AptosAccountData> {
    return this.createAccountFromSeed(mnemonic, accountIndex);
  }
}

