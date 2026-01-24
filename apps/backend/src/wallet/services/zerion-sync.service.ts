import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ZerionService } from '../zerion.service.js';
import { UserAssetsRepository } from '../repositories/user-assets.repository.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class ZerionSyncService {
  private readonly logger = new Logger(ZerionSyncService.name);

  constructor(
    private zerionService: ZerionService,
    private userAssetsRepository: UserAssetsRepository,
    private prisma: PrismaService,
  ) {}

  /**
   * Background job: Sync all users' assets from Zerion every 60 minutes
   */
  @Cron(CronExpression.EVERY_HOUR)
  async syncAllUsersAssets() {
    this.logger.log('Starting hourly Zerion sync for all users...');
    try {
      const users = await this.prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        await this.syncAssetsForUser(user.id);
      }
      this.logger.log(`Completed sync for ${users.length} users`);
    } catch (error) {
      this.logger.error(
        `Failed to sync all users: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * On-demand sync: Fetch from Zerion and store in DB for a specific user
   */
  async syncAssetsForUser(userId: string): Promise<void> {
    this.logger.log(`Syncing assets for user ${userId}`);
    try {
      // Get user's wallet addresses
      const wallet = await this.prisma.wallet.findFirst({
        where: { userId },
      });

      if (!wallet) {
        this.logger.warn(`No wallet found for user ${userId}`);
        return;
      }

      // Get addresses from wallet (you'll need to extract this logic)
      const addresses = this.getAddressesForUser(userId);

      // Clear old assets for this user
      await this.userAssetsRepository.clearUserAssets(userId);

      // Fetch from Zerion for each address
      for (const address of addresses) {
        if (!address) continue;

        try {
          const positions =
            await this.zerionService.getPositionsAnyChain(address);

          // Upsert each token into DB
          for (const position of positions) {
            await this.userAssetsRepository.upsertAsset(
              userId,
              position.chain,
              position.address || null,
              position.symbol,
              position.balanceSmallest,
              position.decimals ?? 18,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to sync address ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      this.logger.log(`Successfully synced assets for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to sync user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Helper: Get all addresses for a user
   * (Extract this from existing AddressManager logic)
   */
  private getAddressesForUser(_userId: string): string[] {
    // TODO: Call AddressManager or similar service to get user's addresses
    // This should return: [ethereum, base, arbitrum, polygon, avalanche, solana, ...]
    void _userId; // mark parameter as used to satisfy linter
    return [];
  }
}
