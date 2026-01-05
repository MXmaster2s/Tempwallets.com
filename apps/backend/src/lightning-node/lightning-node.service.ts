import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { mnemonicToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base, arbitrum } from 'viem/chains';
import {
  NitroliteClient,
  type MainWallet,
} from '../services/yellow-network/index.js';
import type {
  AppSession,
  AppSessionAllocation,
} from '../services/yellow-network/types.js';
import type {
  CreateLightningNodeDto,
  DepositFundsDto,
  TransferFundsDto,
  CloseLightningNodeDto,
  JoinLightningNodeDto,
  AuthenticateWalletDto,
  SearchSessionDto,
} from './dto/index.js';
import { SeedRepository } from '../wallet/seed.repository.js';
import { WalletService } from '../wallet/wallet.service.js';
import { PimlicoConfigService } from '../wallet/config/pimlico.config.js';

// Note: This codebase uses WalletAddress model, not TempWallet
// "tempwallet" refers to the wallet address concept
// Normal EVM wallets (EOA) have private keys and can sign directly
// ERC-4337 wallets need their parent EOA for signing

@Injectable()
export class LightningNodeService {
  private readonly logger = new Logger(LightningNodeService.name);
  private wsUrl: string;

  // Cache for user NitroliteClients (to avoid recreating for each request)
  private userClients: Map<string, NitroliteClient> = new Map();

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private seedRepository: SeedRepository,
    private walletService: WalletService,
    private pimlicoConfig: PimlicoConfigService,
  ) {
    this.wsUrl = this.configService.get<string>('YELLOW_NETWORK_WS_URL') || '';
    if (!this.wsUrl) {
      this.logger.warn(
        'YELLOW_NETWORK_WS_URL not configured. Lightning Node operations will fail.',
      );
    }
  }

  /**
   * Get user's wallet address for a given network/chain
   * Prefers normal EOA wallets (ethereum, base, etc.) over ERC-4337 wallets for signing
   * Returns both the address and whether it's an EOA wallet
   * Auto-creates wallet if it doesn't exist
   */
  private async getUserWalletAddress(
    userId: string,
    chainName: string,
  ): Promise<{ address: Address; isEOA: boolean; chainKey: string }> {
    // Map chain name to the base chain (e.g., 'base' -> 'base', 'baseErc4337' -> 'base')
    const baseChain = this.getBaseChainName(chainName);

    // Lightning Node requires direct EOA signing. If EIP-7702 is enabled, log and proceed with the raw EOA.
    if (this.pimlicoConfig.isEip7702Enabled(baseChain)) {
      this.logger.warn(
        `EIP-7702 is enabled on ${baseChain}, but Lightning Node requires direct EOA signing. ` +
          `Proceeding with the EOA (no delegation/UserOp).`,
      );
    }

    // IMPORTANT: Use WalletService.getAddresses() which auto-creates wallet if needed
    // This works for both temp users (WalletSeed) and authenticated users (Wallet table)
    this.logger.debug(`Ensuring wallet exists for user ${userId}...`);
    const allAddresses = await this.walletService.getAddresses(userId);
    this.logger.debug(
      `Got addresses for user ${userId}:`,
      Object.keys(allAddresses),
    );

    // Get address for the requested chain directly from the addresses object (EOA only)
    const walletAddress = allAddresses[baseChain as keyof typeof allAddresses];
    const isEOA = true;
    const chainKey = baseChain;

    if (!walletAddress) {
      // List available chains for better error message
      const availableChains = Object.keys(allAddresses)
        .filter((chain) => allAddresses[chain as keyof typeof allAddresses])
        .join(', ');

      throw new NotFoundException(
        `No wallet address found for chain "${chainName}" (tried ${baseChain}). ` +
          `Available chains: ${availableChains || 'none'}. ` +
          `Please select a different chain or refresh your wallet to generate addresses for this chain.`,
      );
    }

    this.logger.debug(
      `Found wallet address ${walletAddress} for user ${userId} on ${chainKey} (EOA)`,
    );

    return {
      address: walletAddress as Address,
      isEOA,
      chainKey,
    };
  }

  /**
   * Get base chain name (removes Erc4337 suffix if present)
   */
  private getBaseChainName(chainName: string): string {
    const normalized = chainName.toLowerCase();
    // Remove Erc4337 suffix if present
    return normalized.replace(/erc4337$/i, '');
  }

  /**
   * Create a viem EOA account from user's seed phrase for signing
   * This uses the normal EVM wallet (EOA) which has a private key
   */
  private async createEOASignerAccount(
    userId: string,
    chainName: string,
  ): Promise<{
    address: Address;
    signTypedData: (typedData: any) => Promise<string>;
  }> {
    try {
      // Get user's seed phrase
      const seedPhrase = await this.seedRepository.getSeedPhrase(userId);

      // Normalize chain name to base chain (remove Erc4337 suffix)
      const baseChain = this.getBaseChainName(chainName);

      // Create viem account from mnemonic (uses HD path: m/44'/60'/0'/0/0)
      // This gives us access to the private key for signing
      const account = mnemonicToAccount(seedPhrase, {
        accountIndex: 0,
        addressIndex: 0,
      });

      this.logger.debug(
        `Created EOA signer account ${account.address} for user ${userId} on ${baseChain}`,
      );

      // Return a wrapper that provides signTypedData
      return {
        address: account.address,
        signTypedData: async (typedData: any) => {
          // Viem requires typed data to be destructured
          return await account.signTypedData({
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
        },
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to create EOA signer account for user ${userId}: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `Failed to create signer account: ${err.message}. ` +
          `Make sure the user has a wallet seed phrase configured.`,
      );
    }
  }

  /**
   * Get viem chain from chain name
   * Supported networks: base, arbitrum
   */
  private getChain(chainName: string) {
    switch (chainName.toLowerCase()) {
      case 'base':
        return base;
      case 'arbitrum':
        return arbitrum;
      default:
        return base;
    }
  }

  /**
   * Get default RPC URL for chain
   * Supported networks: base, arbitrum
   */
  private getDefaultRpcUrl(chainName: string): string {
    switch (chainName.toLowerCase()) {
      case 'base':
        return 'https://mainnet.base.org';
      case 'arbitrum':
        return 'https://arb1.arbitrum.io/rpc';
      default:
        return 'https://mainnet.base.org';
    }
  }

  /**
   * Execute a Yellow Network operation with automatic retry on session expiry
   *
   * If the operation fails due to expired session, clears cache and retries once
   * with a freshly authenticated client.
   */
  private async executeWithRetry<T>(
    operation: (client: NitroliteClient) => Promise<T>,
    userId: string,
    chainName: string,
    userWalletAddress: Address,
    isEOA: boolean,
    chainKey: string,
    cacheKey: string,
  ): Promise<T> {
    try {
      const client = await this.getUserNitroliteClient(
        userId,
        chainName,
        userWalletAddress,
        isEOA,
        chainKey,
      );
      return await operation(client);
    } catch (error) {
      const err = error as Error;
      // If session expired, clear cache and retry once with fresh authentication
      if (
        err.message.includes('Session expired') ||
        err.message.includes('re-authenticate')
      ) {
        this.logger.warn(
          `Session expired during operation, re-authenticating and retrying...`,
        );
        // Clear the cached client to force re-authentication
        this.userClients.delete(cacheKey);

        // Get fresh authenticated client
        const freshClient = await this.getUserNitroliteClient(
          userId,
          chainName,
          userWalletAddress,
          isEOA,
          chainKey,
        );

        // Retry the operation
        return await operation(freshClient);
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Create or get NitroliteClient for a user's wallet
   *
   * Uses normal EOA wallets (ethereum, base, etc.) for signing when available.
   * These wallets have private keys and can sign EIP-712 messages directly.
   *
   * For ERC-4337 wallets, we use the parent EOA wallet for signing.
   */
  private async getUserNitroliteClient(
    userId: string,
    chainName: string,
    walletAddress: Address,
    isEOA: boolean,
    chainKey: string,
  ): Promise<NitroliteClient> {
    const cacheKey = `${userId}-${chainName}-${walletAddress}`;

    // Check cache
    if (this.userClients.has(cacheKey)) {
      const cached = this.userClients.get(cacheKey)!;
      // Check both initialization AND authentication (session expiry)
      // isInitialized() only checks if client was initialized, not if session is still valid
      // isAuthenticated() checks if session key exists and hasn't expired
      if (cached.isInitialized() && cached.isAuthenticated()) {
        this.logger.debug(
          `Reusing cached NitroliteClient for user ${userId} (session still valid)`,
        );
        return cached;
      }
      // Remove invalid/expired client from cache
      this.logger.log(
        `Cached NitroliteClient expired or invalid for user ${userId}, removing from cache`,
      );
      this.userClients.delete(cacheKey);
    }

    if (!this.wsUrl) {
      throw new BadRequestException('YELLOW_NETWORK_WS_URL is not configured.');
    }

    const baseChain = this.getBaseChainName(chainName);
    const chain = this.getChain(baseChain);
    const rpcUrl =
      this.configService.get<string>(`${baseChain.toUpperCase()}_RPC_URL`) ||
      this.getDefaultRpcUrl(baseChain);

    // Create public client
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    }) as PublicClient;

    // Create wallet client (used for on-chain operations)
    const walletClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    }) as unknown as WalletClient;

    // Create EOA signer account for signing EIP-712 messages
    // This uses the normal EVM wallet which has a private key
    const eoaSigner = await this.createEOASignerAccount(userId, baseChain);

    this.logger.log(
      `Using EOA address ${eoaSigner.address} for authentication (wallet address: ${walletAddress})`,
    );

    // Create MainWallet interface
    // Use EOA address as main wallet address - signature must match the address in typed data
    const mainWallet: MainWallet = {
      address: eoaSigner.address, // Use EOA address since that's what we sign with
      signTypedData: async (typedData: any) => {
        try {
          this.logger.debug(
            `Signing EIP-712 with address ${eoaSigner.address}, typed data message wallet: ${typedData.message?.wallet}`,
          );
          // Sign with the EOA account (which has the private key)
          // Viem requires destructured typed data
          const signature = await eoaSigner.signTypedData({
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
          this.logger.debug(
            `Signed EIP-712 message for wallet ${eoaSigner.address}`,
          );
          return signature;
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `Failed to sign typed data: ${err.message}`,
            err.stack,
          );
          throw new BadRequestException(`Signing failed: ${err.message}`);
        }
      },
    };

    // Create NitroliteClient
    const nitroliteClient = new NitroliteClient({
      wsUrl: this.wsUrl,
      mainWallet,
      publicClient,
      walletClient,
      useSessionKeys: true,
      application: 'tempwallets-lightning',
    });

    await nitroliteClient.initialize();

    // Cache the client
    this.userClients.set(cacheKey, nitroliteClient);

    this.logger.log(
      `✅ Created NitroliteClient for user ${userId} with wallet ${walletAddress} (${isEOA ? 'EOA' : 'ERC-4337'})`,
    );

    return nitroliteClient;
  }

  /**
   * Create a new Lightning Node (App Session)
   *
   * IMPORTANT: According to Yellow Network protocol, ALL participants with non-zero
   * initial allocations MUST sign the creation request. This requires coordination
   * between participants before creation can complete.
   *
   * For now, we only support creation with ONE participant (creator only) OR
   * creation where only the creator has initial funds (others join with 0 balance).
   */
  async create(dto: CreateLightningNodeDto) {
    this.logger.log(`Creating Lightning Node for user ${dto.userId}`);

    try {
      // Ensure a User row exists for FK constraint (temp users don't live in User table by default)
      await this.ensureUserRecord(dto.userId);

      // Validate chain is provided and supported
      if (!dto.chain) {
        throw new BadRequestException(
          'Chain is required. Please select either "base" or "arbitrum".',
        );
      }

      const chainName = dto.chain.toLowerCase();
      if (chainName !== 'base' && chainName !== 'arbitrum') {
        throw new BadRequestException(
          `Unsupported chain: ${dto.chain}. Only "base" and "arbitrum" are supported.`,
        );
      }

      // Get user's wallet address for the chain
      const {
        address: userWalletAddress,
        isEOA,
        chainKey,
      } = await this.getUserWalletAddress(dto.userId, chainName);

      // Yellow Network app sessions have a FIXED participant set defined at creation.
      // ALL participants are pre-authorized - there is no "join" step in Yellow protocol.
      // - creator is always included
      // - require at least 2 UNIQUE participants (creator + >=1 invitee)
      const normalizedUserAddress = userWalletAddress.toLowerCase();

      const requestedParticipants = (dto.participants || [])
        .map((p) => p.trim())
        .filter(Boolean);

      // Deduplicate, preserve order with creator first
      const seen = new Set<string>();
      const participants: Address[] = [];

      const pushUnique = (addr: string) => {
        const key = addr.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        participants.push(addr as Address);
      };

      pushUnique(userWalletAddress);
      requestedParticipants.forEach(pushUnique);

      if (participants.length < 2) {
        throw new BadRequestException(
          'Lightning Nodes require at least 1 participant address besides the creator.',
        );
      }

      // Calculate weights (equal by default)
      const weights: number[] =
        dto.weights || participants.map(() => 100 / participants.length);

      // Calculate quorum (majority by default)
      const quorum = dto.quorum || Math.ceil((participants.length / 2) * 100);

      // Convert initial allocations to Yellow Network format
      const initialAllocations: AppSessionAllocation[] = (
        dto.initialAllocations || []
      ).map((alloc) => ({
        participant: alloc.participant as `0x${string}`,
        asset: dto.token.toLowerCase(),
        amount: alloc.amount,
      }));

      // IMPORTANT: Validate Yellow Network multi-signature requirement
      // All participants with non-zero allocations must sign the creation request
      const participantsWithFunds = initialAllocations.filter(
        (a) => parseFloat(a.amount) > 0,
      );

      if (participantsWithFunds.length > 1) {
        this.logger.warn(
          `[LN/create] Multiple participants have initial funds. ` +
            `Yellow Network requires ALL of them to sign the creation request. ` +
            `This feature is not yet implemented. Only creator will sign.`,
        );
        // TODO: Implement multi-party signing flow
        // For now, we'll proceed with single signer and let Yellow Network reject if needed
      }

      // Create app session via Yellow Network
      // NOTE: In Yellow Network, ALL participants are authorized at creation time.
      // There is no separate "join" step in the protocol itself.
      this.logger.log('Creating app session on Yellow Network...');
      this.logger.log(`  - Participants: ${participants.join(', ')}`);
      this.logger.log(`  - Weights: ${weights.join(', ')}`);
      this.logger.log(`  - Quorum: ${quorum}`);

      const cacheKey = `${dto.userId}-${chainName}-${userWalletAddress}`;
      const appSession = await this.executeWithRetry(
        async (client) =>
          await client.createLightningNode({
            participants,
            weights,
            quorum,
            token: dto.token.toLowerCase(),
            initialAllocations,
            sessionData: dto.sessionData,
          }),
        dto.userId,
        chainName,
        userWalletAddress,
        isEOA,
        chainKey,
        cacheKey,
      );

      const appSessionId = appSession.app_session_id;
      
      // Validate appSessionId is present and valid
      if (!appSessionId || typeof appSessionId !== 'string') {
        this.logger.error(
          `Failed to create app session: app_session_id is missing or invalid`,
          { appSession },
        );
        throw new BadRequestException(
          'Failed to create app session: Yellow Network did not return a valid session ID',
        );
      }

      this.logger.log(
        `✅ App session created on Yellow Network: ${appSessionId}`,
      );

      const uri = this.generateLightningNodeUri(appSessionId);

      // Store in database
      // - creator is immediately "joined" (has interacted with the session)
      // - other participants are "invited" (pre-authorized on Yellow, but haven't accessed yet locally)
      // NOTE: "invited" is a LOCAL status, not a Yellow Network concept
      const dbParticipants = participants.map((address, index) => {
        const initialAlloc = initialAllocations.find(
          (a) => a.participant.toLowerCase() === address.toLowerCase(),
        );
        const initialBalance = initialAlloc ? initialAlloc.amount : '0';
        const weight = weights[index] || 100 / participants.length;

        const isCreator = address.toLowerCase() === normalizedUserAddress;

        return {
          address,
          weight,
          balance: initialBalance,
          asset: dto.token,
          status: isCreator ? 'joined' : 'invited',
          joinedAt: isCreator ? new Date() : undefined,
          lastSeenAt: isCreator ? new Date() : undefined,
        };
      });

      const lightningNode = await this.prisma.lightningNode.create({
        data: {
          userId: dto.userId,
          appSessionId,
          uri,
          chain: chainName,
          token: dto.token,
          status: appSession.status,
          maxParticipants: 50,
          quorum,
          protocol: 'NitroRPC/0.4',
          challenge: 3600,
          sessionData: dto.sessionData,
          participants: {
            create: dbParticipants,
          },
        },
        include: {
          participants: true,
          transactions: true,
        },
      });

      this.logger.log(`✅ Lightning Node created: ${lightningNode.id}`);

      return {
        ok: true,
        node: this.formatLightningNode(lightningNode),
        warning:
          participantsWithFunds.length > 1
            ? 'Multiple participants have initial funds. They should all authenticate separately to interact with the session.'
            : undefined,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to create Lightning Node: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `Failed to create Lightning Node: ${err.message}`,
      );
    }
  }

  /**
   * Ensure a User row exists to satisfy lightning_node.userId FK.
   * - For temp users (temp- prefix), upsert a minimal stub user record using the temp ID as primary key.
   * - For authenticated users, enforce existence to avoid silent FK failures.
   */
  private async ensureUserRecord(userId: string): Promise<void> {
    const isTemp = userId.startsWith('temp-');

    if (isTemp) {
      await this.prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          name: userId,
        },
      });
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }
  }

  // ============================================================================
  // Yellow Network Native Flow Methods
  // ============================================================================

  /**
   * Authenticate user's wallet with Yellow Network
   *
   * This is the FIRST step in Yellow Network's architecture.
   * Creates (or reuses cached) authenticated NitroliteClient for the user's wallet.
   * After authentication, the user can query and interact with any app session
   * that includes their wallet address.
   *
   * This is a ONE-TIME setup per wallet, not per session.
   */
  async authenticateWallet(dto: AuthenticateWalletDto) {
    this.logger.log(`[AUTH] Authenticating wallet for user ${dto.userId}`);

    try {
      // Validate chain if provided, otherwise default to base
      let chainName = dto.chain ? dto.chain.toLowerCase() : 'base';
      if (chainName !== 'base' && chainName !== 'arbitrum') {
        throw new BadRequestException(
          `Unsupported chain: ${dto.chain}. Only "base" and "arbitrum" are supported.`,
        );
      }

      // Get user's wallet address for the chain
      const {
        address: userWalletAddress,
        isEOA,
        chainKey,
      } = await this.getUserWalletAddress(dto.userId, chainName);

      this.logger.log(
        `[AUTH] User wallet address: ${userWalletAddress} (${chainKey})`,
      );

      // Create or get cached authenticated NitroliteClient
      const nitroliteClient = await this.getUserNitroliteClient(
        dto.userId,
        chainName,
        userWalletAddress,
        isEOA,
        chainKey,
      );

      // Verify authentication by pinging Yellow Network
      const pingResult = await nitroliteClient.ping();

      this.logger.log(`[AUTH] ✅ Wallet authenticated successfully`);
      this.logger.log(
        `[AUTH] Ping response: ${pingResult.pong} (${pingResult.timestamp})`,
      );

      return {
        ok: true,
        authenticated: true,
        walletAddress: userWalletAddress,
        chain: chainName,
        isEOA,
        timestamp: pingResult.timestamp,
        message: 'Wallet authenticated with Yellow Network',
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[AUTH] Failed to authenticate wallet: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `Failed to authenticate wallet: ${err.message}`,
      );
    }
  }

  /**
   * Search for a specific Lightning Node session by ID
   *
   * Uses Yellow Network's native getLightningNode() method to query a session.
   * The user must be authenticated (have a NitroliteClient) and must be a
   * participant in the session.
   *
   * This is Yellow Network's way of "accessing" a session - you query it
   * using its app_session_id.
   */
  async searchSession(dto: SearchSessionDto) {
    this.logger.log(
      `[SEARCH] User ${dto.userId} searching for session ${dto.sessionId}`,
    );

    try {
      // Parse and validate session ID
      const appSessionId = this.parseSessionIdFromInput(dto.sessionId);

      // Try to find session in local DB first (for chain info)
      let chainName = dto.chain ? dto.chain.toLowerCase() : 'base';
      const localSession = await this.prisma.lightningNode.findUnique({
        where: { appSessionId },
        include: { participants: true },
      });

      if (localSession) {
        chainName = localSession.chain.toLowerCase();
        this.logger.log(
          `[SEARCH] Found session in local DB, using chain: ${chainName}`,
        );
      }

      // Get user's wallet address
      const {
        address: userWalletAddress,
        isEOA,
        chainKey,
      } = await this.getUserWalletAddress(dto.userId, chainName);

      this.logger.log(`[SEARCH] Querying as wallet: ${userWalletAddress}`);

      // Query Yellow Network for the session
      this.logger.log(`[SEARCH] Querying Yellow Network...`);
      const cacheKey = `${dto.userId}-${chainName}-${userWalletAddress}`;
      const remoteSession = await this.executeWithRetry(
        async (client) => {
          return await client.getLightningNode(appSessionId as `0x${string}`);
        },
        dto.userId,
        chainName,
        userWalletAddress,
        isEOA,
        chainKey,
        cacheKey,
      );

      this.logger.log(`[SEARCH] ✅ Session found on Yellow Network`);
      this.logger.log(`[SEARCH]   - Status: ${remoteSession.status}`);
      this.logger.log(`[SEARCH]   - Version: ${remoteSession.version}`);
      const remoteParticipants =
        remoteSession.definition?.participants?.filter(Boolean) || [];
      const localParticipants = (localSession?.participants || []).map(
        (p) => p.address,
      );
      const effectiveParticipants =
        remoteParticipants.length > 0 ? remoteParticipants : localParticipants;

      this.logger.log(
        `[SEARCH]   - Participants (remote/local fallback): ${effectiveParticipants.length}`,
      );

      // Verify user is a participant (fallback to local DB if Yellow response is empty)
      const isParticipant = effectiveParticipants.some(
        (p: string) => p.toLowerCase() === userWalletAddress.toLowerCase(),
      );

      if (!isParticipant) {
        this.logger.warn(
          `[SEARCH] User ${userWalletAddress} is NOT a participant in this session`,
        );
        throw new BadRequestException(
          `You are not a participant in this session. ` +
            `Your wallet address (${userWalletAddress}) was not included when the session was created.`,
        );
      }

      this.logger.log(`[SEARCH] ✅ User is a participant`);

      // Sync to local DB if not already there
      if (!localSession) {
        this.logger.log(`[SEARCH] Session not in local DB, syncing...`);
        await this.syncRemoteSessionToLocalDB(
          remoteSession,
          dto.userId,
          chainName,
        );
      } else {
        // Update existing session
        await this.updateLocalSessionFromRemote(localSession.id, remoteSession);

        // Update participant status to mark they've accessed it
        const participant = localSession.participants.find(
          (p) => p.address.toLowerCase() === userWalletAddress.toLowerCase(),
        ) as (typeof localSession.participants)[number] & { status?: string };

        if (participant && participant.status !== 'joined') {
          await this.prisma.lightningNodeParticipant.update({
            where: { id: participant.id },
            data: {
              status: 'joined',
              joinedAt: new Date(),
              lastSeenAt: new Date(),
            } as any,
          });
        }
      }

      // Get updated local session with metadata
      const updatedLocalSession = await this.prisma.lightningNode.findUnique({
        where: { appSessionId },
        include: { participants: true, transactions: true },
      });

      return {
        ok: true,
        session: remoteSession,
        localMetadata: updatedLocalSession
          ? this.formatLightningNode(updatedLocalSession)
          : null,
        message: 'Session found and synced',
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[SEARCH] Failed to search session: ${err.message}`,
        err.stack,
      );

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to search for session: ${err.message}. ` +
          `Make sure you're authenticated and the session exists.`,
      );
    }
  }

  /**
   * Discover all Lightning Node sessions where user is a participant
   *
   * Uses Yellow Network's native getLightningNodes() method to query all
   * app sessions, then filters to sessions where the user is a participant.
   *
   * This is Yellow Network's way of "auto-discovery" - you can find all
   * sessions you're part of without needing the session IDs.
   */
  async discoverSessions(userId: string, chain?: string) {
    this.logger.log(`[DISCOVER] User ${userId} discovering sessions`);

    try {
      const chainName = chain || 'base';

      // Get user's wallet addresses (might have multiple chains)
      const addressesObj = await this.walletService.getAddresses(userId);
      const allAddresses = Object.values(addressesObj)
        .filter(Boolean)
        .map((addr) => addr!.toLowerCase());

      if (allAddresses.length === 0) {
        return {
          ok: true,
          sessions: [],
          discovered: 0,
          message: 'No wallet addresses found for user',
        };
      }

      this.logger.log(
        `[DISCOVER] User has ${allAddresses.length} wallet addresses`,
      );

      // Get user's primary wallet address for this chain
      const {
        address: primaryAddress,
        isEOA,
        chainKey,
      } = await this.getUserWalletAddress(userId, chainName);

      // Query Yellow Network for all open app sessions
      this.logger.log(`[DISCOVER] Querying Yellow Network for all sessions...`);
      const cacheKey = `${userId}-${chainName}-${primaryAddress}`;
      const allRemoteSessions = await this.executeWithRetry(
        async (client) => {
          return await client.getLightningNodes('open');
        },
        userId,
        chainName,
        primaryAddress,
        isEOA,
        chainKey,
        cacheKey,
      );

      this.logger.log(
        `[DISCOVER] Found ${allRemoteSessions.length} total sessions on Yellow Network`,
      );

      // Filter to sessions where user is a participant
      const userSessions = allRemoteSessions.filter((session: AppSession) => {
        const participants = (session.definition?.participants || []).map(
          (p: string) => p.toLowerCase(),
        );
        return participants.some((p) => allAddresses.includes(p));
      });

      this.logger.log(
        `[DISCOVER] User is participant in ${userSessions.length} sessions`,
      );

      // Sync all discovered sessions to local DB
      for (const remoteSession of userSessions) {
        await this.syncRemoteSessionToLocalDB(remoteSession, userId, chainName);
      }

      // Get local sessions with full metadata
      const appSessionIds = userSessions.map((s) => s.app_session_id);
      const localSessions = await this.prisma.lightningNode.findMany({
        where: { appSessionId: { in: appSessionIds } },
        include: { participants: true, transactions: true },
        orderBy: { createdAt: 'desc' },
      });

      // Separate into "active" (already accessed) and "new invitations" (not accessed yet)
      const activeSessions = localSessions.filter((s) => {
        const userParticipant = (s.participants as any[]).find((p) =>
          allAddresses.includes(p.address.toLowerCase()),
        );
        return userParticipant?.status === 'joined';
      });

      const invitations = localSessions.filter((s) => {
        const userParticipant = (s.participants as any[]).find((p) =>
          allAddresses.includes(p.address.toLowerCase()),
        );
        return userParticipant?.status === 'invited';
      });

      this.logger.log(`[DISCOVER] ✅ Discovery complete`);
      this.logger.log(
        `[DISCOVER]   - Active sessions: ${activeSessions.length}`,
      );
      this.logger.log(`[DISCOVER]   - New invitations: ${invitations.length}`);

      return {
        ok: true,
        sessions: localSessions.map((s) => this.formatLightningNode(s)),
        activeSessions: activeSessions.map((s) => this.formatLightningNode(s)),
        invitations: invitations.map((s) => this.formatLightningNode(s)),
        discovered: userSessions.length,
        message: `Found ${userSessions.length} session(s)`,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[DISCOVER] Failed to discover sessions: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `Failed to discover sessions: ${err.message}`,
      );
    }
  }

  /**
   * Parse session ID from various input formats
   */
  private parseSessionIdFromInput(input: string): string {
    const trimmed = input.trim();

    // If already a valid 0x-prefixed hex, return as-is
    if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      return trimmed;
    }

    // If already has lightning:// prefix, parse as-is
    if (trimmed.startsWith('lightning://')) {
      return this.parseUriToAppSessionId(trimmed);
    }

    // Otherwise, add lightning:// prefix and parse
    return this.parseUriToAppSessionId(`lightning://${trimmed}`);
  }

  /**
   * Sync remote session from Yellow Network to local DB
   */
  private async syncRemoteSessionToLocalDB(
    remoteSession: AppSession,
    discoveredByUserId: string,
    chain: string,
  ): Promise<void> {
    const appSessionId = remoteSession.app_session_id;

    // Check if session already exists
    const existing = await this.prisma.lightningNode.findUnique({
      where: { appSessionId },
      include: { participants: true },
    });

    if (existing) {
      // Update existing session
      await this.updateLocalSessionFromRemote(existing.id, remoteSession);
      return;
    }

    // Create new session record
    const participants = remoteSession.definition?.participants || [];
    const weights = remoteSession.definition?.weights || [];
    const allocations = remoteSession.allocations || [];

    const dbParticipants = participants.map(
      (address: string, index: number) => {
        const allocation = (allocations as any[]).find(
          (a: any) => a.participant.toLowerCase() === address.toLowerCase(),
        );

        return {
          address,
          weight: weights[index] || 100 / participants.length,
          balance: allocation?.amount || '0',
          asset: allocation?.asset || 'usdc',
          status: 'invited', // Will be updated to 'joined' when user accesses
        };
      },
    );

    await this.prisma.lightningNode.create({
      data: {
        userId: discoveredByUserId,
        appSessionId,
        uri: `lightning://${appSessionId}`,
        chain,
        token: (allocations as any[])[0]?.asset || 'usdc',
        status: remoteSession.status,
        maxParticipants: 50,
        quorum: remoteSession.definition?.quorum || 50,
        protocol: remoteSession.definition?.protocol || 'NitroRPC/0.4',
        challenge: remoteSession.definition?.challenge || 3600,
        sessionData: remoteSession.session_data,
        participants: {
          create: dbParticipants,
        },
      },
    });

    this.logger.log(`[SYNC] Synced session ${appSessionId} to local DB`);
  }

  /**
   * Update local session from remote session data
   */
  private async updateLocalSessionFromRemote(
    localSessionId: string,
    remoteSession: AppSession,
  ): Promise<void> {
    // Update session status and data
    await this.prisma.lightningNode.update({
      where: { id: localSessionId },
      data: {
        status: remoteSession.status,
        sessionData: remoteSession.session_data,
      },
    });

    // Update participant balances
    const allocations = remoteSession.allocations || [];
    for (const allocation of allocations as any[]) {
      await this.prisma.lightningNodeParticipant.updateMany({
        where: {
          lightningNodeId: localSessionId,
          address: allocation.participant,
        },
        data: {
          balance: allocation.amount,
        } as any,
      });
    }
  }

  /**
   * "Join" an existing Lightning Node
   *
   * IMPORTANT: In Yellow Network, there is NO "join" concept. All participants are
   * pre-authorized when the app session is created. "Join" here is purely a LOCAL
   * concept to track when an invited participant first accesses the session.
   *
   * What this actually does:
   * 1. Verifies the user's wallet address is in the participants list (pre-authorized)
   * 2. Creates an authenticated NitroliteClient for the user's wallet
   * 3. Verifies they can query the session on Yellow Network
   * 4. Updates local DB status from 'invited' to 'joined'
   *
   * Each participant MUST authenticate with their OWN wallet to interact with the
   * session. They cannot use the creator's authentication.
   */
  async join(dto: JoinLightningNodeDto) {
    this.logger.log(
      `User ${dto.userId} accessing Lightning Node via URI: ${dto.uri}`,
    );

    try {
      // Parse URI to extract appSessionId
      const appSessionId = this.parseUriToAppSessionId(dto.uri);

      // Find Lightning Node
      const lightningNode = await this.prisma.lightningNode.findUnique({
        where: { appSessionId },
        include: { participants: true },
      });

      if (!lightningNode) {
        throw new NotFoundException(
          `Lightning Node not found: ${appSessionId}`,
        );
      }

      if (lightningNode.status !== 'open') {
        throw new BadRequestException(
          `Lightning Node is ${lightningNode.status}, cannot access`,
        );
      }

      // Get user's wallet address for the chain
      const {
        address: userWalletAddress,
        isEOA,
        chainKey,
      } = await this.getUserWalletAddress(dto.userId, lightningNode.chain);

      this.logger.log(
        `[LN/join] appSessionId=${appSessionId} chain=${lightningNode.chain} userAddress=${userWalletAddress} (${isEOA ? 'EOA' : 'ERC-4337'}:${chainKey})`,
      );
      this.logger.log(
        `[LN/join] participants=${(lightningNode.participants || [])
          .map((p: any) => `${p.address}:${p.status ?? 'unknown'}`)
          .join(', ')}`,
      );

      // Check if user is a pre-authorized participant
      const participantRow: any = lightningNode.participants.find(
        (p) => p.address.toLowerCase() === userWalletAddress.toLowerCase(),
      );

      if (!participantRow) {
        throw new BadRequestException(
          `You are not a participant in this Lightning Node. ` +
            `Your wallet address (${userWalletAddress}) was not included when the session was created. ` +
            `In Yellow Network, participants must be specified at creation time and cannot be added later.`,
        );
      }

      if (participantRow.status === 'joined') {
        // Already accessed - just update presence and return
        await this.prisma.lightningNodeParticipant.update({
          where: { id: participantRow.id },
          data: { lastSeenAt: new Date() } as any,
        });

        const refreshed = await this.prisma.lightningNode.findUnique({
          where: { id: lightningNode.id },
          include: { participants: true },
        });

        this.logger.log(`[LN/join] User already joined, updated presence`);

        return {
          ok: true,
          message: 'Already joined',
          node: refreshed ? this.formatLightningNode(refreshed) : null,
        };
      }

      // Create authenticated NitroliteClient for THIS user's wallet
      // This is critical: each participant needs their own authenticated client
      this.logger.log(
        `[LN/join] Creating authenticated NitroliteClient for user ${dto.userId}...`,
      );
      const nitroliteClient = await this.getUserNitroliteClient(
        dto.userId,
        lightningNode.chain,
        userWalletAddress,
        isEOA,
        chainKey,
      );

      // Verify the user can access the session on Yellow Network
      // This query is authenticated with the user's wallet, so they should see the session
      this.logger.log(
        `[LN/join] Verifying access to app session on Yellow Network...`,
      );
      try {
        const remoteSession = await nitroliteClient.getLightningNode(
          appSessionId as `0x${string}`,
        );

        this.logger.log(
          `[LN/join] ✅ Successfully queried session from Yellow Network`,
        );
        this.logger.log(`[LN/join]   - Status: ${remoteSession.status}`);
        this.logger.log(`[LN/join]   - Version: ${remoteSession.version}`);
        this.logger.log(
          `[LN/join]   - Participants in definition: ${remoteSession.definition?.participants?.length || 0}`,
        );

        // Note: The definition.participants might be filtered based on the authenticated wallet
        // This is normal Yellow Network behavior - queries are wallet-scoped
        const remoteParticipants = (
          remoteSession.definition?.participants || []
        ).map((a: string) => a.toLowerCase());

        if (remoteParticipants.length > 0) {
          const isIncluded = remoteParticipants.includes(
            userWalletAddress.toLowerCase(),
          );
          if (!isIncluded) {
            this.logger.warn(
              `[LN/join] Yellow Network query result doesn't include user's address. ` +
                `This may be due to wallet-scoped query visibility. ` +
                `userAddress=${userWalletAddress} remoteParticipants=${remoteParticipants.join(',')}`,
            );
          } else {
            this.logger.log(
              `[LN/join] ✅ User address confirmed in Yellow Network participants list`,
            );
          }
        }
      } catch (e) {
        const err = e as Error;
        this.logger.error(
          `[LN/join] ❌ Failed to query Yellow Network: ${err.message}`,
        );
        throw new BadRequestException(
          `Cannot access Lightning Node on Yellow Network. ` +
            `This may indicate: (1) session doesn't exist, (2) authentication failed, or (3) you're not a participant. ` +
            `Error: ${err.message}`,
        );
      }

      // Update local status to 'joined'
      // This is purely for local tracking - the user was already authorized on Yellow Network
      await this.prisma.lightningNodeParticipant.update({
        where: { id: participantRow.id },
        data: {
          status: 'joined',
          joinedAt: new Date(),
          lastSeenAt: new Date(),
        } as any,
      });

      this.logger.log(
        `✅ User successfully accessed Lightning Node: ${lightningNode.id}`,
      );

      const refreshed = await this.prisma.lightningNode.findUnique({
        where: { id: lightningNode.id },
        include: { participants: true },
      });

      return {
        ok: true,
        node: refreshed ? this.formatLightningNode(refreshed) : null,
        message: 'Successfully authenticated and accessed Lightning Node',
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to access Lightning Node: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Get all Lightning Nodes created by a user
   */
  async findByUserId(userId: string) {
    const nodes = await this.prisma.lightningNode.findMany({
      where: { userId },
      include: { participants: true, transactions: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ok: true,
      nodes: nodes.map((n) => this.formatLightningNode(n)),
    };
  }

  /**
   * Get a Lightning Node by DB id
   */
  async findById(id: string) {
    const node = await this.prisma.lightningNode.findUnique({
      where: { id },
      include: { participants: true, transactions: true },
    });

    if (!node) throw new NotFoundException(`Lightning Node not found: ${id}`);

    return {
      ok: true,
      node: this.formatLightningNode(node),
    };
  }

  /**
   * Lists Lightning Nodes where the user's wallet addresses are included as a participant.
   * This allows invite discovery without having to manually receive the URI.
   */
  async findInvitedByUserId(userId: string) {
    const addressesObj = await this.walletService.getAddresses(userId);
    const addresses = Object.values(addressesObj)
      .filter(Boolean)
      .map((a) => a!.toLowerCase());

    if (addresses.length === 0) {
      return { ok: true, nodes: [] };
    }

    const nodes = await this.prisma.lightningNode.findMany({
      where: {
        participants: {
          some: { address: { in: addresses, mode: 'insensitive' } },
        },
      },
      include: { participants: true, transactions: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ok: true,
      nodes: nodes.map((n) => this.formatLightningNode(n)),
    };
  }

  /**
   * Best-effort presence heartbeat.
   * Updates lastSeenAt for any participant row matching one of the user's wallet addresses.
   */
  async heartbeatPresence(dto: { userId: string; appSessionId: string }) {
    const node = await this.prisma.lightningNode.findUnique({
      where: { appSessionId: dto.appSessionId },
      include: { participants: true },
    });

    if (!node)
      throw new NotFoundException(
        `Lightning Node not found: ${dto.appSessionId}`,
      );

    const addressesObj = await this.walletService.getAddresses(dto.userId);
    const addressSet = new Set(
      Object.values(addressesObj)
        .filter(Boolean)
        .map((a) => a!.toLowerCase()),
    );

    const matched = (node.participants as any[]).filter((p) =>
      addressSet.has(p.address.toLowerCase()),
    );

    if (matched.length === 0) {
      throw new BadRequestException(
        'You are not a participant in this Lightning Node.',
      );
    }

    await this.prisma.lightningNodeParticipant.updateMany({
      where: { id: { in: matched.map((p) => p.id) } },
      data: { lastSeenAt: new Date() } as any,
    });

    return { ok: true };
  }

  /**
   * Deposit funds into a Lightning Node (gasless) via Yellow.
   * Persists the returned allocations to local DB (best-effort).
   */
  async deposit(dto: DepositFundsDto) {
    const node = await this.prisma.lightningNode.findUnique({
      where: { appSessionId: dto.appSessionId },
      include: { participants: true },
    });
    if (!node)
      throw new NotFoundException(
        `Lightning Node not found: ${dto.appSessionId}`,
      );

    const {
      address: userWalletAddress,
      isEOA,
      chainKey,
    } = await this.getUserWalletAddress(dto.userId, node.chain);

    const cacheKey = `${dto.userId}-${node.chain}-${userWalletAddress}`;

    await this.executeWithRetry(
      async (client) => {
        const remoteSession = await client.getLightningNode(
          node.appSessionId as `0x${string}`,
        );
        const currentAllocations: AppSessionAllocation[] =
          (remoteSession.allocations || []) as any;

        await client.depositToLightningNode(
          node.appSessionId as `0x${string}`,
          dto.participantAddress as Address,
          dto.asset,
          dto.amount,
          currentAllocations,
        );

        // Refresh remote state and persist balances best-effort
        const updated = await client.getLightningNode(
          node.appSessionId as `0x${string}`,
        );
        const updatedAllocations: AppSessionAllocation[] = (updated.allocations ||
          []) as any;

        for (const alloc of updatedAllocations) {
          await this.prisma.lightningNodeParticipant.updateMany({
            where: {
              lightningNodeId: node.id,
              address: (alloc as any).participant,
              asset: dto.asset,
            },
            data: { balance: (alloc as any).amount } as any,
          });
        }

        return { ok: true };
      },
      dto.userId,
      node.chain,
      userWalletAddress,
      isEOA,
      chainKey,
      cacheKey,
    );

    return { ok: true };
  }

  /**
   * Transfer funds within a Lightning Node (gasless) via Yellow.
   * Persists the returned allocations to local DB (best-effort).
   */
  async transfer(dto: TransferFundsDto) {
    const node = await this.prisma.lightningNode.findUnique({
      where: { appSessionId: dto.appSessionId },
      include: { participants: true },
    });
    if (!node)
      throw new NotFoundException(
        `Lightning Node not found: ${dto.appSessionId}`,
      );

    const {
      address: userWalletAddress,
      isEOA,
      chainKey,
    } = await this.getUserWalletAddress(dto.userId, node.chain);

    const cacheKey = `${dto.userId}-${node.chain}-${userWalletAddress}`;

    await this.executeWithRetry(
      async (client) => {
        const remoteSession = await client.getLightningNode(
          node.appSessionId as `0x${string}`,
        );
        const currentAllocations: AppSessionAllocation[] =
          (remoteSession.allocations || []) as any;

        await client.transferInLightningNode(
          node.appSessionId as `0x${string}`,
          dto.fromAddress as Address,
          dto.toAddress as Address,
          dto.asset,
          dto.amount,
          currentAllocations,
        );

        const updated = await client.getLightningNode(
          node.appSessionId as `0x${string}`,
        );
        const updatedAllocations: AppSessionAllocation[] = (updated.allocations ||
          []) as any;

        for (const alloc of updatedAllocations) {
          await this.prisma.lightningNodeParticipant.updateMany({
            where: {
              lightningNodeId: node.id,
              address: (alloc as any).participant,
              asset: dto.asset,
            },
            data: { balance: (alloc as any).amount } as any,
          });
        }

        return { ok: true };
      },
      dto.userId,
      node.chain,
      userWalletAddress,
      isEOA,
      chainKey,
      cacheKey,
    );

    return { ok: true };
  }

  /**
   * Close an existing Lightning Node (App Session)
   */
  async close(dto: CloseLightningNodeDto) {
    this.logger.log(`Closing Lightning Node for user ${dto.userId}`);

    try {
      // Find Lightning Node
      const lightningNode = await this.prisma.lightningNode.findUnique({
        where: { appSessionId: dto.appSessionId },
        include: { participants: true },
      });

      if (!lightningNode) {
        throw new NotFoundException(
          `Lightning Node not found: ${dto.appSessionId}`,
        );
      }

      // Only allow closing if the node is in a cancellable state
      const cancellableStates = ['open', 'pending_close'];
      if (!cancellableStates.includes(lightningNode.status)) {
        throw new BadRequestException(
          `Cannot close Lightning Node in ${lightningNode.status} state`,
        );
      }

      // Get user's wallet address for the chain
      const {
        address: userWalletAddress,
        isEOA,
        chainKey,
      } = await this.getUserWalletAddress(dto.userId, lightningNode.chain);

      // Must be the owner (creator) to close
      const owner = (lightningNode.participants as any[]).find(
        (p) =>
          p.status === 'joined' &&
          p.address.toLowerCase() === userWalletAddress.toLowerCase(),
      );
      if (!owner) {
        throw new BadRequestException(
          'Only the owner can close this Lightning Node',
        );
      }

      // Close the app session via Yellow Network
      this.logger.log(
        `Closing app session on Yellow Network: ${lightningNode.appSessionId}`,
      );
      // Use current known allocations as final allocations (simple close).
      // If we need custom distribution later, we can add it to the DTO.
      const finalAllocations: AppSessionAllocation[] = (
        lightningNode.participants as any[]
      ).map((p) => ({
        participant: p.address,
        asset: p.asset,
        amount: p.balance,
      }));

      const cacheKey = `${dto.userId}-${lightningNode.chain}-${userWalletAddress}`;
      await this.executeWithRetry(
        async (client) => {
          await client.closeLightningNode(
            lightningNode.appSessionId as `0x${string}`,
            finalAllocations,
          );
        },
        dto.userId,
        lightningNode.chain,
        userWalletAddress,
        isEOA,
        chainKey,
        cacheKey,
      );

      // Update local status to closed
      await this.prisma.lightningNode.update({
        where: { id: lightningNode.id },
        data: { status: 'closed' },
      });

      this.logger.log(`✅ Lightning Node closed: ${lightningNode.id}`);

      return {
        ok: true,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to close Lightning Node: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Generate a URI for joining a Lightning Node
   */
  private generateLightningNodeUri(appSessionId: string): string {
    // Shareable, human-friendly URI.
    // appSessionId is already a 0x-prefixed bytes32 hex string from Yellow.
    return `lightning://${appSessionId}`;
  }

  /**
   * Parse a Lightning Node URI to extract the app session ID
   */
  private parseUriToAppSessionId(uri: string): string {
    const raw = (uri || '').trim();

    // Preferred format: lightning://0x<64-hex>
    const mPreferred = raw.match(/^lightning:\/\/(0x[a-fA-F0-9]{64})$/);
    if (mPreferred && mPreferred[1]) return mPreferred[1];

    // Backward-compatible legacy format: lightning:<base64url>
    // Historical versions base64url-encoded the hex bytes.
    const mLegacy = raw.match(/^lightning:([A-Za-z0-9_-]+)$/);
    if (mLegacy && mLegacy[1]) {
      try {
        const decodedHex = Buffer.from(mLegacy[1], 'base64url').toString('hex');
        const appSessionId = `0x${decodedHex}`;
        if (/^0x[a-fA-F0-9]{64}$/.test(appSessionId)) return appSessionId;
      } catch {
        // fall through
      }
    }

    throw new BadRequestException(
      'Invalid Lightning Node URI format. Expected lightning://0x<bytes32>.',
    );
  }

  /**
   * Format Lightning Node for client response
   */
  private formatLightningNode(node: any) {
    return {
      id: node.id,
      userId: node.userId,
      appSessionId: node.appSessionId,
      uri: node.uri,
      chain: node.chain,
      token: node.token,
      status: node.status,
      maxParticipants: node.maxParticipants,
      quorum: node.quorum,
      protocol: node.protocol,
      challenge: node.challenge,
      sessionData: node.sessionData,
      participants: node.participants.map((p: any) => ({
        address: p.address,
        weight: p.weight,
        balance: p.balance,
        asset: p.asset,
        status: p.status,
        joinedAt: p.joinedAt,
        lastSeenAt: p.lastSeenAt,
      })),
      transactions: node.transactions,
    };
  }
}
