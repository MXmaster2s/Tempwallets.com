import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * Wallet Cleanup Service
 * Automatically deletes expired burner wallets on a schedule
 */
@Injectable()
export class WalletCleanupService {
  private readonly logger = new Logger(WalletCleanupService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Run cleanup every hour to remove expired wallets
   * Uses cron expression: "0 * * * *" = At minute 0 of every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredWallets() {
    this.logger.log('Starting expired wallet cleanup...');

    const now = new Date();

    try {
      // Step 1: Find all expired wallet seeds with user info
      const expiredSeeds = await this.prisma.walletSeed.findMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
        select: {
          userId: true,
          expiresAt: true,
        },
      });

      if (expiredSeeds.length === 0) {
        this.logger.log('No expired wallets found');
        return;
      }

      this.logger.log(`Found ${expiredSeeds.length} expired wallet(s)`);

      const userIds = expiredSeeds.map((seed) => seed.userId);

      // Step 2: Fetch user details to separate registered vs unregistered
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, googleId: true, email: true },
      });

      const unregisteredUserIds = users
        .filter((u) => !u.googleId && !u.email)
        .map((u) => u.id);

      const registeredUserIds = users
        .filter((u) => u.googleId || u.email)
        .map((u) => u.id);

      let deletedBurnerWallets = 0;
      let deletedRegisteredSeeds = 0;

      // Step 3a: Delete ENTIRE user record for unregistered burner wallets
      // (CASCADE deletes WalletSeed, addresses, etc.)
      if (unregisteredUserIds.length > 0) {
        const burnerResult = await this.prisma.user.deleteMany({
          where: { id: { in: unregisteredUserIds } },
        });
        deletedBurnerWallets = burnerResult.count;
        this.logger.log(
          `Deleted ${deletedBurnerWallets} expired burner wallet(s) (entire user records)`,
        );
      }

      // Step 3b: For registered users, delete ONLY the WalletSeed
      // Keep User record so they can create a new wallet
      if (registeredUserIds.length > 0) {
        // Also delete cached addresses for these users
        await this.prisma.walletAddressCache.deleteMany({
          where: { fingerprint: { in: registeredUserIds } },
        });

        const seedResult = await this.prisma.walletSeed.deleteMany({
          where: { userId: { in: registeredUserIds } },
        });
        deletedRegisteredSeeds = seedResult.count;
        this.logger.log(
          `Deleted ${deletedRegisteredSeeds} expired seed(s) for registered users (kept user accounts)`,
        );
      }

      this.logger.log(
        `Cleanup complete: ${deletedBurnerWallets + deletedRegisteredSeeds} total wallets cleaned`,
      );
    } catch (error) {
      this.logger.error(
        `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Manual cleanup trigger (for testing or admin use)
   * Call this via API endpoint if you want to manually trigger cleanup
   */
  async manualCleanup(): Promise<{
    deletedBurnerWallets: number;
    deletedRegisteredSeeds: number;
    total: number;
  }> {
    this.logger.log('Manual cleanup triggered');

    const now = new Date();

    const expiredSeeds = await this.prisma.walletSeed.findMany({
      where: { expiresAt: { lte: now } },
      select: { userId: true },
    });

    if (expiredSeeds.length === 0) {
      return { deletedBurnerWallets: 0, deletedRegisteredSeeds: 0, total: 0 };
    }

    const userIds = expiredSeeds.map((s) => s.userId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, googleId: true, email: true },
    });

    const unregisteredUserIds = users
      .filter((u) => !u.googleId && !u.email)
      .map((u) => u.id);

    const registeredUserIds = users
      .filter((u) => u.googleId || u.email)
      .map((u) => u.id);

    let deletedBurnerWallets = 0;
    let deletedRegisteredSeeds = 0;

    // Delete entire user record for burner wallets
    if (unregisteredUserIds.length > 0) {
      const burnerResult = await this.prisma.user.deleteMany({
        where: { id: { in: unregisteredUserIds } },
      });
      deletedBurnerWallets = burnerResult.count;
    }

    // Delete only WalletSeed for registered users
    if (registeredUserIds.length > 0) {
      // Clean up cached addresses
      await this.prisma.walletAddressCache.deleteMany({
        where: { fingerprint: { in: registeredUserIds } },
      });

      const seedResult = await this.prisma.walletSeed.deleteMany({
        where: { userId: { in: registeredUserIds } },
      });
      deletedRegisteredSeeds = seedResult.count;
    }

    return {
      deletedBurnerWallets,
      deletedRegisteredSeeds,
      total: deletedBurnerWallets + deletedRegisteredSeeds,
    };
  }
}
