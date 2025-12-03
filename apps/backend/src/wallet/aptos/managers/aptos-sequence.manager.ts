import { Injectable, Logger } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { AptosAccountService } from '../services/aptos-account.service.js';
import { normalizeAddress } from '../utils/address.utils.js';

interface SequenceCache {
  value: number;
  lastUpdated: Date;
}

@Injectable()
export class AptosSequenceManager {
  private readonly logger = new Logger(AptosSequenceManager.name);

  // CRITICAL: One mutex per address
  private readonly locks = new Map<string, Mutex>();

  // Optional: Cache sequence numbers
  private readonly cache = new Map<string, SequenceCache>();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  // Memory leak prevention
  private readonly lastAccessTime = new Map<string, number>();
  private readonly LOCK_TTL_MS = 3600000; // 1 hour

  constructor(private readonly accountService: AptosAccountService) {
    // Schedule periodic cleanup
    setInterval(() => this.cleanup(), 3600000); // Every 1 hour
  }

  /**
   * Execute transaction with per-address locking
   * CRITICAL: Prevents concurrent transactions from same address
   */
  async withLock<T>(
    address: string,
    network: 'mainnet' | 'testnet' | 'devnet',
    operation: (sequenceNumber: number) => Promise<T>,
  ): Promise<T> {
    if (!address) {
      throw new Error('Address is required');
    }
    const normalizedAddress = normalizeAddress(address);
    const lock = this.getOrCreateLock(normalizedAddress);

    return await lock.runExclusive(async () => {
      this.logger.debug(`Acquired lock for address: ${normalizedAddress}`);

      try {
        // Get latest sequence number
        const sequenceNumber = await this.getSequenceNumber(
          normalizedAddress,
          network,
        );

        // Execute operation (build + sign + submit transaction)
        const result = await operation(sequenceNumber);

        // CRITICAL: Increment cached sequence after success
        this.incrementCachedSequence(normalizedAddress);

        return result;
      } catch (error) {
        // Invalidate cache on error to force fresh fetch on retry
        this.invalidateCache(normalizedAddress);
        this.logger.error(`Transaction failed for ${normalizedAddress}, cache invalidated`);
        throw error; // Re-throw after cleanup
      } finally {
        this.logger.debug(`Released lock for address: ${normalizedAddress}`);
      }
    });
  }

  /**
   * Get or create mutex for address
   */
  private getOrCreateLock(address: string): Mutex {
    if (!this.locks.has(address)) {
      this.locks.set(address, new Mutex());
      this.logger.debug(`Created new lock for address: ${address}`);
    }
    this.lastAccessTime.set(address, Date.now()); // Track access
    return this.locks.get(address)!;
  }

  /**
   * Get sequence number (from cache or RPC)
   */
  private async getSequenceNumber(
    address: string,
    network: 'mainnet' | 'testnet' | 'devnet',
  ): Promise<number> {
    if (!address) {
      throw new Error('Address is required');
    }
    const normalizedAddress = normalizeAddress(address);
    const cached = this.cache.get(normalizedAddress);

    // Use cache if fresh
    if (cached && this.isCacheFresh(cached)) {
      this.logger.debug(
        `Using cached sequence for ${normalizedAddress}: ${cached.value}`,
      );
      return cached.value;
    }

    // Fetch from chain
    const sequence = await this.accountService.getSequenceNumber(
      normalizedAddress,
      network,
    );

    // Update cache
    this.cache.set(normalizedAddress, {
      value: sequence,
      lastUpdated: new Date(),
    });

    this.logger.debug(
      `Fetched sequence from chain for ${normalizedAddress}: ${sequence}`,
    );
    return sequence;
  }

  /**
   * Increment cached sequence after successful transaction
   * CRITICAL: Prevents refetching from chain on next transaction
   */
  private incrementCachedSequence(address: string): void {
    const cached = this.cache.get(address);
    if (cached) {
      cached.value++;
      cached.lastUpdated = new Date();
      this.logger.debug(
        `Incremented cached sequence for ${address}: ${cached.value}`,
      );
    }
  }

  /**
   * Check if cached sequence is still fresh
   */
  private isCacheFresh(cached: SequenceCache): boolean {
    const age = Date.now() - cached.lastUpdated.getTime();
    return age < this.CACHE_TTL_MS;
  }

  /**
   * Invalidate cache for address (call on error)
   */
  invalidateCache(address: string): void {
    const normalizedAddress = normalizeAddress(address);
    this.cache.delete(normalizedAddress);
    this.logger.debug(`Invalidated cache for address: ${normalizedAddress}`);
  }

  /**
   * Cleanup old locks (optional, for long-running processes)
   */
  cleanup(): void {
    const now = Date.now();
    const addressesToClean: string[] = [];

    // Find stale locks
    for (const [address, lastAccess] of this.lastAccessTime.entries()) {
      if (now - lastAccess > this.LOCK_TTL_MS) {
        addressesToClean.push(address);
      }
    }

    // Remove stale locks and caches
    for (const address of addressesToClean) {
      this.locks.delete(address);
      this.cache.delete(address);
      this.lastAccessTime.delete(address);
    }

    if (addressesToClean.length > 0) {
      this.logger.debug(`Cleaned up ${addressesToClean.length} stale locks/caches`);
    }
  }
}
