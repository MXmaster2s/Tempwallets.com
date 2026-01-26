import { Injectable, Logger } from '@nestjs/common';
import { english, generateMnemonic } from 'viem/accounts';
import { ISeedManager } from '../interfaces/wallet.interfaces.js';
import { SeedRepository } from '../seed.repository.js';
import { WalletHistoryRepository } from '../repositories/wallet-history.repository.js';
import { validateMnemonic } from '../utils/validation.utils.js';

/**
 * Seed Manager
 * Handles creation, validation, and storage of seed phrases (mnemonics)
 * Uses the same HD wallet standard as Tether WDK for compatibility
 */
@Injectable()
export class SeedManager implements ISeedManager {
  private readonly logger = new Logger(SeedManager.name);

  constructor(
    private seedRepository: SeedRepository,
    private walletHistoryRepo: WalletHistoryRepository,
  ) {}

  /**
   * Create a random seed phrase (12 words)
   * Uses viem's BIP-39 mnemonic generation
   */
  createRandomSeed(): string {
    const seedPhrase = generateMnemonic(english);
    this.logger.log('Generated random seed phrase (12 words)');
    return seedPhrase;
  }

  /**
   * Validate mnemonic phrase
   * @param mnemonic - The mnemonic to validate
   * @returns true if valid, throws error otherwise
   */
  validateMnemonic(mnemonic: string): boolean {
    return validateMnemonic(mnemonic);
  }

  /**
   * Store seed phrase for a user
   * @param userId - The user ID
   * @param seedPhrase - The seed phrase to store
   */
  async storeSeed(
    userId: string,
    seedPhrase: string,
    expiresAt?: Date,
  ): Promise<void> {
    this.validateMnemonic(seedPhrase);

    await this.seedRepository.createOrUpdateSeed(userId, seedPhrase, expiresAt);

    const expiryMsg = expiresAt
      ? ` (expires: ${expiresAt.toISOString()})`
      : ' (permanent)';

    this.logger.log(`Stored seed phrase for user ${userId}${expiryMsg}`);
  }

  /**
   * Get seed phrase for a user
   * @param userId - The user ID
   * @returns The seed phrase
   */
  async getSeed(userId: string): Promise<string> {
    return this.seedRepository.getSeedPhrase(userId);
  }

  /**
   * Check if user has a seed phrase
   * @param userId - The user ID
   * @returns true if seed exists
   */
  async hasSeed(userId: string): Promise<boolean> {
    return this.seedRepository.hasSeed(userId);
  }

  /**
   * Create or import seed for a user
   * @param userId - The user ID
   * @param mode - 'random' to generate new, 'mnemonic' to import
   * @param mnemonic - Optional mnemonic to import
   * @param ttlHours - Optional timer for wallet expiry(hr)
   */
  async createOrImportSeed(
    userId: string,
    mode: 'random' | 'mnemonic',
    mnemonic?: string,
    ttlHours?: number,
  ): Promise<void> {
    let seedPhrase: string;

    if (mode === 'random') {
      seedPhrase = this.createRandomSeed();
      this.logger.log(`Generated random seed phrase for user ${userId}`);
    } else if (mode === 'mnemonic') {
      if (!mnemonic) {
        throw new Error('Mnemonic is required when mode is "mnemonic"');
      }
      this.validateMnemonic(mnemonic);
      seedPhrase = mnemonic;
      this.logger.log(`Imported mnemonic for user ${userId}`);
    } else {
      throw new Error('Mode must be either "random" or "mnemonic"');
    }
    let expiresAt: Date | undefined;
    if (ttlHours !== undefined && ttlHours > 0) {
      const millisecondsToAdd = ttlHours * 60 * 60 * 1000;
      expiresAt = new Date(Date.now() + millisecondsToAdd);
      this.logger.log(
        `Wallet will expire at ${expiresAt.toISOString()} (in ${ttlHours} hours)`,
      );
    }

    await this.storeSeed(userId, seedPhrase, expiresAt);
  }
}
