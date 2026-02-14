import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Eip7702Delegation } from '@prisma/client';

@Injectable()
export class Eip7702DelegationRepository {
  private readonly logger = new Logger(Eip7702DelegationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async hasDelegation(userId: string, chainId: number): Promise<boolean> {
    const existing = await this.prisma.eip7702Delegation.findUnique({
      where: {
        walletId_chainId: {
          walletId: userId,
          chainId,
        },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  async recordDelegation(
    userId: string,
    address: string,
    chainId: number,
    delegationAddress: string,
  ): Promise<void> {
    await this.prisma.eip7702Delegation.upsert({
      where: {
        walletId_chainId: {
          walletId: userId,
          chainId,
        },
      },
      update: {
        address,
        delegationAddress,
      },
      create: {
        walletId: userId,
        address,
        chainId,
        delegationAddress,
      },
    });
  }

  async getDelegation(
    userId: string,
    chainId: number,
  ): Promise<Eip7702Delegation | null> {
    return this.prisma.eip7702Delegation.findUnique({
      where: {
        walletId_chainId: {
          walletId: userId,
          chainId,
        },
      },
    });
  }

  async getDelegationsForUser(userId: string): Promise<Eip7702Delegation[]> {
    return this.prisma.eip7702Delegation.findMany({
      where: { walletId: userId },
    });
  }
}
