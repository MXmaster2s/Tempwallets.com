import { Injectable, Logger } from '@nestjs/common';
import { SeedManager } from '../../managers/seed.manager.js';
import { SubstrateAccountFactory } from '../factories/substrate-account.factory.js';
import {
  SubstrateChainKey,
  getEnabledChains,
  getChainConfig,
} from '../config/substrate-chain.config.js';
import { ss58Util } from '../utils/ss58.util.js';
import { ensureCryptoReady } from '../utils/crypto-init.util.js';

/**
 * Substrate Address Manager
 * 
 * Issue #7: Missing Address Validation Before Storage
 * Issue #14: Missing Error Recovery for Failed Derivations
 * - Derive addresses for all supported Substrate chains from same seed
 * - Validate SS58 format and prefix before storage
 * - Implement retry logic with exponential backoff
 * - Cache addresses per user
 */
export interface SubstrateAddresses {
  polkadot: string | null;
  hydration: string | null;
  bifrost: string | null;
  unique: string | null;
  paseo: string | null;
  paseoAssethub: string | null;
}

interface CachedAddresses {
  addresses: SubstrateAddresses;
  timestamp: number;
}

@Injectable()
export class SubstrateAddressManager {
  private readonly logger = new Logger(SubstrateAddressManager.name);
  private readonly addressCache = new Map<string, CachedAddresses>();
  private readonly ADDRESS_CACHE_TTL = 60 * 1000; // 1 minute cache

  constructor(
    private readonly seedManager: SeedManager,
    private readonly accountFactory: SubstrateAccountFactory,
  ) {}

  /**
   * Get all Substrate addresses for a user
   * 
   * @param userId - User ID
   * @param useTestnet - Whether to use testnet
   * @returns All Substrate addresses
   */
  async getAddresses(
    userId: string,
    useTestnet?: boolean,
  ): Promise<SubstrateAddresses> {
    // Check cache first
    const cacheKey = `${userId}:${useTestnet ? 'testnet' : 'mainnet'}`;
    const cached = this.addressCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.ADDRESS_CACHE_TTL) {
      return cached.addresses;
    }

    // Ensure wallet exists
    const hasSeed = await this.seedManager.hasSeed(userId);
    if (!hasSeed) {
      this.logger.debug(`No wallet found for user ${userId}. Auto-creating...`);
      await this.seedManager.createOrImportSeed(userId, 'random');
      this.logger.debug(`Successfully auto-created wallet for user ${userId}`);
    }

    // Derive addresses for all enabled chains
    const enabledChains = getEnabledChains();
    const addresses: SubstrateAddresses = {
      polkadot: null,
      hydration: null,
      bifrost: null,
      unique: null,
      paseo: null,
      paseoAssethub: null,
    };

    // Derive addresses in parallel with retry logic
    const derivationPromises = enabledChains.map((chain) =>
      this.deriveAndValidateAddressWithRetry(userId, chain, useTestnet),
    );

    const results = await Promise.allSettled(derivationPromises);

    // Process results
    enabledChains.forEach((chain, index) => {
      const result = results[index];
      if (result && result.status === 'fulfilled') {
        addresses[chain] = result.value;
      } else if (result && result.status === 'rejected') {
        this.logger.error(
          `Failed to derive address for ${chain}: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`,
        );
        addresses[chain] = null;
      } else {
        this.logger.error(`No result for ${chain}`);
        addresses[chain] = null;
      }
    });

    // Cache the results
    this.addressCache.set(cacheKey, {
      addresses,
      timestamp: Date.now(),
    });

    return addresses;
  }

  /**
   * Get address for a specific chain
   * 
   * @param userId - User ID
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns SS58 address or null
   */
  async getAddressForChain(
    userId: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<string | null> {
    const addresses = await this.getAddresses(userId, useTestnet);
    return addresses[chain] ?? null;
  }

  /**
   * Derive and validate address with retry logic
   * 
   * @param userId - User ID
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @returns SS58 address
   */
  async deriveAndValidateAddressWithRetry(
    userId: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
    maxRetries: number = 3,
  ): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.deriveAndValidateAddress(userId, chain, useTestnet);
      } catch (error) {
        if (attempt === maxRetries - 1) {
          this.logger.error(
            `Failed to derive address for ${chain} after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt);
        this.logger.warn(
          `Retry ${attempt + 1}/${maxRetries} for ${chain} after ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed to derive address for ${chain} after ${maxRetries} attempts`);
  }

  /**
   * Derive and validate address
   * 
   * @param userId - User ID
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns SS58 address
   */
  private async deriveAndValidateAddress(
    userId: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<string> {
    // Ensure WASM is ready
    await ensureCryptoReady();

    // Get chain configuration
    const chainConfig = getChainConfig(chain, useTestnet);

    // Create account (derives address)
    const account = await this.accountFactory.createAccount(
      userId,
      chain,
      0, // Default account index
      useTestnet,
    );

    const address = account.address;

    // Validate format
    if (!ss58Util.validate(address)) {
      throw new Error(`Invalid SS58 address generated for ${chain}`);
    }

    // Validate prefix matches chain
    if (!ss58Util.validateWithPrefix(address, chainConfig.ss58Prefix)) {
      throw new Error(
        `Address prefix mismatch for ${chain}: expected ${chainConfig.ss58Prefix}`,
      );
    }

    this.logger.debug(`Derived and validated address for ${chain}: ${address}`);

    return address;
  }

  /**
   * Clear address cache for a user
   * 
   * @param userId - User ID
   */
  clearCache(userId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.addressCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.addressCache.delete(key));
    this.logger.debug(`Cleared address cache for user ${userId}`);
  }

  /**
   * Clear all address cache
   */
  clearAllCache(): void {
    this.addressCache.clear();
    this.logger.debug('Cleared all address cache');
  }
}

