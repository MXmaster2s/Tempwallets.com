import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class AddressCacheRepository {
  private readonly logger = new Logger(AddressCacheRepository.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all cached addresses for a user
   * @param fingerprint - The browser fingerprint (same as userId)
   * @returns Record of chain -> address mappings
   */
  async getCachedAddresses(
    fingerprint: string,
  ): Promise<Record<string, string>> {
    const addresses = await this.prisma.walletAddressCache.findMany({
      where: { fingerprint },
      select: {
        chain: true,
        address: true,
      },
    });

    // Convert array to Record<chain, address>
    const result: Record<string, string> = {};
    for (const item of addresses) {
      result[item.chain] = item.address;
    }

    return result;
  }

  /**
   * Get address for a specific chain
   * @param fingerprint - The browser fingerprint
   * @param chain - The chain identifier
   * @returns The address or null if not found
   */
  async getCachedAddress(
    fingerprint: string,
    chain: string,
  ): Promise<string | null> {
    const cached = await this.prisma.walletAddressCache.findUnique({
      where: {
        fingerprint_chain: {
          fingerprint,
          chain,
        },
      },
      select: {
        address: true,
      },
    });

    return cached?.address ?? null;
  }

  /**
   * Save or update a single address
   * @param fingerprint - The browser fingerprint
   * @param chain - The chain identifier
   * @param address - The public address
   */
  async saveAddress(
    fingerprint: string,
    chain: string,
    address: string,
  ): Promise<void> {
    await this.prisma.walletAddressCache.upsert({
      where: {
        fingerprint_chain: {
          fingerprint,
          chain,
        },
      },
      create: {
        fingerprint,
        chain,
        address,
      },
      update: {
        address,
      },
    });
  }

  /**
   * Batch save multiple addresses
   * @param fingerprint - The browser fingerprint
   * @param addresses - Record of chain -> address mappings
   */
  async saveAddresses(
    fingerprint: string,
    addresses: Record<string, string>,
  ): Promise<void> {
    // Use transaction for batch operations
    await this.prisma.$transaction(
      Object.entries(addresses).map(([chain, address]) =>
        this.prisma.walletAddressCache.upsert({
          where: {
            fingerprint_chain: {
              fingerprint,
              chain,
            },
          },
          create: {
            fingerprint,
            chain,
            address,
          },
          update: {
            address,
          },
        }),
      ),
    );
  }

  /**
   * Check if any addresses exist for a user
   * @param fingerprint - The browser fingerprint
   * @returns True if addresses exist, false otherwise
   */
  async hasAddresses(fingerprint: string): Promise<boolean> {
    const count = await this.prisma.walletAddressCache.count({
      where: { fingerprint },
    });
    return count > 0;
  }

  /**
   * Clear all addresses for a user
   * @param fingerprint - The browser fingerprint
   */
  async clearAddresses(fingerprint: string): Promise<void> {
    await this.prisma.walletAddressCache.deleteMany({
      where: { fingerprint },
    });
  }
}

