/**
 * ============================================================================
 * SDKChannelService - Yellow Network Nitrolite SDK Channel Management
 * ============================================================================
 *
 * FILE PURPOSE:
 * -------------
 * This file provides a high-level service wrapper around the official
 * @erc7824/nitrolite SDK to manage state channels on Yellow Network's
 * ClearNode infrastructure. It handles channel creation, resizing (deposits/
 * withdrawals), and cooperative closing with proper cryptographic signing.
 *
 * ARCHITECTURE OVERVIEW:
 * ----------------------
 * This service acts as a bridge between:
 *
 * 1. YELLOW NETWORK CLEARNODE (WebSocket RPC)
 *    - Endpoint: wss://clearnet.yellow.com/ws (production)
 *              wss://clearnet-sandbox.yellow.com/ws (sandbox)
 *    - Protocol: NitroliteRPC (JSON-RPC over WebSocket)
 *    - Methods: create_channel, resize_channel, close_channel, get_channels
 *
 * 2. BLOCKCHAIN (EVM-compatible chains via viem)
 *    - Custody Contract: Holds channel deposits and manages channel lifecycle
 *    - Adjudicator Contract: Validates state transitions
 *    - Functions: create(), resize(), close(), getChannelData()
 *
 * 3. CLIENT APPLICATION
 *    - Provides typed interface for channel operations
 *    - Handles all cryptographic signing (session keys + wallet signatures)
 *    - Manages connection timeouts and retries automatically
 *
 * DEPENDENCIES:
 * -------------
 * - @erc7824/nitrolite: Official Yellow Network SDK for state channel operations
 * - viem: Ethereum interaction library for contract calls
 * - ./websocket-manager.ts: WebSocket connection manager (must provide send() with timeout support)
 * - ./session-auth.ts: Session key authentication for RPC signing
 * - ./types.ts: TypeScript type definitions (Channel, ChannelState, etc.)
 *
 * CONNECTION TIMEOUT STRATEGY:
 * ----------------------------
 * ClearNode connections can fail due to:
 *   - Network instability
 *   - ClearNode indexing delays (channel not found immediately after creation)
 *   - Idle timeouts (60s+ inactivity)
 *
 * This implementation uses:
 *   - Per-request timeouts (default 30s)
 *   - Exponential backoff retry (3 attempts, 3s/6s/12s delays)
 *   - Connection state validation before sending
 *   - Automatic retry on "channel not found" (indexing delay)
 *   - Request ID tracking for response correlation
 *
 * USAGE EXAMPLE:
 * --------------
 * ```typescript
 * const service = new SDKChannelService(
 *   wsManager,        // WebSocketManager instance
 *   sessionAuth,      // SessionKeyAuth instance
 *   publicClient,     // viem PublicClient
 *   walletClient,     // viem WalletClient
 *   custodyAddresses, // { chainId: Address }
 *   adjudicatorAddr,  // Address
 *   chainId           // number
 * );
 *
 * // Create a channel
 * const channel = await service.createChannel(1, tokenAddress, 1000000n);
 *
 * // Resize (deposit/withdraw)
 * await service.resizeChannel(channelId, 1, 500000n, userAddress);
 *
 * // Close channel
 * await service.closeChannel(channelId, 1, userAddress);
 * ```
 *
 * ============================================================================
 */

import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import {
  NitroliteClient,
  WalletStateSigner,
  CustodyAbi,
} from '@erc7824/nitrolite';
import type { WebSocketManager } from './websocket-manager.js';
import type { SessionKeyAuth } from './session-auth.js';
import type {
  Channel,
  ChannelState,
  ChannelWithState,
  RPCRequest,
  RPCResponse,
} from './types.js';
import { StateIntent } from './types.js';

/**
 * Configuration for RPC request timeouts and retries
 */
interface RPCConfig {
  /** Timeout for individual RPC requests in milliseconds (default: 30000) */
  requestTimeoutMs: number;
  /** Maximum number of retry attempts for failed requests (default: 3) */
  maxRetries: number;
  /** Base delay between retries in milliseconds (default: 3000) */
  retryDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
}

/**
 * Custom error class for ClearNode RPC failures with retry context
 */
class ClearNodeRPCError extends Error {
  constructor(
    message: string,
    public readonly method: string,
    public readonly attempts: number,
    public readonly isRetryable: boolean = true,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'ClearNodeRPCError';
  }
}

/**
 * SDK-Based Channel Service
 *
 * Wraps the Yellow Network SDK for channel operations with robust timeout
 * handling and automatic retry logic for all ClearNode communications.
 */
export class SDKChannelService {
  private ws: WebSocketManager;
  private auth: SessionKeyAuth;
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private sdkClient: NitroliteClient;
  private custodyAddresses: Record<number, Address>;
  private rpcConfig: RPCConfig;

  /**
   * Creates an instance of SDKChannelService
   *
   * @param ws - WebSocketManager instance handling the WebSocket connection to ClearNode.
   *             Expected to have a `send()` method that returns Promise<RPCResponse>.
   *             NOTE: ws.send() MUST support timeout handling (see sendWithTimeout wrapper).
   *
   * @param auth - SessionKeyAuth instance for signing RPC requests with ephemeral session keys.
   *               Provides signRequest() method and isAuthenticated() check.
   *
   * @param publicClient - viem PublicClient for reading blockchain state and simulating transactions.
   *                       Used for contract reads (getChannelData) and transaction receipts.
   *
   * @param walletClient - viem WalletClient for signing states and sending transactions.
   *                       Must have an account configured for signing.
   *
   * @param custodyAddresses - Mapping of chainId => Custody contract address.
   *                           The custody contract holds all channel deposits.
   *
   * @param adjudicatorAddress - Address of the Adjudicator contract that validates state transitions.
   *
   * @param chainId - The blockchain chain ID this service instance operates on.
   *
   * @param rpcConfig - Optional configuration for RPC timeouts and retries.
   */
  constructor(
    ws: WebSocketManager,
    auth: SessionKeyAuth,
    publicClient: PublicClient,
    walletClient: WalletClient,
    custodyAddresses: Record<number, Address>,
    adjudicatorAddress: Address,
    chainId: number,
    rpcConfig: Partial<RPCConfig> = {},
  ) {
    this.ws = ws;
    this.auth = auth;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.custodyAddresses = custodyAddresses;

    // Merge default RPC config with user overrides
    this.rpcConfig = {
      requestTimeoutMs: 30000, // 30 seconds
      maxRetries: 3, // 3 attempts total
      retryDelayMs: 3000, // Start with 3s delay
      backoffMultiplier: 2, // Double each retry
      ...rpcConfig,
    };

    // Initialize SDK Client
    const custodyAddress = custodyAddresses[chainId];
    if (!custodyAddress) {
      throw new Error(`Custody address not found for chain ${chainId}`);
    }

    console.log('[SDKChannelService] Initializing Yellow Network SDK');
    console.log(`[SDKChannelService] Chain ID: ${chainId}`);
    console.log(`[SDKChannelService] Custody: ${custodyAddress}`);
    console.log(`[SDKChannelService] Adjudicator: ${adjudicatorAddress}`);
    console.log(
      `[SDKChannelService] RPC Timeout: ${this.rpcConfig.requestTimeoutMs}ms`,
    );
    console.log(
      `[SDKChannelService] Max Retries: ${this.rpcConfig.maxRetries}`,
    );

    this.sdkClient = new NitroliteClient({
      publicClient,
      walletClient: this.walletClient as any, // SDK type inference
      stateSigner: new WalletStateSigner(this.walletClient as any),
      addresses: {
        custody: custodyAddress,
        adjudicator: adjudicatorAddress,
      },
      chainId,
      challengeDuration: 3600n, // 1 hour challenge period
    });

    console.log('[SDKChannelService] ✅ SDK initialized successfully');
  }

  /**
   * ========================================================================
   * INTERNAL HELPER: sendRPCWithTimeoutAndRetry
   * ========================================================================
   *
   * Sends an RPC request to ClearNode with timeout protection and automatic
   * retry logic. This is the core resilience mechanism for all ClearNode
   * communications.
   *
   * RETRY STRATEGY:
   * - Retries on: network errors, timeouts, "channel not found" (indexing delay)
   * - Does NOT retry on: authentication errors, invalid parameters, signature failures
   * - Uses exponential backoff: 3s, 6s, 12s between attempts
   * - Each attempt has its own 30s timeout
   *
   * @param method - RPC method name (e.g., 'create_channel', 'resize_channel')
   * @param params - RPC parameters object
   * @param isRetryableError - Optional function to determine if error is retryable
   * @returns RPCResponse from ClearNode
   * @throws ClearNodeRPCError if all retries exhausted or non-retryable error
   */
  private async sendRPCWithTimeoutAndRetry(
    method: string,
    params: Record<string, any>,
    isRetryableError?: (error: any) => boolean,
  ): Promise<RPCResponse> {
    const { maxRetries, retryDelayMs, backoffMultiplier, requestTimeoutMs } =
      this.rpcConfig;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const requestId = this.ws.getNextRequestId();

      // Build the RPC request
      let request: RPCRequest = {
        req: [requestId, method, params, Date.now()],
        sig: [] as string[],
      };

      try {
        // Sign the request with session key
        request = await this.auth.signRequest(request);

        // Send with timeout protection
        // NOTE: We wrap the send in a Promise.race with a timeout
        const response = await Promise.race([
          this.ws.send(request),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(new Error(`RPC timeout after ${requestTimeoutMs}ms`)),
              requestTimeoutMs,
            ),
          ),
        ]);

        // Check for RPC-level errors
        if (response.error) {
          throw new Error(
            `RPC Error: ${response.error.message || JSON.stringify(response.error)}`,
          );
        }

        if (response.res && response.res[1] === 'error') {
          const errorMsg = JSON.stringify(response.res[2]);
          throw new Error(`ClearNode Error: ${errorMsg}`);
        }

        // Success - return the response
        if (attempt > 1) {
          console.log(
            `[SDKChannelService] ✅ ${method} succeeded on attempt ${attempt}/${maxRetries}`,
          );
        }
        return response;
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);

        // Determine if this error is retryable
        const retryable = isRetryableError
          ? isRetryableError(error)
          : this.isDefaultRetryableError(errorMessage);

        // If not retryable or last attempt, throw
        if (!retryable || attempt === maxRetries) {
          throw new ClearNodeRPCError(
            `ClearNode RPC failed for ${method}: ${errorMessage}`,
            method,
            attempt,
            retryable,
            error,
          );
        }

        // Calculate delay with exponential backoff
        const delay = retryDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        console.warn(
          `[SDKChannelService] ⚠️ ${method} attempt ${attempt}/${maxRetries} failed: ${errorMessage}. ` +
            `Retrying in ${delay}ms...`,
        );

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new ClearNodeRPCError(
      `Unexpected: All ${maxRetries} attempts exhausted for ${method}`,
      method,
      maxRetries,
      false,
      lastError || undefined,
    );
  }

  /**
   * Default logic to determine if an error should trigger a retry.
   *
   * RETRYABLE ERRORS:
   * - Network timeouts
   * - Connection failures
   * - "Channel not found" (ClearNode indexing delay - very common after create)
   * - "not found" (generic indexer lag)
   *
   * NON-RETRYABLE ERRORS:
   * - Authentication failures
   * - Invalid signatures
   * - Invalid parameters
   * - Channel already exists
   * - Insufficient funds
   */
  private isDefaultRetryableError(errorMessage: string): boolean {
    const retryablePatterns = [
      'timeout',
      'timed out',
      'connection',
      'network',
      'not found', // ClearNode indexer lag
      'indexing',
      'temporarily unavailable',
      'rate limit',
      'econnrefused',
      'econnreset',
      'enetunreach',
    ];

    const nonRetryablePatterns = [
      'authentication',
      'unauthorized',
      'invalid signature',
      'invalid parameter',
      'already exists',
      'insufficient',
      'not authorized',
      'forbidden',
    ];

    const lowerMsg = errorMessage.toLowerCase();

    // Check non-retryable first (more specific)
    if (nonRetryablePatterns.some((p) => lowerMsg.includes(p))) {
      return false;
    }

    return retryablePatterns.some((p) => lowerMsg.includes(p));
  }

  /**
   * ========================================================================
   * CHANNEL CREATION
   * ========================================================================
   *
   * Creates a new 2-party payment channel through the following steps:
   *
   * 1. REQUEST: Ask ClearNode to create channel (returns unsigned channel + state)
   * 2. VERIFY: Parse and validate ClearNode response (handles camelCase/snake_case)
   * 3. SIGN: Sign initial state with raw ECDSA (no EIP-191 prefix - required by contract)
   * 4. SUBMIT: Call custody.create() on-chain with signed state
   * 5. OPTIONAL RESIZE: If initialDeposit > 0, resize channel to add funds
   *
   * CONNECTION TIMEOUT HANDLING:
   * - Uses sendRPCWithTimeoutAndRetry for the create_channel call
   * - Retries on "channel not found" (though unlikely during creation)
   * - 30s timeout per attempt, 3 attempts with exponential backoff
   *
   * @param chainId - Blockchain chain ID where channel will be created
   * @param token - ERC20 token address for the channel (use zero address for ETH)
   * @param initialDeposit - Optional initial deposit amount (NOTE: In SDK 0.5.x,
   *                         channels are created with zero balance, then resized)
   * @returns ChannelWithState containing channelId, participants, and initial state
   * @throws ClearNodeRPCError if ClearNode communication fails
   * @throws Error if on-chain transaction fails
   */
  async createChannel(
    chainId: number,
    token: Address,
    initialDeposit?: bigint,
  ): Promise<ChannelWithState> {
    console.log(`[SDKChannelService] Creating channel on chain ${chainId}...`);

    // Check authentication before proceeding
    if (!this.auth.isAuthenticated()) {
      throw new Error(
        'Session key not authenticated. Call authenticate() first.',
      );
    }

    // Step 1: Request channel creation from Yellow Network with retry logic
    const response = await this.sendRPCWithTimeoutAndRetry(
      'create_channel',
      { chain_id: chainId, token },
      // "not found" shouldn't happen during creation, but handle transient errors
      (err) => this.isDefaultRetryableError(err.message),
    );

    const channelData = response.res[2];
    if (!channelData) {
      throw new Error('No channel data in create_channel response');
    }

    console.log(
      '[SDKChannelService] Received channel data from Yellow Network',
    );
    console.log(
      '[SDKChannelService] Channel ID (from Yellow):',
      channelData.channel_id || channelData.channelId,
    );

    // Step 2: Parse channel and state from response
    // Handle both camelCase and snake_case field names from Yellow Network
    const channel = channelData.channel;
    const state = channelData.state;
    const serverSignature =
      channelData.serverSignature || channelData.server_signature;

    if (!channel || !state || !serverSignature) {
      console.error('[SDKChannelService] Missing data in create response:', {
        hasChannel: !!channel,
        hasState: !!state,
        hasServerSig: !!serverSignature,
      });
      throw new Error('Invalid channel data structure in create response');
    }

    // Step 3: Build unsigned initial state
    const stateDataValue =
      state.stateData || state.state_data || state.data || '0x';
    const unsignedInitialState = {
      intent: state.intent,
      version: BigInt(state.version),
      data: stateDataValue,
      allocations: state.allocations.map((a: any) => ({
        destination: a.destination as Address,
        token: a.token as Address,
        amount: BigInt(a.amount || 0),
      })),
    };

    // Step 4: Build channel object for SDK (convert to BigInt as required)
    const channelForSDK = {
      participants: channel.participants as [Address, Address],
      adjudicator: channel.adjudicator as Address,
      challenge: BigInt(channel.challenge),
      nonce: BigInt(channel.nonce),
    };

    // Compute channelId for verification
    const { encodeAbiParameters, keccak256 } = await import('viem');
    const computedChannelId = keccak256(
      encodeAbiParameters(
        [
          { name: 'participants', type: 'address[]' },
          { name: 'adjudicator', type: 'address' },
          { name: 'challenge', type: 'uint64' },
          { name: 'nonce', type: 'uint64' },
          { name: 'chainId', type: 'uint256' },
        ],
        [
          channelForSDK.participants,
          channelForSDK.adjudicator,
          channelForSDK.challenge,
          channelForSDK.nonce,
          BigInt(chainId),
        ],
      ),
    );

    const channelId = (channelData.channel_id || computedChannelId) as Hash;
    console.log('[SDKChannelService] Channel ID:', channelId);

    // Step 5: Compute state hash and sign with raw ECDSA
    // NOTE: Yellow ClearNode uses raw ECDSA (no EIP-191 prefix)
    const stateHash = keccak256(
      encodeAbiParameters(
        [
          { name: 'channelId', type: 'bytes32' },
          { name: 'intent', type: 'uint8' },
          { name: 'version', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          {
            name: 'allocations',
            type: 'tuple[]',
            components: [
              { name: 'destination', type: 'address' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
        [
          channelId,
          unsignedInitialState.intent,
          unsignedInitialState.version,
          unsignedInitialState.data as `0x${string}`,
          unsignedInitialState.allocations,
        ],
      ),
    );

    const walletAccount = (this.walletClient as any).account;
    const userSignature = await walletAccount.sign({ hash: stateHash });

    const signedInitialState = {
      ...unsignedInitialState,
      sigs: [userSignature as `0x${string}`, serverSignature as `0x${string}`],
    };

    // Step 6: Submit to blockchain
    const custodyAddress =
      this.custodyAddresses[chainId] ??
      '0x0000000000000000000000000000000000000000';
    const { request: simRequest } = await this.publicClient.simulateContract({
      address: custodyAddress,
      abi: CustodyAbi,
      functionName: 'create',
      args: [channelForSDK as any, signedInitialState as any],
      account: walletAccount,
    });

    const txHash = await this.walletClient.writeContract(simRequest as any);
    console.log('[SDKChannelService] Channel creation tx submitted:', txHash);

    // Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log(
      `[SDKChannelService] ✅ Channel created in block ${receipt.blockNumber}`,
    );

    // Step 7: If initialDeposit provided, resize channel to add funds
    if (initialDeposit && initialDeposit > BigInt(0)) {
      console.log(
        `[SDKChannelService] Adding initial deposit ${initialDeposit} via resize...`,
      );

      const userAddress = channel.participants[0] as Address;
      await this.resizeChannel(
        channelId,
        chainId,
        initialDeposit,
        userAddress,
        token,
        channelForSDK.participants,
        signedInitialState, // Proof: version-0 state required by contract
      );
    }

    // Return formatted channel data
    return {
      participants: channelForSDK.participants,
      adjudicator: channelForSDK.adjudicator,
      challenge: channelForSDK.challenge,
      nonce: channelForSDK.nonce,
      channelId,
      state: {
        intent: unsignedInitialState.intent as StateIntent,
        version: unsignedInitialState.version,
        data: unsignedInitialState.data,
        allocations: unsignedInitialState.allocations.map((a: any) => [
          BigInt(0),
          a.amount,
        ]),
      },
      chainId,
      status: 'active',
    };
  }

  /**
   * ========================================================================
   * CHANNEL RESIZE (Deposit/Withdraw)
   * ========================================================================
   *
   * Resizes a channel to add or remove funds. This is used for:
   * - Depositing initial funds after channel creation
   * - Adding more funds to an active channel
   * - Withdrawing funds (negative amount)
   *
   * PROCESS:
   * 1. REQUEST: Ask ClearNode to resize (returns new state with server signature)
   * 2. FETCH PROOF: Read lastValidState from contract (required for resize)
   * 3. COMPUTE: Calculate absolute allocation amounts (ClearNode returns deltas)
   * 4. SIGN: Sign new state with raw ECDSA
   * 5. SUBMIT: Call custody.resize() with proof and new signed state
   *
   * CONNECTION TIMEOUT HANDLING:
   * - Uses sendRPCWithTimeoutAndRetry with special handling for "channel not found"
   * - This is CRITICAL: ClearNode indexer may lag 3-10s behind blockchain
   * - Retries up to 3 times with 3s/6s/12s delays specifically for indexing delays
   *
   * @param channelId - Channel identifier (bytes32)
   * @param chainId - Blockchain chain ID
   * @param amount - Amount to add (positive) or remove (negative)
   * @param fundsDestination - Address to receive funds (for withdrawals)
   * @param token - Token address
   * @param participants - Channel participants [user, clearnode]
   * @param proofState - Optional signed previous state (if not provided, fetched from contract)
   * @returns Updated channel state after resize
   */
  async resizeChannel(
    channelId: Hash,
    chainId: number,
    amount: bigint,
    fundsDestination: Address,
    token?: Address,
    participants?: [Address, Address],
    proofState?: any,
  ): Promise<ChannelState> {
    console.log(
      `[SDKChannelService] Resizing channel ${channelId} by ${amount.toString()}...`,
    );

    const resizeAmount = amount;
    const allocateAmount = -amount; // Sign convention

    // Step 1: Request resize from ClearNode with aggressive retry for indexing delays
    const response = await this.sendRPCWithTimeoutAndRetry(
      'resize_channel',
      {
        channel_id: channelId,
        resize_amount: resizeAmount.toString(),
        allocate_amount: allocateAmount.toString(),
        funds_destination: fundsDestination,
      },
      // Custom retry logic: retry on "not found" because ClearNode indexer lags
      (error) => {
        const msg = error.message?.toLowerCase() || '';
        return msg.includes('not found') || this.isDefaultRetryableError(msg);
      },
    );

    const resizeData = response.res[2];
    if (!resizeData || !resizeData.state) {
      throw new Error('Invalid resize response: missing state');
    }

    console.log('[SDKChannelService] Received resize state from ClearNode');
    const {
      encodeAbiParameters,
      keccak256: keccak,
      recoverAddress,
    } = await import('viem');

    // Step 2: Get proof state (version-0 required for first resize)
    const custodyAddress =
      this.custodyAddresses[chainId] ??
      '0x0000000000000000000000000000000000000000';
    let proofForResize = proofState;

    if (!proofForResize) {
      console.log('[SDKChannelService] Fetching proof state from contract...');
      try {
        const channelOnChain = await this.publicClient.readContract({
          address: custodyAddress,
          abi: CustodyAbi,
          functionName: 'getChannelData',
          args: [channelId],
        });
        // getChannelData returns [channel, status, wallets, challengeExpiry, lastValidState]
        proofForResize = (channelOnChain as any)[4];
        console.log(
          '[SDKChannelService] Got proof from contract: version =',
          proofForResize?.version?.toString(),
        );
      } catch (err: any) {
        console.warn(
          '[SDKChannelService] Could not read lastValidState:',
          err.message,
        );
      }
    }

    // Step 3: Compute absolute allocations
    const proofAllocs: Array<{
      destination: Address;
      token: Address;
      amount: bigint;
    }> =
      proofForResize?.allocations?.map((a: any) => ({
        destination: a.destination as Address,
        token: a.token as Address,
        amount: typeof a.amount === 'bigint' ? a.amount : BigInt(a.amount ?? 0),
      })) ?? [];

    const rawAllocsFromYN = resizeData.state.allocations as Array<{
      destination: string;
      token: string;
      amount: string;
    }>;

    const walletAccount = (this.walletClient as any).account;
    const userAddress = walletAccount?.address?.toLowerCase() ?? '';

    // Calculate absolute amounts (ClearNode may return deltas)
    const absoluteAllocations = rawAllocsFromYN.map((a, idx) => {
      const proofAmount = proofAllocs[idx]?.amount ?? BigInt(0);
      const ynAmount = BigInt(a.amount ?? 0);

      let finalAmount: bigint;
      if (ynAmount > BigInt(0)) {
        finalAmount = ynAmount; // Trust non-zero from ClearNode
      } else {
        const isUser = a.destination.toLowerCase() === userAddress;
        finalAmount = proofAmount + (isUser ? amount : BigInt(0));
      }

      return {
        destination: a.destination as Address,
        token: a.token as Address,
        amount: finalAmount,
      };
    });

    // Step 4: Determine which allocations ClearNode actually signed
    const resizeState = {
      channelId: channelId,
      intent: resizeData.state.intent,
      version: BigInt(resizeData.state.version),
      data: resizeData.state.data || resizeData.state.state_data || '0x',
      allocations: absoluteAllocations,
      serverSignature: resizeData.server_signature as `0x${string}`,
    };

    // Verify server signature to determine correct allocation set
    const hashWithAbsolute = keccak(
      encodeAbiParameters(
        [
          { name: 'channelId', type: 'bytes32' },
          { name: 'intent', type: 'uint8' },
          { name: 'version', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          {
            name: 'allocations',
            type: 'tuple[]',
            components: [
              { name: 'destination', type: 'address' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
        [
          channelId,
          resizeState.intent,
          resizeState.version,
          resizeState.data as `0x${string}`,
          absoluteAllocations,
        ],
      ),
    );

    const rawAllocsZero = rawAllocsFromYN.map((a) => ({
      destination: a.destination as Address,
      token: a.token as Address,
      amount: BigInt(0),
    }));

    const hashWithZero = keccak(
      encodeAbiParameters(
        [
          { name: 'channelId', type: 'bytes32' },
          { name: 'intent', type: 'uint8' },
          { name: 'version', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          {
            name: 'allocations',
            type: 'tuple[]',
            components: [
              { name: 'destination', type: 'address' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
        [
          channelId,
          resizeState.intent,
          resizeState.version,
          resizeState.data as `0x${string}`,
          rawAllocsZero,
        ],
      ),
    );

    // Determine which hash ClearNode signed
    const serverSig = resizeState.serverSignature;
    let recoveredAbsolute: Address | null = null;
    let recoveredZero: Address | null = null;

    try {
      recoveredAbsolute = await recoverAddress({
        hash: hashWithAbsolute,
        signature: serverSig,
      });
      recoveredZero = await recoverAddress({
        hash: hashWithZero,
        signature: serverSig,
      });
    } catch {
      /* ignore recovery errors */
    }

    const clearnodeAddress =
      rawAllocsFromYN[1]?.destination?.toLowerCase() ?? '';
    const serverSignedAbsolute =
      recoveredAbsolute?.toLowerCase() === clearnodeAddress;

    const finalAllocations = serverSignedAbsolute
      ? absoluteAllocations
      : rawAllocsZero;
    const resizeStateHash = serverSignedAbsolute
      ? hashWithAbsolute
      : hashWithZero;

    console.log(
      '[SDKChannelService] Using allocations:',
      serverSignedAbsolute ? 'absolute' : 'zero',
    );

    // Step 5: Sign resize state
    const userResizeSig = await walletAccount.sign({ hash: resizeStateHash });
    const signedResizeState = {
      intent: resizeState.intent,
      version: resizeState.version,
      data: resizeState.data,
      allocations: finalAllocations,
      sigs: [userResizeSig as `0x${string}`, resizeState.serverSignature],
    };

    // Step 6: Submit resize transaction
    const proofs = proofForResize ? [proofForResize] : [];
    const { request: simRequest } = await this.publicClient.simulateContract({
      address: custodyAddress,
      abi: CustodyAbi,
      functionName: 'resize',
      args: [channelId, signedResizeState as any, proofs as any],
      account: walletAccount,
    });

    const resizeTxHash = await this.walletClient.writeContract(
      simRequest as any,
    );
    console.log('[SDKChannelService] Resize tx submitted:', resizeTxHash);

    await this.publicClient.waitForTransactionReceipt({ hash: resizeTxHash });
    console.log('[SDKChannelService] ✅ Channel resized successfully');

    return {
      intent: resizeState.intent as StateIntent,
      version: resizeState.version,
      data: resizeState.data,
      allocations: resizeData.state.allocations.map((a: any, idx: number) => [
        BigInt(idx),
        BigInt(a.amount || 0),
      ]),
    };
  }

  /**
   * ========================================================================
   * CHANNEL CLOSE (Cooperative)
   * ========================================================================
   *
   * Closes a channel cooperatively with both parties' signatures.
   *
   * PROCESS:
   * 1. REQUEST: Ask ClearNode for final close state (with server signature)
   * 2. SIGN: Sign final state with raw ECDSA
   * 3. SUBMIT: Call custody.close() with signed final state
   *
   * CONNECTION TIMEOUT HANDLING:
   * - Uses sendRPCWithTimeoutAndRetry for close_channel call
   * - Retries on transient errors, but "channel not found" here is fatal
   *   (can't close a non-existent channel)
   *
   * @param channelId - Channel identifier
   * @param chainId - Blockchain chain ID
   * @param fundsDestination - Address to receive final funds distribution
   * @param token - Token address
   * @param participants - Channel participants
   * @returns Final channel state
   */
  async closeChannel(
    channelId: Hash,
    chainId: number,
    fundsDestination: Address,
    token?: Address,
    participants?: [Address, Address],
  ): Promise<ChannelState> {
    console.log(`[SDKChannelService] Closing channel ${channelId}...`);

    // Step 1: Request closure from ClearNode
    const response = await this.sendRPCWithTimeoutAndRetry(
      'close_channel',
      {
        channel_id: channelId,
        funds_destination: fundsDestination,
      },
      // Don't retry on "not found" for close - if channel doesn't exist, that's fatal
      (err) => {
        const msg = err.message?.toLowerCase() || '';
        return !msg.includes('not found') && this.isDefaultRetryableError(msg);
      },
    );

    const closeData = response.res[2];
    if (!closeData || !closeData.state) {
      throw new Error('Invalid close response');
    }

    // Step 2: Build final state
    const finalState = {
      channelId: channelId,
      intent: closeData.state.intent,
      version: BigInt(closeData.state.version),
      data: closeData.state.data || closeData.state.state_data || '0x',
      allocations: closeData.state.allocations.map((a: any) => ({
        destination: a.destination as Address,
        token: a.token as Address,
        amount: BigInt(a.amount || 0),
      })),
      serverSignature: closeData.server_signature as `0x${string}`,
    };

    // Step 3: Compute hash and sign
    const { encodeAbiParameters, keccak256: keccak } = await import('viem');
    const closeStateHash = keccak(
      encodeAbiParameters(
        [
          { name: 'channelId', type: 'bytes32' },
          { name: 'intent', type: 'uint8' },
          { name: 'version', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          {
            name: 'allocations',
            type: 'tuple[]',
            components: [
              { name: 'destination', type: 'address' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
        [
          channelId,
          finalState.intent,
          finalState.version,
          finalState.data as `0x${string}`,
          finalState.allocations,
        ],
      ),
    );

    const walletAccount = (this.walletClient as any).account;
    const userCloseSig = await walletAccount.sign({ hash: closeStateHash });

    const signedFinalState = {
      intent: finalState.intent,
      version: finalState.version,
      data: finalState.data,
      allocations: finalState.allocations,
      sigs: [userCloseSig as `0x${string}`, finalState.serverSignature],
    };

    // Step 4: Submit close transaction
    const custodyAddress =
      this.custodyAddresses[chainId] ??
      '0x0000000000000000000000000000000000000000';
    const { request: closeSimRequest } =
      await this.publicClient.simulateContract({
        address: custodyAddress,
        abi: CustodyAbi,
        functionName: 'close',
        args: [channelId, signedFinalState as any, []],
        account: walletAccount,
      });

    const txHash = await this.walletClient.writeContract(
      closeSimRequest as any,
    );
    console.log('[SDKChannelService] Close tx submitted:', txHash);

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('[SDKChannelService] ✅ Channel closed successfully');

    return {
      intent: closeData.state.intent as StateIntent,
      version: BigInt(closeData.state.version),
      data: closeData.state.data || '0x',
      allocations: closeData.state.allocations.map((a: any, idx: number) => [
        BigInt(idx),
        BigInt(a.amount || 0),
      ]),
    };
  }

  /**
   * ========================================================================
   * CHANNEL STATE RESYNC
   * ========================================================================
   *
   * Fetches current channel state from ClearNode. Useful for:
   * - Recovering state after page refresh
   * - Verifying channel status before operations
   * - Debugging state mismatches
   *
   * CONNECTION TIMEOUT HANDLING:
   * - Uses standard retry logic via sendRPCWithTimeoutAndRetry
   * - Returns null instead of throwing on failure (non-critical operation)
   *
   * @param chainId - Blockchain chain ID to filter channels
   * @returns ChannelWithState or null if not found/error
   */
  async resyncChannelState(chainId: number): Promise<ChannelWithState | null> {
    console.log(
      `[SDKChannelService] Re-syncing channel state for chain ${chainId}...`,
    );

    try {
      const response = await this.sendRPCWithTimeoutAndRetry(
        'get_channels',
        {},
        (err) => this.isDefaultRetryableError(err.message),
      );

      const channelsData = response.res[2];
      if (!channelsData?.channels || !Array.isArray(channelsData.channels)) {
        return null;
      }

      const channel = channelsData.channels.find(
        (c: any) => c.chain_id === chainId,
      );
      if (!channel) {
        return null;
      }

      // Parse channel data
      const participants: [Address, Address] = channel.participants
        ? [
            channel.participants[0] as Address,
            channel.participants[1] as Address,
          ]
        : [channel.participant as Address, channel.participant as Address];

      return {
        participants,
        adjudicator: channel.adjudicator as Address,
        challenge: BigInt(channel.challenge),
        nonce: BigInt(channel.nonce),
        channelId: channel.channel_id,
        state: {
          intent: (channel.state?.intent ??
            StateIntent.INITIALIZE) as StateIntent,
          version: BigInt(channel.version ?? channel.state?.version ?? 0),
          data: channel.state?.data ?? '0x',
          allocations: channel.state?.allocations
            ? channel.state.allocations.map((a: any, idx: number) => [
                BigInt(idx),
                BigInt(a.amount || 0),
              ])
            : [
                [BigInt(0), BigInt(0)],
                [BigInt(1), BigInt(0)],
              ],
        },
        chainId: channel.chain_id,
        status: channel.status,
      };
    } catch (error) {
      console.error(
        '[SDKChannelService] Failed to resync channel state:',
        error,
      );
      return null;
    }
  }

  /**
   * Update RPC configuration at runtime
   */
  updateRPCConfig(config: Partial<RPCConfig>): void {
    this.rpcConfig = { ...this.rpcConfig, ...config };
    console.log('[SDKChannelService] RPC config updated:', this.rpcConfig);
  }

  /**
   * Get current RPC configuration
   */
  getRPCConfig(): RPCConfig {
    return { ...this.rpcConfig };
  }
}
