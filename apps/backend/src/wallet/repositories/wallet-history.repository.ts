import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { EncryptionService } from '../../crypto/encryption.service.js';

export interface WalletHistoryEntry {
  id: string;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
  // We'll include a preview address for display (first EVM address)
  previewAddress?: string;
}

@Injectable()
export class WalletHistoryRepository {
  private readonly logger = new Logger(WalletHistoryRepository.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Save current wallet to history before creating a new one
   * @param userId - The user ID
   * @param seedPhrase - The seed phrase to save
   * @param label - Optional label for the wallet
   */
  async saveToHistory(
    userId: string,
    seedPhrase: string,
    label?: string,
  ): Promise<string> {
    const encrypted = this.encryptionService.encrypt(seedPhrase);

    // Count existing wallets to generate default label
    const count = await this.prisma.walletHistory.count({
      where: { userId },
    });

    const walletLabel = label || `Wallet ${count + 1}`;

    const entry = await this.prisma.walletHistory.create({
      data: {
        userId,
        label: walletLabel,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        isActive: false,
      },
    });

    this.logger.log(`Saved wallet to history for user ${userId}: ${entry.id}`);
    return entry.id;
  }

  /**
   * Get all wallets for a user
   * @param userId - The user ID
   * @returns List of wallet history entries
   */
  async getWalletHistory(userId: string): Promise<WalletHistoryEntry[]> {
    const wallets = await this.prisma.walletHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        isActive: true,
        createdAt: true,
      },
    });

    return wallets;
  }

  /**
   * Get seed phrase for a specific wallet from history
   * @param walletId - The wallet history entry ID
   * @param userId - The user ID (for security validation)
   * @returns The decrypted seed phrase
   */
  async getSeedFromHistory(
    walletId: string,
    userId: string,
  ): Promise<string | null> {
    const wallet = await this.prisma.walletHistory.findFirst({
      where: {
        id: walletId,
        userId, // Ensure user owns this wallet
      },
    });

    if (!wallet) {
      return null;
    }

    return this.encryptionService.decrypt({
      ciphertext: wallet.ciphertext,
      iv: wallet.iv,
      authTag: wallet.authTag,
    });
  }

  /**
   * Set a wallet as active (deactivates all others)
   * @param walletId - The wallet history entry ID
   * @param userId - The user ID
   */
  async setActiveWallet(walletId: string, userId: string): Promise<boolean> {
    // Use transaction to ensure atomicity
    await this.prisma.$transaction([
      // Deactivate all wallets for this user
      this.prisma.walletHistory.updateMany({
        where: { userId },
        data: { isActive: false },
      }),
      // Activate the selected wallet
      this.prisma.walletHistory.updateMany({
        where: { id: walletId, userId },
        data: { isActive: true },
      }),
    ]);

    this.logger.log(`Set wallet ${walletId} as active for user ${userId}`);
    return true;
  }

  /**
   * Get the active wallet for a user
   * @param userId - The user ID
   */
  async getActiveWallet(userId: string): Promise<WalletHistoryEntry | null> {
    const wallet = await this.prisma.walletHistory.findFirst({
      where: { userId, isActive: true },
      select: {
        id: true,
        label: true,
        isActive: true,
        createdAt: true,
      },
    });

    return wallet;
  }

  /**
   * Update wallet label
   * @param walletId - The wallet history entry ID
   * @param userId - The user ID
   * @param label - New label
   */
  async updateLabel(
    walletId: string,
    userId: string,
    label: string,
  ): Promise<boolean> {
    const result = await this.prisma.walletHistory.updateMany({
      where: { id: walletId, userId },
      data: { label },
    });

    return result.count > 0;
  }

  /**
   * Delete a wallet from history
   * @param walletId - The wallet history entry ID
   * @param userId - The user ID
   */
  async deleteWallet(walletId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.walletHistory.deleteMany({
      where: { id: walletId, userId },
    });

    return result.count > 0;
  }
}
