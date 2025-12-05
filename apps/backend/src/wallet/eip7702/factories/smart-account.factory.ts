import { Injectable, Logger } from '@nestjs/common';
import { Address, Hex } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { Eip7702RpcService } from '../services/eip7702-rpc.service.js';
import {
  getChainConfig,
  SIMPLE_ACCOUNT_7702_IMPLEMENTATION,
} from '../config/eip7702-chain.config.js';

/**
 * EIP-7702 Account Data
 *
 * SECURITY: Private key is derived on-demand and never stored
 */
export interface Eip7702AccountData {
  /** EOA address (same as before EIP-7702) */
  address: Address;
  /** Public key (hex) */
  publicKey: Hex;
  /** Whether delegation is set on-chain */
  isDelegated: boolean;
  /** Smart account implementation (if delegated) */
  delegationAddress?: Address;
}

/**
 * Internal account with private key (used only during operations)
 *
 * SECURITY CRITICAL: This type is only used internally during signing operations.
 * Private key must NEVER be:
 * - Logged
 * - Stored in database
 * - Returned in API responses
 * - Kept in memory longer than necessary
 */
export interface Eip7702AccountWithKey extends Eip7702AccountData {
  /** Private key - HANDLE WITH EXTREME CARE */
  privateKey: Hex;
}

/**
 * Smart Account Factory
 *
 * Creates EIP-7702 smart account instances from seed phrases.
 *
 * SECURITY FEATURES:
 * - Uses same derivation path as existing EVM wallets (m/44'/60'/0'/0/0)
 * - Private keys derived on-demand, never stored
 * - Validates seed phrase before derivation
 * - No private key logging
 *
 * INTEGRATION:
 * - Uses SeedManager for secure seed retrieval
 * - Same address across all EVM chains (EIP-7702 preserves EOA address)
 */
@Injectable()
export class SmartAccountFactory {
  private readonly logger = new Logger(SmartAccountFactory.name);

  // Standard EVM derivation path (same as MetaMask, etc.)
  private readonly DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0/0";

  constructor(private readonly rpcService: Eip7702RpcService) {}

  /**
   * Create account data from seed phrase
   *
   * SECURITY: Private key is derived but NOT stored in the returned object
   *
   * @param seedPhrase - BIP-39 mnemonic
   * @param chainId - Chain ID to check delegation status
   * @param accountIndex - Account index (default: 0)
   * @returns Account data WITHOUT private key
   */
  async createFromSeed(
    seedPhrase: string,
    chainId: number,
    accountIndex: number = 0,
  ): Promise<Eip7702AccountData> {
    // Validate seed phrase
    const trimmedSeed = seedPhrase.trim();
    const wordCount = trimmedSeed.split(/\s+/).length;
    if (![12, 15, 18, 21, 24].includes(wordCount)) {
      throw new Error(
        `Invalid seed phrase: expected 12/15/18/21/24 words, got ${wordCount}`,
      );
    }

    // Derive account using viem
    const derivationPath = this.getDerivationPath(accountIndex);
    const account = mnemonicToAccount(trimmedSeed, {
      path: derivationPath,
    });

    const address = account.address;

    // Check delegation status on-chain
    const isDelegated = await this.rpcService.isDelegated(chainId, address);
    const isValidDelegation = isDelegated
      ? await this.rpcService.isValidDelegation(chainId, address)
      : false;

    this.logger.debug(
      `Created account ${address} (delegated: ${isDelegated}, valid: ${isValidDelegation})`,
    );

    return {
      address,
      publicKey: account.publicKey,
      isDelegated,
      delegationAddress: isValidDelegation
        ? SIMPLE_ACCOUNT_7702_IMPLEMENTATION
        : undefined,
    };
  }

  /**
   * Create account WITH private key for signing operations
   *
   * SECURITY CRITICAL:
   * - Private key must be used immediately and discarded
   * - NEVER log or store the returned private key
   * - Clear from memory after use
   *
   * @param seedPhrase - BIP-39 mnemonic
   * @param chainId - Chain ID
   * @param accountIndex - Account index (default: 0)
   * @returns Account data WITH private key
   */
  async createWithKey(
    seedPhrase: string,
    chainId: number,
    accountIndex: number = 0,
  ): Promise<Eip7702AccountWithKey> {
    // Validate seed phrase
    const trimmedSeed = seedPhrase.trim();
    const wordCount = trimmedSeed.split(/\s+/).length;
    if (![12, 15, 18, 21, 24].includes(wordCount)) {
      throw new Error(
        `Invalid seed phrase: expected 12/15/18/21/24 words, got ${wordCount}`,
      );
    }

    // Derive account using viem
    const derivationPath = this.getDerivationPath(accountIndex);
    const account = mnemonicToAccount(trimmedSeed, {
      path: derivationPath,
    });

    const address = account.address;

    // Check delegation status on-chain
    const isDelegated = await this.rpcService.isDelegated(chainId, address);
    const isValidDelegation = isDelegated
      ? await this.rpcService.isValidDelegation(chainId, address)
      : false;

    // Get private key from the HD account
    // Note: viem's mnemonicToAccount doesn't expose privateKey directly
    // We need to use the account's sign capabilities or derive it manually
    const privateKey = this.derivePrivateKey(trimmedSeed, accountIndex);

    return {
      address,
      publicKey: account.publicKey,
      privateKey,
      isDelegated,
      delegationAddress: isValidDelegation
        ? SIMPLE_ACCOUNT_7702_IMPLEMENTATION
        : undefined,
    };
  }

  /**
   * Derive private key from seed phrase
   *
   * SECURITY: This is used internally only
   */
  private derivePrivateKey(seedPhrase: string, accountIndex: number): Hex {
    const derivationPath = this.getDerivationPath(accountIndex);

    // Use viem's HD wallet derivation
    const account = mnemonicToAccount(seedPhrase, {
      path: derivationPath,
    });

    // viem's account has getHdKey() but we need to extract the private key
    // For EVM, we use the standard approach
    const hdKey = account.getHdKey();
    if (!hdKey.privateKey) {
      throw new Error('Failed to derive private key from seed');
    }

    return `0x${Buffer.from(hdKey.privateKey).toString('hex')}` as Hex;
  }

  /**
   * Get derivation path for account index
   */
  private getDerivationPath(accountIndex: number): `m/44'/60'/${string}` {
    if (accountIndex < 0 || !Number.isInteger(accountIndex)) {
      throw new Error('Account index must be a non-negative integer');
    }
    return `m/44'/60'/0'/0/${accountIndex}`;
  }

  /**
   * Get address only (no private key derivation)
   *
   * @param seedPhrase - BIP-39 mnemonic
   * @param accountIndex - Account index
   * @returns EOA address
   */
  getAddress(seedPhrase: string, accountIndex: number = 0): Address {
    const trimmedSeed = seedPhrase.trim();
    const derivationPath = this.getDerivationPath(accountIndex);
    const account = mnemonicToAccount(trimmedSeed, {
      path: derivationPath,
    });
    return account.address;
  }

  /**
   * Verify seed phrase is valid
   *
   * @param seedPhrase - Mnemonic to validate
   * @returns true if valid
   */
  isValidSeedPhrase(seedPhrase: string): boolean {
    try {
      const trimmedSeed = seedPhrase.trim();
      const wordCount = trimmedSeed.split(/\s+/).length;
      if (![12, 15, 18, 21, 24].includes(wordCount)) {
        return false;
      }

      // Try to derive an account - will throw if invalid
      mnemonicToAccount(trimmedSeed, {
        path: this.DEFAULT_DERIVATION_PATH as `m/44'/60'/${string}`,
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check delegation status for an address
   *
   * @param chainId - Chain ID
   * @param address - EOA address
   * @returns Delegation status
   */
  async checkDelegationStatus(
    chainId: number,
    address: Address,
  ): Promise<{
    isDelegated: boolean;
    isValidImplementation: boolean;
    delegationAddress?: Address;
  }> {
    const isDelegated = await this.rpcService.isDelegated(chainId, address);

    if (!isDelegated) {
      return {
        isDelegated: false,
        isValidImplementation: false,
      };
    }

    const isValidImplementation = await this.rpcService.isValidDelegation(
      chainId,
      address,
    );

    return {
      isDelegated: true,
      isValidImplementation,
      delegationAddress: isValidImplementation
        ? SIMPLE_ACCOUNT_7702_IMPLEMENTATION
        : undefined,
    };
  }
}

