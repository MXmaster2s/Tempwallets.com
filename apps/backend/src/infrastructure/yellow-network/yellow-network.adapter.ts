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
import {
  NitroliteClient,
  type MainWallet,
} from '../../services/yellow-network/index.js';
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Address,
} from 'viem';
import { base } from 'viem/chains';
import { mnemonicToAccount } from 'viem/accounts';
import { SeedRepository } from '../../wallet/seed.repository.js';

@Injectable()
export class YellowNetworkAdapter
  implements IYellowNetworkPort, IChannelManagerPort
{
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
  async authenticate(
    userId: string,
    walletAddress: string,
  ): Promise<{
    sessionId: string;
    expiresAt: number;
    authSignature: string;
  }> {
    // Generate session ID from userId and wallet
    const sessionId = `${userId}:${walletAddress.toLowerCase()}`;

    // Session expires in 24 hours
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    // If already authenticated for this wallet, reuse client only when the
    // session is still valid on both the local and server side.
    // isAuthenticated() checks the local expiry; after a WebSocket reconnect the
    // server invalidates the session even if the local expiry hasn't passed, so
    // postReconnectSync() clears the local session — making isAuthenticated() false
    // and forcing a fresh auth here.
    if (this.currentClient && this.currentWallet === walletAddress) {
      if (
        this.currentClient.isInitialized() &&
        this.currentClient.isAuthenticated()
      ) {
        const authSignature = this.currentClient.getAuthSignature() || '';
        return { sessionId, expiresAt, authSignature };
      }
    }

    // Get seed phrase for user
    const seedPhrase = await this.seedRepository.getSeedPhrase(userId);

    // Create viem account
    const account = mnemonicToAccount(seedPhrase);

    // Create public client (for reading blockchain state)
    const publicClient = createPublicClient({
      chain: base,
      transport: http(
        this.configService.get<string>('BASE_RPC_URL') ||
          'https://mainnet.base.org',
      ),
    }) as PublicClient;

    // Create wallet client (for signing transactions) - MUST include account!
    const walletClient = createWalletClient({
      account, // <-- CRITICAL: Include the account for signing capability
      chain: base,
      transport: http(
        this.configService.get<string>('BASE_RPC_URL') ||
          'https://mainnet.base.org',
      ),
    }) as WalletClient;

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
    // Use the official SDK for channel operations - it handles ABI encoding correctly
    this.currentClient = new NitroliteClient({
      wsUrl: this.wsUrl,
      mainWallet,
      publicClient,
      walletClient,
      useSessionKeys: true,
      application: 'tempwallets-lightning',
      useSDK: true, // Enable SDK for correct on-chain operations
    });

    await this.currentClient.initialize();
    this.currentWallet = walletAddress;

    // Get authentication signature
    const authSignature = this.currentClient.getAuthSignature() || '';

    return { sessionId, expiresAt, authSignature };
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
   *
   * Per Yellow Network protocol (NitroRPC/0.4), allocations in submit_app_state
   * represent the FINAL state after the operation, NOT the delta.
   * The Clearnode computes deltas internally.
   *
   * For DEPOSIT: new sum > old sum (funds added from unified balance)
   * For WITHDRAW: new sum < old sum (funds returned to unified balance)
   * For OPERATE: new sum == old sum (redistribution between participants)
   */
  async updateSession(params: UpdateSessionParams): Promise<YellowSessionData> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    // Get current session state to retrieve version number
    const currentSession = await this.currentClient.getLightningNode(
      params.sessionId as `0x${string}`,
    );

    console.log(
      `[YellowNetworkAdapter] Current session version before ${params.intent}: ${currentSession.version}`,
    );
    console.log(
      `[YellowNetworkAdapter] Current session allocations:`,
      JSON.stringify(currentSession.allocations),
    );

    // Validate allocations
    if (!params.allocations || params.allocations.length === 0) {
      throw new Error('No allocations provided');
    }

    console.log(
      `[YellowNetworkAdapter] Submitting ${params.intent} with version ${currentSession.version + 1}`,
    );
    console.log(
      `[YellowNetworkAdapter] New allocations:`,
      JSON.stringify(params.allocations),
    );

    // Submit the allocations directly as FINAL state — this is what Yellow protocol expects.
    // The caller provides the complete desired allocation state.
    const result = await this.currentClient.submitAppState(
      params.sessionId as `0x${string}`,
      params.intent,
      currentSession.version + 1,
      params.allocations.map((a) => ({
        participant: a.participant as Address,
        asset: a.asset,
        amount: a.amount,
      })),
    );

    console.log(
      `[YellowNetworkAdapter] Submit result:`,
      JSON.stringify(result),
    );

    // Refresh session to get updated state
    const updated = await this.currentClient.getLightningNode(
      params.sessionId as `0x${string}`,
    );

    console.log(
      `[YellowNetworkAdapter] Updated session version after ${params.intent}: ${updated.version}`,
    );
    console.log(
      `[YellowNetworkAdapter] Updated session allocations:`,
      JSON.stringify(updated.allocations),
    );

    return updated as YellowSessionData;
  }

  /**
   * Close app session
   */
  async closeSession(
    sessionId: string,
    finalAllocations: Array<{
      participant: string;
      asset: string;
      amount: string;
    }>,
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
      sessionId as `0x${string}`,
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

    const sessions = await this.currentClient.getLightningNodes(
      filters.status || 'open',
    );

    // Filter by participant if specified
    if (filters.participant) {
      const normalized = filters.participant.toLowerCase();
      return sessions.filter((s: any) =>
        s.definition?.participants?.some(
          (p: string) => p.toLowerCase() === normalized,
        ),
      ) as YellowSessionData[];
    }

    return sessions as YellowSessionData[];
  }

  /**
   * Get unified balance (ledger balances)
   */
  async getUnifiedBalance(
    accountId?: string,
  ): Promise<
    Array<{ asset: string; amount: string; locked: string; available: string }>
  > {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    return await this.currentClient.getUnifiedBalance();
  }

  /**
   * Get balances within a specific app session
   * Uses get_ledger_balances with app_session_id as account_id
   */
  async getAppSessionBalances(
    appSessionId: string,
  ): Promise<
    Array<{ asset: string; amount: string; locked: string; available: string }>
  > {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    return await this.currentClient.getAppSessionBalances(
      appSessionId as `0x${string}`,
    );
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

    // Resolve participants - if not provided, they will be null
    // The channel service will use the channel's own participants from its state
    let participantsTuple: [Address, Address] | undefined;

    if (params.participants.length >= 2) {
      participantsTuple = [
        params.participants[0] as Address,
        params.participants[1] as Address,
      ];
    } else {
      // Let the channel service resolve participants from channel data
      console.log(
        `[YellowNetworkAdapter] Participants not provided, will resolve from channel data`,
      );
      participantsTuple = undefined;
    }

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
   *
   * CRITICAL: Filter channels by user address to prevent trying to operate
   * on channels owned by other users (which causes "invalid signature" errors)
   */
  async getChannels(userAddress: string): Promise<ChannelInfo[]> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    const channels = await this.currentClient.getChannels();

    // Normalize user address for comparison
    const normalizedUserAddress = userAddress.toLowerCase();

    // Filter channels to only include those owned by this user
    // The query service maps 'participant' from API to 'participants[0]'
    const userChannels = (channels || []).filter((ch: any) => {
      // Check participants array (from transformed response)
      if (Array.isArray(ch.participants) && ch.participants.length > 0) {
        const channelOwner = (ch.participants[0] || '').toLowerCase();
        return channelOwner === normalizedUserAddress;
      }
      // Fallback: check raw 'participant' or 'wallet' fields
      const channelOwner = (ch.participant || ch.wallet || '').toLowerCase();
      return channelOwner === normalizedUserAddress;
    });

    console.log(
      `[YellowNetworkAdapter] Found ${channels?.length || 0} total channels, ` +
        `${userChannels.length} belong to user ${userAddress}`,
    );

    return userChannels.map((ch: any) => ({
      channelId: ch.channelId,
      chainId: ch.chainId || 0,
      balance: ch.balance || '0',
      status: ch.status || 'active',
    }));
  }

  /**
   * Close a payment channel
   */
  async closeChannel(
    channelId: string,
    chainId: number,
    fundsDestination: string,
  ): Promise<void> {
    if (!this.currentClient) {
      throw new BadRequestException('Not authenticated with Yellow Network');
    }

    await this.currentClient.closeChannel(
      channelId as `0x${string}`,
      chainId,
      fundsDestination as Address,
    );
  }
}
