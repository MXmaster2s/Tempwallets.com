import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Eip7702AdapterService } from './eip7702-adapter.service.js';
import { AddressManager } from '../wallet/managers/address.manager.js';

// Type assertion for Prisma models - these exist at runtime but TypeScript may not recognize them
// until the language server restarts after Prisma client generation
type PrismaWithWc = PrismaService & {
  wcSession: any;
  wcProposal: any;
  wcRequest: any;
};

@Injectable()
export class WalletConnectService {
  private readonly logger = new Logger(WalletConnectService.name);
  private readonly prisma: PrismaWithWc;

  constructor(
    prisma: PrismaService,
    private readonly eip7702Adapter: Eip7702AdapterService,
    private readonly addressManager: AddressManager,
  ) {
    this.prisma = prisma as PrismaWithWc;
  }

  /**
   * Get all EIP-7702 accounts for a user, formatted as CAIP-10
   * Format: eip155:<chainId>:<address>
   */
  async getEip7702Accounts(userId: string): Promise<
    Array<{
      accountId: string; // CAIP-10 format
      chainId: number;
      address: string;
      chainName: string;
    }>
  > {
    // Get all EIP-7702 delegations for this user
    const delegations = await this.prisma.eip7702Delegation.findMany({
      where: { walletId: userId },
    });

    if (delegations.length === 0) {
      // This is expected for new users - delegations are created lazily on first transaction
      // WalletConnect will work with regular EOA addresses
      return [];
    }

    const accounts = delegations.map((delegation) => {
      const accountId = `eip155:${delegation.chainId}:${delegation.address}`;

      return {
        accountId,
        chainId: delegation.chainId,
        address: delegation.address,
        chainName: this.getChainName(delegation.chainId),
      };
    });

    return accounts;
  }

  /**
   * Approve a session proposal
   */
  async approveProposal(
    userId: string,
    proposalId: number,
    approvedChains: number[], // EVM chain IDs user approved
  ): Promise<{
    namespaces: any;
    session: {
      topic: string;
      expiry: Date;
      pairingTopic?: string;
    };
  }> {
    // Approving proposal

    // Get proposal from database
    const proposal = await this.prisma.wcProposal.findFirst({
      where: {
        proposalId,
        userId,
        status: 'PENDING',
      },
    });

    if (!proposal) {
      throw new NotFoundException(
        `Proposal ${proposalId} not found or already processed`,
      );
    }

    // Check if proposal is expired
    if (proposal.expiresAt < new Date()) {
      await this.prisma.wcProposal.update({
        where: { id: proposal.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Proposal has expired');
    }

    // Get user's EIP-7702 accounts (if any)
    const eip7702Accounts = await this.getEip7702Accounts(userId);

    // Filter EIP-7702 accounts to only include approved chains
    let approvedAccounts = eip7702Accounts.filter((account) =>
      approvedChains.includes(account.chainId),
    );

    // If no EIP-7702 accounts, fall back to EOA addresses
    if (approvedAccounts.length === 0) {
      // Get user's EOA addresses
      const addresses = await this.addressManager.getAddresses(userId);

      // Map chain IDs to chain names and get addresses
      const chainIdToName: Record<number, string> = {
        1: 'ethereum',
        8453: 'base',
        42161: 'arbitrum',
        10: 'optimism',
        137: 'polygon',
        43114: 'avalanche',
        56: 'bnb',
        11155111: 'sepolia',
      };

      // Create accounts from EOA addresses for approved chains
      approvedAccounts = approvedChains
        .map((chainId) => {
          const chainName = chainIdToName[chainId];
          if (!chainName) return null;

          // Get EOA address for this chain (same address for all EVM chains)
          const address =
            addresses.ethereum || addresses.base || addresses.arbitrum;
          if (!address) return null;

          return {
            accountId: `eip155:${chainId}:${address}`,
            chainId,
            address: address,
            chainName: this.getChainName(chainId),
          };
        })
        .filter(
          (account): account is NonNullable<typeof account> => account !== null,
        );
    }

    if (approvedAccounts.length === 0) {
      throw new BadRequestException(
        `No wallet accounts found for approved chains: ${approvedChains.join(', ')}. Please create a wallet first.`,
      );
    }

    // Build namespaces (eip155 only)
    const namespaces = {
      eip155: {
        accounts: approvedAccounts.map((a) => a.accountId),
        methods:
          proposal.requiredMethods.length > 0
            ? proposal.requiredMethods
            : this.getDefaultMethods(),
        events:
          proposal.requiredEvents.length > 0
            ? proposal.requiredEvents
            : this.getDefaultEvents(),
        chains: approvedChains.map((id) => `eip155:${id}`),
      },
    };

    // Mark proposal as approved
    await this.prisma.wcProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });

    // Proposal approved

    // Return namespaces (frontend will call WalletKit.approveSession)
    // Session topic will be provided by WalletKit and saved later
    return {
      namespaces,
      session: {
        topic: '', // Will be filled by frontend after WalletKit.approveSession
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    };
  }

  /**
   * Reject a session proposal
   */
  async rejectProposal(
    userId: string,
    proposalId: number,
    reason?: string,
  ): Promise<void> {
    // Rejecting proposal

    const proposal = await this.prisma.wcProposal.findFirst({
      where: {
        proposalId,
        userId,
        status: 'PENDING',
      },
    });

    if (!proposal) {
      throw new NotFoundException(
        `Proposal ${proposalId} not found or already processed`,
      );
    }

    await this.prisma.wcProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason || 'User rejected',
      },
    });

    // Proposal rejected
  }

  /**
   * Save a new proposal to database
   * Called when session_proposal event is received
   */
  async saveProposal(
    userId: string,
    proposalId: number,
    proposer: {
      metadata?: {
        name?: string;
        url?: string;
        icons?: string[];
      };
    },
    requiredNamespaces: any,
    optionalNamespaces: any,
    expiresAt: Date,
  ): Promise<void> {
    // Saving proposal

    // Extract EIP-155 namespace requirements
    const eip155Required = requiredNamespaces?.eip155 || {};
    const eip155Optional = optionalNamespaces?.eip155 || {};

    await this.prisma.wcProposal.create({
      data: {
        userId,
        proposalId,
        proposerName: proposer.metadata?.name,
        proposerUrl: proposer.metadata?.url,
        proposerIcon: proposer.metadata?.icons?.[0],
        requiredChains: eip155Required.chains || [],
        requiredMethods: eip155Required.methods || [],
        requiredEvents: eip155Required.events || [],
        optionalChains: eip155Optional.chains || [],
        status: 'PENDING',
        expiresAt,
      },
    });

    // Proposal saved
  }

  private getDefaultMethods(): string[] {
    return [
      'eth_sendTransaction',
      'eth_signTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v4',
      'wallet_getCapabilities',
      'wallet_switchEthereumChain',
    ];
  }

  private getDefaultEvents(): string[] {
    return ['chainChanged', 'accountsChanged'];
  }

  private getChainName(chainId: number): string {
    const chainMap: Record<number, string> = {
      1: 'ethereum',
      8453: 'base',
      42161: 'arbitrum',
      10: 'optimism',
      137: 'polygon',
      43114: 'avalanche',
      56: 'bnb',
      11155111: 'sepolia',
    };
    return chainMap[chainId] || `chain-${chainId}`;
  }
}
