import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service.js';
import { EncryptionService } from '../crypto/encryption.service.js';
import { WalletHistoryRepository } from '../wallet/repositories/wallet-history.repository.js';
import { AddressManager } from '../wallet/managers/address.manager.js';
import { SeedManager } from '../wallet/managers/seed.manager.js';
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
    private encryptionService: EncryptionService,
    private walletHistoryRepo: WalletHistoryRepository,
    private addressManager: AddressManager,
    private seedManager: SeedManager,
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
   * Link fingerprint to Google user and create a new wallet for Google user
   * The old fingerprint wallet remains unchanged - we create a fresh wallet for Google auth
   */
  async linkFingerprintToUser(googleId: string, fingerprint: string) {
    // First, handle user linking in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const googleUser = await tx.user.findUnique({ where: { googleId } });
      const fingerprintUser = await tx.user.findUnique({
        where: { fingerprint },
      });

      if (!googleUser) {
        throw new Error('Google user not found');
      }

      // No fingerprint user? Just link fingerprint
      if (!fingerprintUser) {
        // Link fingerprint to Google user
        await tx.user.update({
          where: { id: googleUser.id },
          data: { fingerprint },
        });

        return { googleUser, fingerprintUser: null };
      }

      // Same user? Already done
      if (fingerprintUser.id === googleUser.id) {
        return { googleUser, fingerprintUser: null };
      }

      // Different users? Keep fingerprint user and wallet intact
      // Just link fingerprint to Google user for reference
      await tx.user.update({
        where: { id: googleUser.id },
        data: { fingerprint },
      });

      return { googleUser, fingerprintUser };
    });

    // After transaction, create wallet for Google user if needed
    // This is done outside transaction to avoid Prisma transaction issues
    const hasExistingWallet = await this.seedManager.hasSeed(
      result.googleUser.id,
    );
    let newWalletCreated = false;

    if (!hasExistingWallet) {
      // Create new wallet seed for Google user
      await this.seedManager.createOrImportSeed(result.googleUser.id, 'random');
      newWalletCreated = true;

      if (result.fingerprintUser) {
        this.logger.log(
          `Created new wallet for Google user ${result.googleUser.id} after linking fingerprint ${fingerprint}. ` +
            `Fingerprint user ${result.fingerprintUser.id} and its wallet remain unchanged.`,
        );
      } else {
        this.logger.log(
          `Created new wallet for Google user ${result.googleUser.id} after linking fingerprint ${fingerprint}`,
        );
      }
    } else {
      if (result.fingerprintUser) {
        this.logger.log(
          `Linked fingerprint ${fingerprint} to Google user ${result.googleUser.id}. ` +
            `Fingerprint user ${result.fingerprintUser.id} and its wallet remain unchanged. ` +
            `Google user already has a wallet.`,
        );
      }
    }

    // Clear address cache to ensure fresh addresses are generated
    await this.addressManager.clearAddressCache(result.googleUser.id);

    return {
      googleUser: result.googleUser,
      newWalletCreated,
      fingerprintUserPreserved: !!result.fingerprintUser,
    };
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
