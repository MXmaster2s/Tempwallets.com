import { Injectable, Logger } from '@nestjs/common';
import { SubstrateChainKey } from '../config/substrate-chain.config.js';

/**
 * Metadata Cache Service
 *
 * Issue #12: No Metadata Caching Strategy
 * - Cache chain metadata (runtime version, genesis hash) with TTL
 * - Reduces unnecessary RPC calls
 * - Prevents rate limiting
 */
interface CachedData<T> {
  data: T;
  timestamp: number;
}

@Injectable()
export class MetadataCacheService {
  private readonly logger = new Logger(MetadataCacheService.name);
  private readonly cache = new Map<string, CachedData<any>>();
  private readonly TTL = 3600000; // 1 hour in milliseconds

  /**
   * Get cached data or fetch and cache
   *
   * @param chain - Chain key
   * @param key - Cache key (e.g., 'genesisHash', 'runtimeVersion')
   * @param fetcher - Function to fetch data if not cached
   * @returns Cached or freshly fetched data
   */
  async get<T>(
    chain: SubstrateChainKey,
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cacheKey = `${chain}:${key}`;
    const cached = this.cache.get(cacheKey);

    // Check if cache is valid
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cached.data as T;
    }

    // Cache miss or expired - fetch new data
    this.logger.debug(`Cache miss for ${cacheKey}, fetching...`);
    try {
      const data = await fetcher();
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });
      return data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch data for ${cacheKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // If we have stale cache, return it
      if (cached) {
        this.logger.warn(`Returning stale cache for ${cacheKey}`);
        return cached.data as T;
      }
      throw error;
    }
  }

  /**
   * Invalidate cache for a specific chain and key
   *
   * @param chain - Chain key
   * @param key - Cache key
   */
  invalidate(chain: SubstrateChainKey, key: string): void {
    const cacheKey = `${chain}:${key}`;
    this.cache.delete(cacheKey);
    this.logger.debug(`Invalidated cache for ${cacheKey}`);
  }

  /**
   * Invalidate all cache for a specific chain
   *
   * @param chain - Chain key
   */
  invalidateChain(chain: SubstrateChainKey): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${chain}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.cache.delete(key));
    this.logger.debug(`Invalidated all cache for chain ${chain}`);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.logger.debug('Cleared all metadata cache');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
