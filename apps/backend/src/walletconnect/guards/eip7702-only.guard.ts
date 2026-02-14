import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class Eip7702OnlyGuard implements CanActivate {
  private readonly logger = new Logger(Eip7702OnlyGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.body?.userId || request.query?.userId;

    if (!userId) {
      throw new ForbiddenException('User ID is required');
    }

    // Check if user has any EIP-7702 delegations
    const delegations = await this.prisma.eip7702Delegation.findMany({
      where: { walletId: userId },
    });

    if (delegations.length === 0) {
      // This is expected for new users - delegations are created lazily on first transaction
      // WalletConnect will work with regular EOA addresses
      throw new ForbiddenException(
        'WalletConnect requires a wallet account. Please create a wallet first.',
      );
    }

    // User has EIP-7702 delegations
    return true;
  }
}
