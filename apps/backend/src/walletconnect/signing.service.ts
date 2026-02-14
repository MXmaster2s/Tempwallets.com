import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Eip7702AdapterService } from './eip7702-adapter.service.js';
import { SessionService } from './session.service.js';

// Type assertion for Prisma models - these exist at runtime but TypeScript may not recognize them
// until the language server restarts after Prisma client generation
type PrismaWithWc = PrismaService & {
  wcSession: any;
  wcProposal: any;
  wcRequest: any;
};

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);
  private readonly prisma: PrismaWithWc;

  constructor(
    prisma: PrismaService,
    private readonly eip7702Adapter: Eip7702AdapterService,
    private readonly sessionService: SessionService,
  ) {
    this.prisma = prisma as PrismaWithWc;
  }

  /**
   * Sign a WalletConnect session request
   */
  async signRequest(
    userId: string,
    topic: string,
    requestId: number,
    method: string,
    params: any[],
    chainId: string, // CAIP-2 format: "eip155:1"
  ): Promise<string> {
    // Processing signing request

    // Verify session exists and belongs to user
    const session = await this.prisma.wcSession.findFirst({
      where: { userId, topic },
    });

    if (!session) {
      throw new NotFoundException(
        `Session ${topic} not found for user ${userId}`,
      );
    }

    // Parse chain ID
    const chainIdParts = chainId.split(':');
    if (chainIdParts.length < 2 || !chainIdParts[1]) {
      throw new BadRequestException(`Invalid chain ID format: ${chainId}`);
    }
    const chainIdNum = parseInt(chainIdParts[1], 10);
    if (isNaN(chainIdNum)) {
      throw new BadRequestException(
        `Invalid chain ID number: ${chainIdParts[1]}`,
      );
    }

    // Create request record
    const request = await this.prisma.wcRequest.create({
      data: {
        sessionId: session.id,
        requestId,
        topic,
        method,
        params,
        chainId,
        status: 'PENDING',
      },
    });

    try {
      let signature: string;

      switch (method) {
        case 'eth_sendTransaction':
        case 'eth_signTransaction': {
          const [transaction] = params;
          const address = transaction.from;

          signature = await this.eip7702Adapter.signTransaction(
            userId,
            chainIdNum,
            address,
            transaction,
          );

          // Update request with success
          await this.prisma.wcRequest.update({
            where: { id: request.id },
            data: {
              status: 'APPROVED',
              response: { signature },
              approvedAt: new Date(),
              usedEip7702: true,
              gasSponsored: true, // Pimlico paymaster
            },
          });

          break;
        }

        case 'personal_sign':
        case 'eth_sign': {
          const [message, address] = params;

          signature = await this.eip7702Adapter.signMessage(
            userId,
            chainIdNum,
            address,
            message,
          );

          // Update request with success
          await this.prisma.wcRequest.update({
            where: { id: request.id },
            data: {
              status: 'APPROVED',
              response: { signature },
              approvedAt: new Date(),
              usedEip7702: false, // Message signing uses EOA
            },
          });

          break;
        }

        case 'eth_signTypedData':
        case 'eth_signTypedData_v4': {
          const [address, typedDataStr] = params;
          const typedData =
            typeof typedDataStr === 'string'
              ? JSON.parse(typedDataStr)
              : typedDataStr;

          signature = await this.eip7702Adapter.signTypedData(
            userId,
            chainIdNum,
            address,
            typedData,
          );

          // Update request with success
          await this.prisma.wcRequest.update({
            where: { id: request.id },
            data: {
              status: 'APPROVED',
              response: { signature },
              approvedAt: new Date(),
              usedEip7702: false, // Typed data signing uses EOA
            },
          });

          break;
        }

        case 'wallet_getCapabilities': {
          // Return EIP-5792 wallet capabilities
          signature = JSON.stringify({
            [chainId]: {
              eip1559: {
                supported: true,
              },
              smartAccounts: {
                supported: true,
              },
              eip7702: {
                supported: true,
                paymasterSponsored: true,
              },
            },
          });

          await this.prisma.wcRequest.update({
            where: { id: request.id },
            data: {
              status: 'APPROVED',
              response: { capabilities: JSON.parse(signature) },
              approvedAt: new Date(),
            },
          });

          break;
        }

        case 'wallet_switchEthereumChain': {
          // Just acknowledge - frontend handles actual switching
          signature = 'null';

          await this.prisma.wcRequest.update({
            where: { id: request.id },
            data: {
              status: 'APPROVED',
              response: { result: null },
              approvedAt: new Date(),
            },
          });

          break;
        }

        default:
          throw new BadRequestException(`Unsupported method: ${method}`);
      }

      // Update session last used
      await this.sessionService.updateSessionLastUsed(topic);

      // Request signed successfully
      return signature;
    } catch (error) {
      this.logger.error(`Failed to sign request ${requestId}`, error);

      // Update request with failure
      await this.prisma.wcRequest.update({
        where: { id: request.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }
}
