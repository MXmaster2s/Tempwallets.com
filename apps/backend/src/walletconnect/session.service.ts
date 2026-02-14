import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

// Type assertion for Prisma models - these exist at runtime but TypeScript may not recognize them
// until the language server restarts after Prisma client generation
type PrismaWithWc = PrismaService & {
  wcSession: any;
  wcProposal: any;
  wcRequest: any;
};

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly prisma: PrismaWithWc;

  constructor(prisma: PrismaService) {
    this.prisma = prisma as PrismaWithWc;
  }

  /**
   * Save a new WalletConnect session (upsert - update if exists, create if not)
   */
  async saveSession(
    userId: string,
    session: {
      topic: string;
      pairingTopic?: string;
      expiry: number | Date; // ✅ Can be either timestamp or Date
      peer?: {
        metadata?: {
          name?: string;
          description?: string;
          url?: string;
          icons?: string[];
        };
      };
      relay?: any;
    },
    namespaces: any,
  ): Promise<void> {
    // Saving session

    // Extract approved chains and accounts from namespaces
    const eip155Namespace = namespaces.eip155 || {};
    const approvedChains: number[] = eip155Namespace.chains
      ? (eip155Namespace.chains as string[]).map((c: string) => {
          const parts = c.split(':');
          if (parts.length < 2 || !parts[1]) {
            throw new Error(`Invalid chain format: ${c}`);
          }
          const chainId = parseInt(parts[1], 10);
          if (isNaN(chainId)) {
            throw new Error(`Invalid chain ID: ${parts[1]}`);
          }
          return chainId;
        })
      : [];
    const approvedAccounts: string[] = (eip155Namespace.accounts ||
      []) as string[];

    // ✅ FIX: Convert expiry to Date if it's a number (timestamp)
    const expiryDate =
      typeof session.expiry === 'number'
        ? new Date(session.expiry * 1000) // Unix timestamp to Date (multiply by 1000 for milliseconds)
        : session.expiry;

    // ✅ FIX: Use upsert to handle existing sessions
    await this.prisma.wcSession.upsert({
      where: {
        topic: session.topic,
      },
      update: {
        userId,
        pairingTopic: session.pairingTopic || null,
        dappName: session.peer?.metadata?.name || null,
        dappDescription: session.peer?.metadata?.description || null,
        dappUrl: session.peer?.metadata?.url || null,
        dappIcon: session.peer?.metadata?.icons?.[0] || null,
        namespaces,
        expiry: expiryDate,
        relay: session.relay || {},
        eip7702Only: true,
        approvedChains,
        approvedAccounts,
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        topic: session.topic,
        pairingTopic: session.pairingTopic || null,
        dappName: session.peer?.metadata?.name || null,
        dappDescription: session.peer?.metadata?.description || null,
        dappUrl: session.peer?.metadata?.url || null,
        dappIcon: session.peer?.metadata?.icons?.[0] || null,
        namespaces,
        expiry: expiryDate,
        relay: session.relay || {},
        eip7702Only: true,
        approvedChains,
        approvedAccounts,
        lastUsedAt: new Date(),
      },
    });

    // Session saved
  }

  /**
   * Get all active sessions for a user
   */
  async getActiveSessions(userId: string) {
    const sessions = await this.prisma.wcSession.findMany({
      where: {
        userId,
        expiry: { gt: new Date() }, // Only non-expired sessions
      },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions;
  }

  /**
   * Disconnect a session (gracefully handles missing sessions)
   */
  async disconnectSession(userId: string, topic: string): Promise<void> {
    // Disconnecting session

    const session = await this.prisma.wcSession.findFirst({
      where: { userId, topic },
    });

    if (!session) {
      // ✅ FIX: Don't throw error - session might not exist in DB but exists in WalletKit
      this.logger.warn(
        `Session ${topic} not found in database for user ${userId}, but continuing with disconnect`,
      );
      return;
    }

    // Delete session and all related requests
    await this.prisma.wcSession.delete({
      where: { id: session.id },
    });

    // Session disconnected
  }

  /**
   * Update session last used timestamp
   */
  async updateSessionLastUsed(topic: string): Promise<void> {
    await this.prisma.wcSession.updateMany({
      where: { topic },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Get pending proposals for a user
   */
  async getPendingProposals(userId: string) {
    const proposals = await this.prisma.wcProposal.findMany({
      where: {
        userId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return proposals;
  }

  /**
   * Get pending signing requests for a session
   */
  async getPendingRequests(userId: string, topic: string) {
    // Getting pending requests

    // Verify session belongs to user
    const session = await this.prisma.wcSession.findFirst({
      where: { userId, topic },
    });

    if (!session) {
      throw new NotFoundException(
        `Session ${topic} not found for user ${userId}`,
      );
    }

    const requests = await this.prisma.wcRequest.findMany({
      where: {
        sessionId: session.id,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Found pending requests
    return requests;
  }
}
