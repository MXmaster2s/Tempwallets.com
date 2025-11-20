import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class BalanceCacheRepository {
  private readonly logger = new Logger(BalanceCacheRepository.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get cached balances for a user
   * @param fingerprint - The browser fingerprint (same as userId)
   * @returns Cached balances object or null if not found
   */
  async getCachedBalances(
    fingerprint: string,
  ): Promise<Record<string, { balance: string; lastUpdated: number }> | null> {
    const cache = await this.prisma.walletCache.findUnique({
      where: { fingerprint },
      select: {
        cachedBalances: true,
        lastUpdated: true,
      },
    });

    if (!cache) {
      return null;
    }

    // Parse JSON and ensure it's in the expected format
    const balances = cache.cachedBalances as Record<
      string,
      { balance: string; lastUpdated: number }
    >;

    return balances;
  }

  /**
   * Update cached balances for a user
   * @param fingerprint - The browser fingerprint
   * @param balances - Record of chain -> balance data
   */
  async updateCachedBalances(
    fingerprint: string,
    balances: Record<string, { balance: string; lastUpdated: number }>,
  ): Promise<void> {
    await this.prisma.walletCache.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        cachedBalances: balances,
      },
      update: {
        cachedBalances: balances,
      },
    });
  }

  /**
   * Clear cache for a user
   * @param fingerprint - The browser fingerprint
   */
  async clearCache(fingerprint: string): Promise<void> {
    await this.prisma.walletCache.delete({
      where: { fingerprint },
    });
  }

  /**
   * Check if cache exists for a user
   * @param fingerprint - The browser fingerprint
   * @returns True if cache exists, false otherwise
   */
  async hasCache(fingerprint: string): Promise<boolean> {
    const cache = await this.prisma.walletCache.findUnique({
      where: { fingerprint },
      select: { id: true },
    });
    return !!cache;
  }
}

