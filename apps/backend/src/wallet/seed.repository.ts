import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { EncryptionService } from '../crypto/encryption.service.js';

@Injectable()
export class SeedRepository {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Create or update a wallet seed for a user
   * @param userId - The user ID
   * @param seedPhrase - The mnemonic seed phrase to encrypt and store
   */
  async createOrUpdateSeed(userId: string, seedPhrase: string): Promise<void> {
    const encrypted = this.encryptionService.encrypt(seedPhrase);

    await this.prisma.walletSeed.upsert({
      where: { userId },
      create: {
        userId,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      update: {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
    });
  }

  /**
   * Get and decrypt the seed phrase for a user
   * @param userId - The user ID
   * @returns The decrypted seed phrase
   */
  async getSeedPhrase(userId: string): Promise<string> {
    const seed = await this.prisma.walletSeed.findUnique({
      where: { userId },
    });

    if (!seed) {
      throw new NotFoundException(`No wallet seed found for user ${userId}`);
    }

    return this.encryptionService.decrypt({
      ciphertext: seed.ciphertext,
      iv: seed.iv,
      authTag: seed.authTag,
    });
  }

  /**
   * Check if a user has a stored seed
   * @param userId - The user ID
   * @returns True if seed exists, false otherwise
   */
  async hasSeed(userId: string): Promise<boolean> {
    const seed = await this.prisma.walletSeed.findUnique({
      where: { userId },
    });
    return !!seed;
  }

  /**
   * Delete a user's seed
   * @param userId - The user ID
   */
  async deleteSeed(userId: string): Promise<void> {
    await this.prisma.walletSeed.delete({
      where: { userId },
    });
  }
}

