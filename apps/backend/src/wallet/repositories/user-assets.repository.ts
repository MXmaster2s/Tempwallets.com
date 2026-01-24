import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class UserAssetsRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all assets for a user
   */
  async getAssetsForUser(userId: string) {
    return this.prisma.userAsset.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get a specific asset by userId, chain, address, symbol
   */
  async getAsset(
    userId: string,
    chain: string,
    address: string | null,
    symbol: string,
  ) {
    return this.prisma.userAsset.findUnique({
      where: {
        userId_chain_address_symbol: {
          userId,
          chain,
          address: address || '',
          symbol,
        },
      },
    });
  }

  /**
   * Upsert an asset (create or update)
   */
  async upsertAsset(
    userId: string,
    chain: string,
    address: string | null,
    symbol: string,
    balance: string,
    decimals: number,
  ) {
    return this.prisma.userAsset.upsert({
      where: {
        userId_chain_address_symbol: {
          userId,
          chain,
          address: address || '',
          symbol,
        },
      },
      update: {
        balance,
        decimals,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId,
        chain,
        address,
        symbol,
        balance,
        decimals,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Delete old assets for a user (cleanup)
   */
  async deleteOldAssets(userId: string, beforeDate: Date) {
    return this.prisma.userAsset.deleteMany({
      where: {
        userId,
        updatedAt: { lt: beforeDate },
      },
    });
  }

  /**
   * Clear all assets for a user
   */
  async clearUserAssets(userId: string) {
    return this.prisma.userAsset.deleteMany({
      where: { userId },
    });
  }

  /**
   * Check if user's assets need refresh (older than 60 minutes)
   */
  async isDataStale(userId: string): Promise<boolean> {
    const oldestSync = await this.prisma.userAsset.findFirst({
      where: { userId },
      orderBy: { lastSyncedAt: 'asc' },
      select: { lastSyncedAt: true },
    });

    if (!oldestSync) return true; // No data = stale

    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);
    return oldestSync.lastSyncedAt < sixtyMinutesAgo;
  }
}
