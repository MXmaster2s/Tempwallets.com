import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service.js';
import { GoogleProfile } from './strategies/google.strategy.js';

export interface TokenPair {
  accessToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Validate and upsert user from Google profile
   */
  async validateGoogleUser(profile: GoogleProfile) {
    return this.prisma.user.upsert({
      where: { googleId: profile.id },
      update: {
        lastLoginAt: new Date(),
        name: profile.displayName || null,
        picture: profile.photos?.[0]?.value || null,
        email: profile.email || null,
      },
      create: {
        googleId: profile.id,
        email: profile.email || null,
        name: profile.displayName || null,
        picture: profile.photos?.[0]?.value || null,
        lastLoginAt: new Date(),
      },
    });
  }

  /**
   * Link fingerprint to Google user and migrate wallets if needed
   */
  async linkFingerprintToUser(googleId: string, fingerprint: string) {
    return this.prisma.$transaction(async (tx) => {
      const googleUser = await tx.user.findUnique({ where: { googleId } });
      const fingerprintUser = await tx.user.findUnique({
        where: { fingerprint },
      });

      if (!googleUser) {
        throw new Error('Google user not found');
      }

      // No fingerprint user? Just link fingerprint and done
      if (!fingerprintUser) {
        return tx.user.update({
          where: { id: googleUser.id },
          data: { fingerprint },
        });
      }

      // Same user? Already done
      if (fingerprintUser.id === googleUser.id) {
        return googleUser;
      }

      // Different users? Migrate wallets and related data
      const walletCount = await tx.wallet.count({
        where: { userId: fingerprintUser.id },
      });

      // Migrate wallets
      await tx.wallet.updateMany({
        where: { userId: fingerprintUser.id },
        data: { userId: googleUser.id },
      });

      // Migrate WalletSeed if exists
      const walletSeed = await tx.walletSeed.findUnique({
        where: { userId: fingerprintUser.id },
      });
      if (walletSeed) {
        // Delete old seed and create new one with new userId
        await tx.walletSeed.delete({
          where: { userId: fingerprintUser.id },
        });
        await tx.walletSeed.create({
          data: {
            userId: googleUser.id,
            ciphertext: walletSeed.ciphertext,
            iv: walletSeed.iv,
            authTag: walletSeed.authTag,
          },
        });
      }

      // Migrate WalletCache (fingerprint is the old fingerprint value, not userId)
      const walletCache = await tx.walletCache.findUnique({
        where: { fingerprint: fingerprint },
      });
      if (walletCache) {
        // Update fingerprint to point to Google user's id
        await tx.walletCache.update({
          where: { fingerprint: fingerprint },
          data: {
            fingerprint: googleUser.id,
          },
        });
      }

      // Migrate WalletAddressCache (fingerprint is the old fingerprint value)
      const addressCaches = await tx.walletAddressCache.findMany({
        where: { fingerprint: fingerprint },
      });
      if (addressCaches.length > 0) {
        // Update all address caches to use Google user's id as fingerprint
        await tx.walletAddressCache.updateMany({
          where: { fingerprint: fingerprint },
          data: {
            fingerprint: googleUser.id,
          },
        });
      }

      // Delete fingerprint user
      await tx.user.delete({ where: { id: fingerprintUser.id } });

      // Link fingerprint to Google user
      await tx.user.update({
        where: { id: googleUser.id },
        data: { fingerprint },
      });

      this.logger.log(
        `Migrated ${walletCount} wallets from fingerprint user ${fingerprintUser.id} to Google user ${googleUser.id}`,
      );

      return { googleUser, migratedWallets: walletCount };
    });
  }

  /**
   * Generate JWT tokens for user
   */
  generateTokens(userId: string): TokenPair {
    const accessToken = this.jwtService.sign(
      { sub: userId },
      { expiresIn: '7d' },
    );

    return { accessToken };
  }

  /**
   * Simple logout - token expires naturally
   */
  async logout(userId: string) {
    this.logger.log(`User ${userId} logged out`);
    // Token expiry handles logout - no blacklist needed for MVP
    return { success: true };
  }
}
