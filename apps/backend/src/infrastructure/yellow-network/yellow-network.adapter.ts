/**
 * YELLOW NETWORK ADAPTER
 *
 * Infrastructure Layer - Implements Yellow Network Port
 *
 * This adapter implements the IYellowNetworkPort interface defined in the
 * application layer. It wraps the existing NitroliteClient services.
 *
 * Why an adapter?
 * - Decouples application logic from Yellow Network implementation
 * - Makes testing easier (can mock the port interface)
 * - Allows swapping Yellow Network for different implementation
 *
 * Simplified from current implementation:
 * - No client caching (premature optimization)
 * - Creates client when needed (simple and clean)
 * - Uses existing NitroliteClient under the hood
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IYellowNetworkPort,
  CreateSessionParams,
  UpdateSessionParams,
  YellowSessionData,
} from '../../application/app-session/ports/yellow-network.port.js';
import {
  IChannelManagerPort,
  CreateChannelParams,
  ResizeChannelParams,
  ChannelInfo,
} from '../../application/channel/ports/channel-manager.port.js';
import { NitroliteClient, type MainWallet } from '../../services/yellow-network/index.js';
import { createPublicClient, http, type PublicClient, type WalletClient, type Address } from 'viem';
import { base } from 'viem/chains';
import { mnemonicToAccount } from 'viem/accounts';
import { SeedRepository } from '../../wallet/seed.repository.js';

@Injectable()
export class YellowNetworkAdapter implements IYellowNetworkPort, IChannelManagerPort {
  private wsUrl: string;
  private currentClient: NitroliteClient | null = null;
  private currentWallet: string | null = null;

  constructor(
    private configService: ConfigService,
    private seedRepository: SeedRepository,
  ) {
    this.wsUrl = this.configService.get<string>('YELLOW_NETWORK_WS_URL') || '';
    if (!this.wsUrl) {
      throw new Error('YELLOW_NETWORK_WS_URL not configured');
    }
  }

  /**
   * Authenticate wallet with Yellow Network
   * Creates NitroliteClient and establishes connection
   */
  async authenticate(userId: string, walletAddress: string): Promise<void> {
    // If already authenticated for this wallet, reuse client
    if (this.currentClient && this.currentWallet === walletAddress) {
      if (this.currentClient.isInitialized()) {
        return;
      }
    }

    // Get seed phrase for user
    const seedPhrase = await this.seedRepository.getSeedPhrase(userId);

    // Create viem account
    const account = mnemonicToAccount(seedPhrase);

    // Create public client
    const publicClient = createPublicClient({
      chain: base,
      transport: http(this.configService.get<string>('BASE_RPC_URL') || 'https://mainnet.base.org'),
    }) as PublicClient;

    // Create wallet client
    const walletClient = createPublicClient({
      chain: base,
      transport: http(this.configService.get<string>('BASE_RPC_URL') || 'https://mainnet.base.org'),
    }) as unknown as WalletClient;

    // Create MainWallet interface
    const mainWallet: MainWallet = {
      address: account.address,
      signTypedData: async (typedData: any) => {
        return await account.signTypedData({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
      },
    };

    // Create NitroliteClient
    this.currentClient = new NitroliteClient({
      wsUrl: this.wsUrl,
      mainWallet,
      publicClient,
      walletClient,
      useSessionKeys: true,
      application: 'tempwallets-lightning',
    });

    await this.currentClient.initialize();
    this.currentWallet = walletAddress;
  }

  /**
   * Create app session
   */
  async createSession(params: CreateSessionParams): Promise<YellowSessionData> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    const result = await this.currentClient.createLightningNode({
      participants: params.definition.participants as Address[],
      weights: params.definition.weights,
      quorum: params.definition.quorum,
      token: params.allocations[0]?.asset || 'usdc',
      initialAllocations: params.allocations as any,
      sessionData: undefined,
    });

    return result as YellowSessionData;
  }

  /**
   * Update app session allocations
   */
  async updateSession(params: UpdateSessionParams): Promise<YellowSessionData> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    // Get current session state
    const currentSession = await this.currentClient.getLightningNode(
      params.sessionId as `0x${string}`
    );

    // Validate allocations
    if (!params.allocations || params.allocations.length === 0) {
      throw new Error('No allocations provided');
    }

    const firstAllocation = params.allocations[0];
    if (!firstAllocation) {
      throw new Error('First allocation is undefined');
    }

    // Depending on intent, call appropriate method
    let result;
    switch (params.intent) {
      case 'DEPOSIT':
        // For deposit, we need to know which participant is depositing
        // This is a simplification - real implementation would be more complex
        result = await this.currentClient.depositToLightningNode(
          params.sessionId as `0x${string}`,
          firstAllocation.participant as Address,
          firstAllocation.asset,
          firstAllocation.amount,
          currentSession.allocations as any,
        );
        break;

      case 'WITHDRAW':
        result = await this.currentClient.withdrawFromLightningNode(
          params.sessionId as `0x${string}`,
          firstAllocation.participant as Address,
          firstAllocation.asset,
          firstAllocation.amount,
          currentSession.allocations as any,
        );
        break;

      case 'OPERATE':
        // For transfers, we need from/to addresses
        // This is a simplification - real implementation would parse allocations
        const secondAllocation = params.allocations[1];
        if (!secondAllocation) {
          throw new Error('Transfer requires two allocations (from and to)');
        }
        result = await this.currentClient.transferInLightningNode(
          params.sessionId as `0x${string}`,
          firstAllocation.participant as Address,
          secondAllocation.participant as Address,
          firstAllocation.asset,
          firstAllocation.amount,
          currentSession.allocations as any,
        );
        break;
    }

    // Refresh session to get updated state
    const updated = await this.currentClient.getLightningNode(
      params.sessionId as `0x${string}`
    );

    return updated as YellowSessionData;
  }

  /**
   * Close app session
   */
  async closeSession(
    sessionId: string,
    finalAllocations: Array<{ participant: string; asset: string; amount: string }>
  ): Promise<void> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    await this.currentClient.closeLightningNode(
      sessionId as `0x${string}`,
      finalAllocations as any,
    );
  }

  /**
   * Query specific app session
   */
  async querySession(sessionId: string): Promise<YellowSessionData> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    const session = await this.currentClient.getLightningNode(
      sessionId as `0x${string}`
    );

    return session as YellowSessionData;
  }

  /**
   * Query all app sessions
   */
  async querySessions(filters: {
    participant?: string;
    status?: 'open' | 'closed';
  }): Promise<YellowSessionData[]> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    const sessions = await this.currentClient.getLightningNodes(filters.status || 'open');

    // Filter by participant if specified
    if (filters.participant) {
      const normalized = filters.participant.toLowerCase();
      return sessions.filter((s: any) =>
        s.definition?.participants?.some((p: string) => p.toLowerCase() === normalized)
      ) as YellowSessionData[];
    }

    return sessions as YellowSessionData[];
  }

  // ============================================================================
  // Channel Management Implementation (IChannelManagerPort)
  // ============================================================================

  /**
   * Create a new 2-party payment channel
   */
  async createChannel(params: CreateChannelParams): Promise<ChannelInfo> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    const result = await this.currentClient.createChannel(
      params.chainId,
      params.tokenAddress as Address,
      params.initialBalance,
    );

    return {
      channelId: result.channelId,
      chainId: params.chainId,
      balance: params.initialBalance.toString(),
      status: 'active',
    };
  }

  /**
   * Resize channel (add or remove funds)
   */
  async resizeChannel(params: ResizeChannelParams): Promise<void> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    // Ensure participants is exactly 2 elements
    if (params.participants.length !== 2) {
      throw new BadRequestException('Channel requires exactly 2 participants');
    }

    const participantsTuple: [Address, Address] = [
      params.participants[0] as Address,
      params.participants[1] as Address,
    ];

    await this.currentClient.resizeChannel(
      params.channelId as `0x${string}`,
      params.chainId,
      params.amount,
      params.userAddress as Address,
      params.tokenAddress as Address,
      participantsTuple,
    );
  }

  /**
   * Get existing channels for user
   */
  async getChannels(userAddress: string): Promise<ChannelInfo[]> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    const channels = await this.currentClient.getChannels();

    return (channels || []).map((ch: any) => ({
      channelId: ch.channelId,
      chainId: ch.chainId || 0,
      balance: ch.balance || '0',
      status: ch.status || 'active',
    }));
  }

  /**
   * Close a payment channel
   */
  async closeChannel(channelId: string): Promise<void> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    // Note: Implement channel closing logic based on NitroliteClient API
    throw new BadRequestException('Channel closing not yet implemented');
  }
}
