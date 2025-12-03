import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { SeedManager } from '../../managers/seed.manager.js';
import { AptosAddressManager } from './aptos-address.manager.js';
import { AptosAccountFactory } from '../factories/aptos-account.factory.js';
import { AptosAccountService } from '../services/aptos-account.service.js';
import { AptosTransactionService } from '../services/aptos-transaction.service.js';
import { AptosSequenceManager } from './aptos-sequence.manager.js';
import { normalizeAddress } from '../utils/address.utils.js';
import { TransferParams, TransactionResult } from '../types/transaction.types.js';
import { Account } from '@aptos-labs/ts-sdk';

/**
 * Aptos Manager
 *
 * Main facade/coordinator for all Aptos operations.
 * Provides a clean interface for wallet integration without exposing internal complexity.
 */
@Injectable()
export class AptosManager {
  private readonly logger = new Logger(AptosManager.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seedManager: SeedManager,
    private readonly addressManager: AptosAddressManager,
    private readonly accountFactory: AptosAccountFactory,
    private readonly accountService: AptosAccountService,
    private readonly transactionService: AptosTransactionService,
    private readonly sequenceManager: AptosSequenceManager,
  ) {}

  /**
   * Get Aptos address for a user
   *
   * @param userId - User ID
   * @param accountIndex - Account index (default: 0)
   * @param network - Network (default: 'testnet')
   * @returns Aptos address
   */
  async getAddress(
    userId: string,
    accountIndex: number = 0,
    network: 'mainnet' | 'testnet' | 'devnet' = 'testnet',
  ): Promise<string> {
    const seedPhrase = await this.seedManager.getSeed(userId);
    const address = await this.addressManager.deriveAddress(
      seedPhrase,
      accountIndex,
    );
    return normalizeAddress(address);
  }

  /**
   * Get APT balance for a user
   *
   * @param userId - User ID
   * @param network - Network (default: 'testnet')
   * @returns Balance in APT (human-readable)
   */
  async getBalance(
    userId: string,
    network: 'mainnet' | 'testnet' | 'devnet' = 'testnet',
  ): Promise<string> {
    const address = await this.getAddress(userId, 0, network);
    return await this.accountService.getAptBalance(address, network);
  }

  /**
   * Send APT from user's wallet
   *
   * @param userId - User ID
   * @param recipientAddress - Recipient address
   * @param amount - Amount in APT (human-readable)
   * @param network - Network (default: 'testnet')
   * @returns Transaction result
   */
  async sendAPT(
    userId: string,
    recipientAddress: string,
    amount: number,
    network: 'mainnet' | 'testnet' | 'devnet' = 'testnet',
  ): Promise<TransactionResult> {
    // Get seed phrase and create account
    const seedPhrase = await this.seedManager.getSeed(userId);
    const account = await this.accountFactory.createAccountFromSeed(
      seedPhrase,
      0,
    );

    // Get the Account object from the factory result
    // The factory returns AptosAccountData which has an account property
    const aptosAccount = account.account;

    // Transfer APT using transaction service
    return await this.transactionService.transferAPT({
      senderAccount: aptosAccount,
      recipientAddress,
      amount,
      network,
    });
  }

  /**
   * Get or create AptosAccount record in database
   * CRITICAL: Wrapped in Prisma transaction for atomicity
   *
   * @param userId - User ID
   * @param network - Network (default: 'testnet')
   * @returns AptosAccount record
   */
  async getOrCreateAptosAccount(
    userId: string,
    network: 'mainnet' | 'testnet' | 'devnet' = 'testnet',
  ) {
    return await this.prisma.$transaction(async (tx) => {
      // Check if account already exists
      const existing = await tx.aptosAccount.findUnique({
        where: {
          walletId_network: {
            walletId: userId, // Assuming userId maps to walletId
            network,
          },
        },
      });

      if (existing) {
        return existing;
      }

      // Get seed and derive address
      const seedPhrase = await this.seedManager.getSeed(userId);
      const address = await this.addressManager.deriveAddress(seedPhrase, 0);
      const normalizedAddress = normalizeAddress(address);

      // Create account from seed to get public key
      const account = await this.accountFactory.createAccountFromSeed(
        seedPhrase,
        0,
      );
      const publicKey = account.publicKey;

      // Get current sequence number from chain
      let sequenceNumber = 0;
      try {
        sequenceNumber = await this.accountService.getSequenceNumber(
          normalizedAddress,
          network,
        );
      } catch (error) {
        // Account might not exist on-chain yet, use 0
        this.logger.debug(
          `Account ${normalizedAddress} not found on-chain, using sequence 0`,
        );
      }

      // Create AptosAccount record
      const aptosAccount = await tx.aptosAccount.create({
        data: {
          walletId: userId,
          address: normalizedAddress,
          publicKey,
          sequenceNumber,
          network,
        },
      });

      this.logger.log(
        `Created AptosAccount record for ${userId} on ${network}: ${normalizedAddress}`,
      );

      return aptosAccount;
    });
  }
}

