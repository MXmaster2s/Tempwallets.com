import { Injectable, Logger } from '@nestjs/common';
import Keyring from '@polkadot/keyring';
import { SeedManager } from '../../managers/seed.manager.js';
import {
  SubstrateChainKey,
  getChainConfig,
} from '../config/substrate-chain.config.js';
import { buildDerivationPath } from '../utils/derivation.util.js';
import { ensureCryptoReady } from '../utils/crypto-init.util.js';
import { ss58Util } from '../utils/ss58.util.js';

/**
 * Substrate Account Factory
 *
 * Issue #3: Seed Phrase Security Risk
 * - Always use userId instead of raw seed phrases
 * - Decrypt seed only when needed
 * - Clear seed from memory immediately after use
 */
export interface SubstrateAccount {
  address: string;
  publicKey: Uint8Array;
  chain: SubstrateChainKey;
  accountIndex: number;
}

@Injectable()
export class SubstrateAccountFactory {
  private readonly logger = new Logger(SubstrateAccountFactory.name);

  constructor(private readonly seedManager: SeedManager) {}

  /**
   * Create account for a chain
   *
   * @param userId - User ID (NOT raw seed phrase)
   * @param chain - Chain key
   * @param accountIndex - Account index (default: 0)
   * @param useTestnet - Whether to use testnet
   * @returns Substrate account with address and public key
   */
  async createAccount(
    userId: string,
    chain: SubstrateChainKey,
    accountIndex: number = 0,
    useTestnet?: boolean,
  ): Promise<SubstrateAccount> {
    // CRITICAL: Wait for WASM to be ready
    await ensureCryptoReady();

    // CRITICAL: Get seed from userId (not passed as parameter)
    let seedPhrase: string;
    try {
      seedPhrase = await this.seedManager.getSeed(userId);
    } catch (error) {
      this.logger.error(
        `Failed to get seed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }

    try {
      // Get chain configuration
      const chainConfig = getChainConfig(chain, useTestnet);

      // Build derivation path
      const derivationPath = buildDerivationPath(accountIndex);

      // Create keyring with SR25519
      const keyring = new Keyring({
        type: 'sr25519',
        ss58Format: chainConfig.ss58Prefix,
      });

      // Derive keypair from seed phrase
      const pair = keyring.createFromUri(`${seedPhrase}${derivationPath}`, {
        name: `${chain}-${accountIndex}`,
      });

      // Get public key
      const publicKey = pair.publicKey;

      // Get SS58 address
      const address = pair.address;

      // Debug: Log the generated address and expected prefix
      this.logger.debug(
        `Generated address for ${chain} (testnet: ${useTestnet}): ${address}, expected prefix: ${chainConfig.ss58Prefix}`,
      );

      // Validate address format (checksum)
      if (!ss58Util.validate(address)) {
        this.logger.error(
          `Address checksum validation failed for ${chain}. Address: ${address}`,
        );
        throw new Error(
          `Generated address has invalid checksum for chain ${chain}`,
        );
      }

      // Validate prefix matches expected chain prefix
      if (!ss58Util.validateWithPrefix(address, chainConfig.ss58Prefix)) {
        // Try to get more details about the address
        try {
          const decoded = ss58Util.decode(address);
          this.logger.error(
            `Address prefix mismatch for ${chain}. Address: ${address}, Expected prefix: ${chainConfig.ss58Prefix}, Detected prefix: ${decoded.prefix}`,
          );
        } catch (decodeError) {
          this.logger.error(
            `Address prefix validation failed for ${chain}. Address: ${address}, Expected prefix: ${chainConfig.ss58Prefix}`,
          );
        }
        throw new Error(
          `Generated address prefix mismatch for chain ${chain}: expected ${chainConfig.ss58Prefix}`,
        );
      }

      this.logger.debug(
        `Created account for ${chain} (index ${accountIndex}): ${address}`,
      );

      return {
        address,
        publicKey,
        chain,
        accountIndex,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create account for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      // CRITICAL: Seed phrase is cleared from memory when it goes out of scope
      // In a more secure environment, you might want to explicitly zero it
      // For now, relying on JavaScript garbage collection
    }
  }

  /**
   * Get keypair for signing (internal use)
   *
   * @param userId - User ID
   * @param chain - Chain key
   * @param accountIndex - Account index
   * @param useTestnet - Whether to use testnet
   * @returns Keyring pair for signing
   */
  async getKeypair(
    userId: string,
    chain: SubstrateChainKey,
    accountIndex: number = 0,
    useTestnet?: boolean,
  ) {
    await ensureCryptoReady();

    let seedPhrase: string;
    try {
      seedPhrase = await this.seedManager.getSeed(userId);
    } catch (error) {
      this.logger.error(
        `Failed to get seed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }

    try {
      const chainConfig = getChainConfig(chain, useTestnet);
      const derivationPath = buildDerivationPath(accountIndex);

      const keyring = new Keyring({
        type: 'sr25519',
        ss58Format: chainConfig.ss58Prefix,
      });

      return keyring.createFromUri(`${seedPhrase}${derivationPath}`);
    } catch (error) {
      this.logger.error(
        `Failed to get keypair for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
