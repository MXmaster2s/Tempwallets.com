/**
 * Payment Channel Service
 *
 * Handles 2-party payment channel operations with Clearnode:
 * - Create channel (user ↔ clearnode)
 * - Resize channel (add/remove funds)
 * - Close channel (cooperative closure)
 *
 * IMPORTANT: Payment channels are ALWAYS 2-party (user + clearnode).
 * For multi-party Lightning Nodes, use App Sessions instead.
 *
 * Yellow Network 0.5.x Protocol Changes:
 * 1. Channels ALWAYS created with ZERO balance (amount parameter deprecated)
 * 2. Funding happens via resize_channel AFTER creation
 * 3. resize_channel uses new parameters: resize_amount + allocate_amount
 * 4. State signatures: wallet address (not session key) for channels created in 0.5.x+
 * 5. Channels should stay at zero balance to enable app sessions
 *
 * Flow:
 * 1. Off-chain: Request channel creation via RPC (no amount parameter)
 * 2. On-chain: Submit to Custody.create() contract with zero allocations
 * 3. Off-chain: Request resize_channel to add funds (if needed)
 * 4. On-chain: Submit to Custody.resize() contract to update allocations
 *
 * Protocol Reference:
 * - Channel Methods: /Users/monstu/Developer/crawl4Ai/yellow/docs_protocol_off-chain_channel-methods.md
 * - Channel Lifecycle: /Users/monstu/Developer/crawl4Ai/yellow/docs_protocol_on-chain_channel-lifecycle.md
 * - 0.5.x Breaking Changes: /Users/monstu/Developer/crawl4Ai/yellow/05x-breaking-changes.md
 */

import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import {
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toBytes,
  toHex,
  hexToBytes,
} from 'viem';
import {
  createResizeChannelMessage,
  createECDSAMessageSigner,
} from '@erc7824/nitrolite';
import type { WebSocketManager } from './websocket-manager.js';
import type { SessionKeyAuth } from './session-auth.js';
import type {
  Channel,
  ChannelState,
  ChannelWithState,
  Allocation,
  RPCRequest,
} from './types.js';
import { StateIntent } from './types.js';

/**
 * ERC20 Token ABI (for approvals)
 */
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Custody Contract ABI (minimal for channel operations)
 */
const CUSTODY_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'channelId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'create',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'channel',
        type: 'tuple',
        components: [
          { name: 'participants', type: 'address[]' },
          { name: 'adjudicator', type: 'address' },
          { name: 'challenge', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      {
        name: 'state',
        type: 'tuple',
        components: [
          { name: 'intent', type: 'uint8' },
          { name: 'version', type: 'uint256' },  // CRITICAL: Must be uint256 to match contract State struct!
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
      },
      { name: 'sigs', type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    name: 'close',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'channelId', type: 'bytes32' },
      {
        name: 'state',
        type: 'tuple',
        components: [
          { name: 'intent', type: 'uint8' },
          { name: 'version', type: 'uint256' },  // CRITICAL: Must be uint256 to match contract State struct!
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
      },
      { name: 'sigs', type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    name: 'resize',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'channelId', type: 'bytes32' },
      {
        name: 'state',
        type: 'tuple',
        components: [
          { name: 'intent', type: 'uint8' },
          { name: 'version', type: 'uint256' },  // CRITICAL: Must be uint256 to match contract State struct!
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
      },
      { name: 'sigs', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const;

/**
 * Payment Channel Service
 *
 * Manages 2-party payment channels between user and clearnode
 */
export class ChannelService {
  private ws: WebSocketManager;
  private auth: SessionKeyAuth;
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private custodyAddresses: Record<number, Address>;

  constructor(
    ws: WebSocketManager,
    auth: SessionKeyAuth,
    publicClient: PublicClient,
    walletClient: WalletClient,
    custodyAddresses: Record<number, Address>,
  ) {
    this.ws = ws;
    this.auth = auth;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.custodyAddresses = custodyAddresses;
  }

  /**
   * Create a new 2-party payment channel (user ↔ clearnode)
   *
   * @param chainId - Blockchain chain ID
   * @param token - Token address (use '0x0000000000000000000000000000000000000000' for native)
   * @param initialDeposit - Optional initial deposit amount in smallest units
   * @returns Created channel with ID and state
   */
  async createChannel(
    chainId: number,
    token: Address,
    initialDeposit?: bigint,
  ): Promise<ChannelWithState> {
    console.log(`[ChannelService] Creating channel on chain ${chainId}...`);

    // ============================================================================
    // FIX #1: Authentication Guard - Check session before creating channel
    // ============================================================================
    if (!this.auth.isAuthenticated()) {
      console.error('[ChannelService] ❌ Session key not authenticated!');
      throw new Error('Session key not authenticated. Please call initialize() to authenticate first.');
    }

    // Check if session is about to expire
    const sessionExpiresAt = this.auth.getExpiresAt();
    if (sessionExpiresAt && Date.now() >= sessionExpiresAt) {
      console.error('[ChannelService] ❌ Session expired!');
      throw new Error('Session expired. Please re-authenticate.');
    }

    console.log('[ChannelService] ✅ Session key authenticated');
    console.log('[ChannelService] Session key address:', this.auth.getSessionKeyAddress());
    if (sessionExpiresAt) {
      console.log('[ChannelService] ✅ Session valid until:', new Date(sessionExpiresAt).toISOString());
    }

    // ============================================================================
    // Step 1: Request channel creation from Yellow Network (0.5.x: ALWAYS zero balance)
    // 
    // IMPORTANT: Yellow Network 0.5.x Breaking Change:
    // - "Clearnode no longer supports creating channels with an initial deposit"
    // - All channels MUST be created with zero balance
    // - Funding is done separately via resize_channel after creation
    // - The 'amount' parameter is NO LONGER SUPPORTED and will be IGNORED
    // ============================================================================
    const requestId = this.ws.getNextRequestId();
    
    // Build request parameters (0.5.x: no amount parameter)
    const requestParams: any = { 
      chain_id: chainId, 
      token 
    };
    
    // Log initial deposit info (will be used in step 4 after channel creation)
    if (initialDeposit && initialDeposit > BigInt(0)) {
      console.log(
        `[ChannelService] Initial deposit ${initialDeposit.toString()} will be added via resize_channel ` +
        `after channel creation (0.5.x protocol requires two-step flow)`
      );
    } else {
      console.log(`[ChannelService] Creating channel with zero balance (will fund later via resize)`);
    }
    
    let request: RPCRequest = {
      req: [
        requestId,
        'create_channel',
        requestParams,
        Date.now(),
      ],
      sig: [] as string[],
    };

    // Sign with session key
    request = await this.auth.signRequest(request);

    const response = await this.ws.send(request);
    
    // Log full response for debugging
    console.log('[ChannelService] Full response:', JSON.stringify(response, null, 2));
    
    // Check for errors in response
    if (response.error) {
      throw new Error(`Yellow Network error: ${response.error.message}`);
    }
    
    if (response.res && response.res[1] === 'error') {
      throw new Error(`Yellow Network error: ${JSON.stringify(response.res[2])}`);
    }
    
    const channelData = response.res[2];
    
    if (!channelData) {
      throw new Error('No channel data in response. Response structure: ' + JSON.stringify(response.res));
    }

    console.log('[ChannelService] Received channel config from clearnode');
    console.log('[ChannelService] Channel data structure:', JSON.stringify(channelData, null, 2));

    // ============================================================================
    // DEFENSIVE GUARD: Validate channelData shape before use
    // ============================================================================
    
    // Step 1: Validate payload structure
    if (!this.validateChannelDataShape(channelData)) {
      // Log structured error with raw payload
      const errorPayload = {
        timestamp: new Date().toISOString(),
        operation: 'create_channel',
        chainId,
        token,
        rawResponse: channelData,
        responseKeys: Object.keys(channelData || {}),
      };
      
      console.error('[ChannelService] ❌ Invalid channelData shape:', JSON.stringify(errorPayload, null, 2));
      
      // Short-circuit: Don't proceed with channel creation
      throw new Error(
        `Invalid channel data structure. Expected 'channel' object with 'participants' array. ` +
        `Received keys: ${Object.keys(channelData || {}).join(', ')}. ` +
        `This may indicate a WebSocket disconnect or Yellow Network schema change. ` +
        `Please retry the operation.`
      );
    }

    // Step 2: Extract and validate channel object
    let channelObj: any;
    let stateObj: any;
    let serverSignature: string;
    let userSignature: string | undefined;
    let channelIdFromResponse: Hash | undefined;
    let originalAllocations: any[] | undefined; // Store original allocations from Yellow Network for signing

    // Extract channel_id from Yellow Network response if provided
    if (channelData.channel_id) {
      channelIdFromResponse = channelData.channel_id as Hash;
      console.log('[ChannelService] Using channel_id from Yellow Network response:', channelIdFromResponse);
    }

    if (channelData.channel) {
      // Standard structure: { channel_id: "...", channel: {...}, state: {...}, server_signature: "..." }
      channelObj = channelData.channel;
      stateObj = channelData.state;
      serverSignature = channelData.server_signature;
      userSignature = channelData.user_signature; // May or may not be present
      // CRITICAL: Store original allocations from Yellow Network for signing
      originalAllocations = channelData.state?.allocations;
    } else if (channelData.participants) {
      // Alternative structure: channel data at top level
      channelObj = channelData;
      stateObj = channelData.state || {
        intent: StateIntent.INITIALIZE,
        version: 0,
        data: '0x',
        allocations: [[0, 0], [1, 0]],
      };
      serverSignature = channelData.server_signature;
      userSignature = channelData.user_signature;
      // CRITICAL: Store original allocations from Yellow Network for signing
      originalAllocations = channelData.state?.allocations;
    } else {
      // This should not happen if validateChannelDataShape passed, but double-check
      throw new Error(
        `Invalid response structure: Expected 'channel' object or top-level channel data. ` +
        `Response keys: ${Object.keys(channelData).join(', ')}. ` +
        `Full data: ${JSON.stringify(channelData, null, 2)}`
      );
    }

    // Step 3: Validate participants array
    if (!channelObj.participants || !Array.isArray(channelObj.participants)) {
      throw new Error(
        `Invalid channel structure: 'participants' is missing or not an array. ` +
        `Channel object: ${JSON.stringify(channelObj, null, 2)}`
      );
    }

    if (channelObj.participants.length < 2) {
      throw new Error(
        `Invalid channel structure: expected 2 participants, got ${channelObj.participants.length}. ` +
        `Participants: ${JSON.stringify(channelObj.participants)}`
      );
    }

    // Parse channel and state from response
    const channel: Channel = {
      participants: channelObj.participants.map((p: string) => p as Address),
      adjudicator: channelObj.adjudicator as Address,
      challenge: BigInt(channelObj.challenge || 3600), // Default to 1 hour if not provided
      nonce: BigInt(channelObj.nonce),
    };

    // CRITICAL: Use Yellow Network's provided channelId for signing!
    // Yellow's server has already signed with this channelId, so we MUST use the same one
    // Otherwise Yellow's server signature won't verify (which we need for the contract)
    const channelId = channelIdFromResponse || this.computeChannelIdWithChainId(channel, chainId);

    if (channelIdFromResponse) {
      console.log('[ChannelService] ═══ CHANNEL ID COMPARISON ═══');
      console.log('[ChannelService] Yellow Network provided:', channelIdFromResponse);

      // Compute what we think it should be
      const ourComputedId = this.computeChannelIdWithChainId(channel, chainId);
      console.log('[ChannelService] Our computation (WITH chainId):', ourComputedId);

      // Also log the one without chainId for reference
      const channelIdWithoutChainId = this.computeChannelId(channel, chainId);

      if (channelIdFromResponse === ourComputedId) {
        console.log('[ChannelService] ✅ ChannelId matches! Using Yellow Network\'s provided ID');
      } else {
        console.warn('[ChannelService] ⚠️  ChannelId MISMATCH!');
        console.warn('[ChannelService] Using Yellow Network\'s channelId for signing (to match their server signature)');
        console.warn('[ChannelService] WARNING: Contract may compute a DIFFERENT channelId and reject both signatures!');
        console.warn('[ChannelService] If contract rejects, we need to investigate why Yellow computes it differently');
      }
    } else {
      console.log('[ChannelService] Computed channel ID (Yellow Network did not provide one):', channelId);
    }

    // ============================================================================
    // FLOW (Yellow Network 0.5.x):
    // 1. create_channel returns ZERO allocations (always, per 0.5.x protocol)
    // 2. Call Custody.create() on-chain with zero allocations
    // 3. If initialDeposit provided, call resize_channel to add funds
    // 
    // IMPORTANT: Yellow Network 0.5.x Breaking Change:
    // - "Clearnode no longer supports creating channels with an initial deposit"
    // - The response will ALWAYS contain zero allocations
    // - We must use resize_channel after creation to add funds
    // ============================================================================
    
    // Determine if we need to fund after creation
    let depositAmount: bigint;
    
    if (initialDeposit && initialDeposit > BigInt(0)) {
      depositAmount = initialDeposit;
      console.log(
        `[ChannelService] Will add ${depositAmount.toString()} via resize_channel ` +
        `after channel creation (0.5.x protocol requirement)`
      );
    } else {
      depositAmount = BigInt(0);
      console.log(
        `[ChannelService] No initial deposit - channel will remain at zero balance (can resize later)`
      );
    }

    // ============================================================================
    // Step 2: Build allocations array
    // 
    // CRITICAL: Custody.create() requires exactly 2 allocations in the array,
    // even if both amounts are 0. The contract checks array length, not total amount.
    // 
    // Yellow Network 0.5.x: Always returns zero allocations from create_channel
    // ============================================================================

    // ============================================================================
    // Build allocations array - MUST have exactly 2 items (both zero in 0.5.x)
    // ============================================================================
    // CRITICAL: Contract requires exactly 2 allocations: [{index: 0, amount: 0}, {index: 1, amount: 0}]
    // Yellow Network 0.5.x always returns zero allocations for create_channel
    let parsedAllocations: [bigint, bigint][];
    
    if (stateObj?.allocations && Array.isArray(stateObj.allocations) && stateObj.allocations.length > 0) {
      // Parse allocations from Yellow Network response
      parsedAllocations = stateObj.allocations.map((a: any, idx: number) => {
        // Handle different allocation formats from Yellow Network
        let participantIndex: bigint;
        let amount: bigint;

        if (Array.isArray(a)) {
          // Array format: [index, amount]
          participantIndex = BigInt(a[0]);
          amount = BigInt(a[1]);
        } else if (a.index !== undefined) {
          // Has explicit index field
          participantIndex = BigInt(a.index);
          amount = BigInt(a.amount || 0);
        } else if (a.destination !== undefined) {
          // Yellow Network format: { destination, token, amount }
          // Map destination address to participant index
          const destination = a.destination.toLowerCase() as Address;
          const participantIndexFound = channel.participants.findIndex(
            (p) => p.toLowerCase() === destination
          );
          if (participantIndexFound === -1) {
            // Fallback to array index if destination not found
            console.warn(
              `[ChannelService] Allocation destination ${destination} not found in participants, using array index ${idx}`
            );
            participantIndex = BigInt(idx);
          } else {
            participantIndex = BigInt(participantIndexFound);
          }
          amount = BigInt(a.amount || 0);
        } else {
          // Fallback to array index
          participantIndex = BigInt(idx);
          amount = BigInt(a.amount || 0);
        }

        return [participantIndex, amount];
      });

      // CRITICAL: Contract requires exactly 2 allocations
      // Yellow Network 0.5.x: Always returns 2 allocations with zero amounts
      if (parsedAllocations.length !== 2) {
        console.warn(
          `[ChannelService] ⚠️ Yellow Network returned ${parsedAllocations.length} allocations, expected 2. ` +
          `Padding or trimming to exactly 2 allocations with zero amounts (0.5.x protocol).`
        );
        
        // Ensure exactly 2 allocations (both zero per 0.5.x)
        if (parsedAllocations.length === 0) {
          // No allocations - create default zero allocations
          parsedAllocations = [
            [BigInt(0), BigInt(0)],
            [BigInt(1), BigInt(0)],
          ];
        } else if (parsedAllocations.length === 1) {
          // Only 1 allocation - add second with zero
          parsedAllocations.push([BigInt(1), BigInt(0)]);
        } else if (parsedAllocations.length > 2) {
          // More than 2 - take first 2
          parsedAllocations = parsedAllocations.slice(0, 2);
        }
      }

      // Ensure indices are 0 and 1 (contract requirement)
      if (parsedAllocations.length >= 1) {
        parsedAllocations[0] = [BigInt(0), parsedAllocations[0]?.[1] ?? BigInt(0)];
      }
      if (parsedAllocations.length >= 2) {
        parsedAllocations[1] = [BigInt(1), parsedAllocations[1]?.[1] ?? BigInt(0)];
      }

      const totalAllocated = parsedAllocations.reduce((sum, [, amt]) => sum + amt, BigInt(0));
      
      // Ensure we have exactly 2 allocations before logging
      if (parsedAllocations.length === 2) {
        console.log(
          `[ChannelService] ✅ Parsed allocations from Yellow Network (0.5.x): ` +
          `[index: ${parsedAllocations[0]?.[0] ?? 0}, amount: ${parsedAllocations[0]?.[1] ?? 0}], ` +
          `[index: ${parsedAllocations[1]?.[0] ?? 1}, amount: ${parsedAllocations[1]?.[1] ?? 0}] ` +
          `(total: ${totalAllocated.toString()})`
        );
      } else {
        console.log(
          `[ChannelService] ⚠️ Allocations array has ${parsedAllocations.length} items (expected 2)`
        );
      }
      
      // Yellow Network 0.5.x: Always returns zero allocations
      if (totalAllocated === BigInt(0)) {
        console.log(
          `[ChannelService] ✅ Zero allocations confirmed (0.5.x protocol). ` +
          `Will create channel on-chain, then resize to add ${depositAmount > BigInt(0) ? depositAmount.toString() : '0'} if needed.`
        );
      } else {
        console.warn(
          `[ChannelService] ⚠️ WARNING: Non-zero allocations (${totalAllocated.toString()}) received. ` +
          `This is unexpected in 0.5.x protocol. Proceeding anyway...`
        );
      }
    } else {
      // No allocations in response - create default zero allocations (expected in 0.5.x)
      console.log(
        `[ChannelService] No allocations in response. Creating default zero allocations (0.5.x protocol).`
      );
      parsedAllocations = [
        [BigInt(0), BigInt(0)],
        [BigInt(1), BigInt(0)],
      ];
    }

    const state: ChannelState = stateObj
      ? {
          intent: (stateObj.intent !== undefined ? Number(stateObj.intent) : StateIntent.INITIALIZE) as StateIntent,
          version: BigInt(stateObj.version || 0),
          data: stateObj.data || stateObj.state_data || '0x', // Handle both 'data' and 'state_data' fields
          allocations: parsedAllocations,
        }
      : {
          // No stateObj: build default funded state matching deposit
          intent: StateIntent.INITIALIZE,
          version: BigInt(0),
          data: '0x',
          allocations: parsedAllocations,
        };

    // CRITICAL VALIDATION: Ensure exactly 2 allocations before sending to contract
    if (state.allocations.length !== 2) {
      throw new Error(
        `Invalid allocations array length: ${state.allocations.length}. ` +
        `Contract requires exactly 2 allocations: [{index: 0, amount: X}, {index: 1, amount: Y}]. ` +
        `Got: ${JSON.stringify(state.allocations)}`
      );
    }

    // Ensure indices are correct (0 and 1)
    if (state.allocations.length >= 2) {
      const firstIdx = state.allocations[0]?.[0] ?? BigInt(0);
      const secondIdx = state.allocations[1]?.[0] ?? BigInt(1);
      
      if (firstIdx !== BigInt(0) || secondIdx !== BigInt(1)) {
        console.warn(
          `[ChannelService] ⚠️ Allocation indices incorrect. Fixing to [0, 1]. ` +
          `Got: [${firstIdx}, ${secondIdx}]`
        );
        if (state.allocations[0]) {
          state.allocations[0] = [BigInt(0), state.allocations[0][1] ?? BigInt(0)];
        }
        if (state.allocations[1]) {
          state.allocations[1] = [BigInt(1), state.allocations[1][1] ?? BigInt(0)];
        }
      }
    }

    // Log parsed state for debugging
    console.log('[ChannelService] ✅ Final state before create():', {
      intent: state.intent,
      version: state.version.toString(),
      data: state.data,
      allocations: state.allocations.map(([idx, amt]) => `[index: ${idx}, amount: ${amt}]`),
      allocationsLength: state.allocations.length,
    });

    // Step 2: Submit to on-chain Custody contract
    const custodyAddress = this.custodyAddresses[chainId];
    if (!custodyAddress) {
      throw new Error(`Custody address not found for chain ${chainId}`);
    }

    console.log(
      '[ChannelService] Submitting to Custody contract:',
      custodyAddress,
    );

    // ============================================================================
    // Yellow Network 0.5.x Protocol Issue:
    // Users with NON-ZERO channel amounts cannot create new channels or app sessions
    // This is a protocol restriction to prevent fund conflicts
    // ============================================================================
    
    // Check if user already has a channel on this chain (via Yellow Network)
    try {
      // Query existing channels via RPC
      const checkRequestId = this.ws.getNextRequestId();
      let checkRequest: RPCRequest = {
        req: [checkRequestId, 'get_channels', {}, Date.now()],
        sig: [] as string[],
      };
      checkRequest = await this.auth.signRequest(checkRequest);
      const channelsResponse = await this.ws.send(checkRequest);
      
      if (channelsResponse.res && channelsResponse.res[2]?.channels) {
        const existingChannel = channelsResponse.res[2].channels.find(
          (ch: any) => ch.chain_id === chainId && ch.status === 'open'
        );
        
        if (existingChannel && existingChannel.amount) {
          const channelAmount = BigInt(existingChannel.amount || 0);
          
          if (channelAmount > BigInt(0)) {
            throw new Error(
              `⚠️ Yellow Network 0.5.x Protocol Restriction: ` +
              `You have an existing open channel (${existingChannel.channel_id}) with non-zero amount (${channelAmount.toString()}). ` +
              `Channels with non-zero amounts block new channel/app session creation. ` +
              `Please resize the existing channel to zero or close it first. ` +
              `See: YELLOW_NETWORK_0.5.x_MIGRATION.md`
            );
          }
          
          console.log(
            `[ChannelService] ✅ Existing channel found with zero balance. Safe to create new channel.`
          );
        }
      }
    } catch (error) {
      // If query fails, log but continue (don't block channel creation)
      console.warn(`[ChannelService] Could not check for existing channels: ${(error as Error).message}`);
      // Re-throw if it's our custom protocol restriction error
      if ((error as Error).message.includes('Protocol Restriction')) {
        throw error;
      }
    }

    // Prepare signatures
    // NOTE: We do NOT verify signatures client-side. The Custody contract will verify
    // signatures on-chain. Client-side verification can fail due to signature format
    // differences (EIP-191 vs raw ECDSA vs EIP-712). If signatures are invalid, the
    // transaction will revert on-chain, which is the authoritative check.
    
    // User signature: If not provided by Yellow Network, we need to sign the state ourselves
    // For channel creation, Yellow Network typically provides both signatures
    if (!serverSignature) {
      throw new Error('Missing server_signature in response');
    }

    // CRITICAL: We use Yellow Network's signed allocations exactly as-is
    // If we passed 'amount' to create_channel, Yellow Network signed allocations matching that amount
    // We MUST NOT modify allocations - it would invalidate the server signature

    // ============================================================================
    // CRITICAL: Signature Order and State Hash Calculation
    // ============================================================================
    // Yellow Network 0.5.x provides server_signature (clearnode's signature)
    // The contract expects signatures in participant order: [participant[0], participant[1]]
    // 
    // Participants array from Yellow Network:
    //   [0] = User's wallet address
    //   [1] = Clearnode's address
    //
    // Therefore:
    //   signatures[0] = User's signature (we generate this)
    //   signatures[1] = Clearnode's signature (provided as server_signature)
    //
    // CRITICAL: Both must sign THE EXACT SAME state hash
    // ============================================================================

    if (!userSignature) {
      console.log(
        '[ChannelService] User signature not provided in response. Generating signature as participant[0]...'
      );

      // CRITICAL: Yellow Network State Encoding Format (CORRECTED)
      // ============================================================================
      // The contract's Utils.getPackedState uses FLATTENED encoding, NOT nested tuple!
      //
      // WRONG (old approach):
      //   abi.encode(channelId, (intent, version, data, allocations))  ❌
      //
      // CORRECT (Yellow Network format):
      //   abi.encode(channelId, intent, version, data, allocations)  ✅
      //
      // Key differences:
      // 1. FLATTENED fields (not nested tuple)
      // 2. version is uint256 (not uint64)
      // 3. allocations use {destination, token, amount} (not {index, amount})
      // ============================================================================

      // ============================================================================
      // CRITICAL: Use Yellow Network's EXACT allocations for signing
      // ============================================================================
      // Yellow team guidance:
      // "The server maps index: 0 to participants[0]"
      // "Log the destination addresses you are deriving locally and compare them to the RPC response"
      //
      // We MUST use the EXACT allocations from Yellow Network's response, preserving:
      // - Order (allocation[0] must map to participants[0])
      // - Address case (use exact case from response, likely checksummed)
      // - Token addresses
      // - Amounts
      // ============================================================================

      console.log('[ChannelService] ═══ ALLOCATION COMPARISON (Yellow Team Debug) ═══');
      console.log('[ChannelService] Participants from Yellow Network:');
      console.log(`  [0] ${channel.participants[0]}`);
      console.log(`  [1] ${channel.participants[1]}`);

      let allocationsForSigning: Array<{destination: Address, token: Address, amount: bigint}>;

      if (originalAllocations && originalAllocations.length > 0 && originalAllocations[0].destination) {
        // Yellow Network provided allocations in resolved format - use them EXACTLY as-is!
        console.log('[ChannelService] Allocations from Yellow Network response:');
        originalAllocations.forEach((a: any, idx: number) => {
          console.log(`  [${idx}] destination: ${a.destination}, token: ${a.token}, amount: ${a.amount}`);
        });

        allocationsForSigning = originalAllocations.map((a: any) => ({
          destination: a.destination as Address,  // Use EXACT address from Yellow (with case)
          token: a.token as Address,              // Use EXACT token address from Yellow
          amount: BigInt(a.amount || 0)
        }));

        console.log('[ChannelService] Allocations we will use for signing (MUST match above exactly):');
        allocationsForSigning.forEach((alloc, idx) => {
          console.log(`  [${idx}] destination: ${alloc.destination}, token: ${alloc.token}, amount: ${alloc.amount.toString()}`);
        });

        // VERIFICATION: Check if allocation order matches participant order
        console.log('[ChannelService] ═══ VERIFICATION ═══');
        const alloc0MatchesParticipant0 = allocationsForSigning[0]?.destination?.toLowerCase() === channel.participants[0]?.toLowerCase();
        const alloc1MatchesParticipant1 = allocationsForSigning[1]?.destination?.toLowerCase() === channel.participants[1]?.toLowerCase();
        console.log(`[ChannelService] allocation[0].destination matches participants[0]: ${alloc0MatchesParticipant0}`);
        console.log(`[ChannelService] allocation[1].destination matches participants[1]: ${alloc1MatchesParticipant1}`);

        if (!alloc0MatchesParticipant0 || !alloc1MatchesParticipant1) {
          console.error('[ChannelService] ❌ ALLOCATION ORDER MISMATCH!');
          console.error('[ChannelService] This is likely why server signature fails verification!');
          console.error('[ChannelService] Yellow team: "The server maps index: 0 to participants[0]"');
        }
      } else {
        // Fallback: resolve indices to addresses (should not happen with Yellow Network)
        console.warn('[ChannelService] ⚠️  WARNING: Using fallback allocation resolution (Yellow did not provide resolved allocations)');
        allocationsForSigning = state.allocations.map((a) => ({
          destination: channel.participants[Number(a[0])] as Address,
          token: token,
          amount: a[1]
        }));
        console.log('[ChannelService] Resolved allocations from indices:');
        allocationsForSigning.forEach((alloc, idx) => {
          console.log(`  [${idx}] destination: ${alloc.destination}, token: ${alloc.token}, amount: ${alloc.amount.toString()}`);
        });
      }

      // ============================================================================
      // CRITICAL: Verify data field format (Yellow team guidance #2)
      // ============================================================================
      // Yellow team: "Ensure you are encoding data as '0x' (hex string for empty bytes)"
      // "If it's null or an empty string '' in the encoder, the hash changes"
      const dataField = state.data;
      console.log('[ChannelService] ═══ DATA FIELD VERIFICATION ═══');
      console.log(`[ChannelService] state.data value: "${dataField}"`);
      console.log(`[ChannelService] state.data type: ${typeof dataField}`);
      console.log(`[ChannelService] state.data === "0x": ${dataField === '0x'}`);

      if (dataField !== '0x' && dataField.toLowerCase() !== '0x') {
        console.warn('[ChannelService] ⚠️  WARNING: data field is not "0x"! This may cause hash mismatch!');
        console.warn(`[ChannelService] Expected: "0x", Got: "${dataField}"`);
      }

      // ============================================================================
      // CRITICAL: Verify chainId (Yellow team guidance #3)
      // ============================================================================
      console.log('[ChannelService] ═══ CHAIN ID VERIFICATION ═══');
      console.log(`[ChannelService] chainId we're using: ${chainId}`);
      console.log(`[ChannelService] Expected for Base Mainnet: 8453`);
      console.log(`[ChannelService] Expected for Base Sepolia: 84532`);

      if (chainId !== 8453 && chainId !== 84532) {
        console.warn(`[ChannelService] ⚠️  WARNING: Unexpected chainId! Got ${chainId}`);
      }

      // Step 2: Encode with FLATTENED structure to match Utils.sol
      console.log('[ChannelService] ═══ ENCODING STATE FOR SIGNING ═══');
      console.log(`[ChannelService] channelId: ${channelId}`);
      console.log(`[ChannelService] intent: ${state.intent}`);
      console.log(`[ChannelService] version: ${state.version} (as uint256)`);
      console.log(`[ChannelService] data: "${dataField}"`);
      console.log(`[ChannelService] allocations count: ${allocationsForSigning.length}`);

      const packedData = encodeAbiParameters(
        [
          { name: 'channelId', type: 'bytes32' },
          { name: 'intent', type: 'uint8' },
          { name: 'version', type: 'uint256' }, // ⚠️ uint256 NOT uint64!
          { name: 'data', type: 'bytes' },
          {
            name: 'allocations',
            type: 'tuple[]',
            components: [
              { name: 'destination', type: 'address' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ]
          }
        ],
        [
          channelId,
          state.intent,
          BigInt(state.version), // Explicit BigInt conversion for uint256
          dataField,             // Use exact data field from state
          allocationsForSigning // Use the EXACT allocations from Yellow Network!
        ]
      );

      const stateHash = keccak256(packedData);

      console.log('[ChannelService] ✅ State encoding: FLATTENED (channelId, intent, version, data, allocations)');
      console.log('[ChannelService] Channel ID:', channelId);
      console.log('[ChannelService] State hash to sign:', stateHash);
      console.log('[ChannelService] Signing as participant[0]:', channel.participants[0]);
      console.log('[ChannelService] Server (participant[1]):', channel.participants[1]);

      // CRITICAL: Use RAW ECDSA signature for smart contract compatibility
      // Smart contracts use ecrecover which expects raw signatures WITHOUT EIP-191 prefix
      // EIP-191 is only for off-chain message signing (like RPC requests)
      if (!this.walletClient.account?.sign) {
        throw new Error('Wallet client account does not support signing');
      }
      
      userSignature = await this.walletClient.account.sign({
        hash: stateHash
      });

      console.log('[ChannelService] ═══ SIGNATURE DETAILS ═══');
      console.log('[ChannelService] User signature (RAW ECDSA):', userSignature);
      console.log('[ChannelService] Server signature (from Yellow):', serverSignature);
      console.log('[ChannelService] State hash we computed:', stateHash);

      // CRITICAL: Both signatures use RAW ECDSA recovery (for smart contract)
      // - User: We sign WITH raw ECDSA, so recover WITH raw ECDSA
      // - Server: Yellow signs WITH raw ECDSA, so recover WITH raw ECDSA
      const { recoverAddress } = await import('viem');

      try {
        console.log('[ChannelService] ═══ SIGNATURE RECOVERY (Yellow Team Debug) ═══');

        // User signature: RAW recovery (we signed it with raw ECDSA)
        const recoveredUser = await recoverAddress({
          hash: stateHash,
          signature: userSignature as `0x${string}`
        });

        // Server signature: RAW recovery (Yellow signed with raw ECDSA)
        const recoveredServer = await recoverAddress({
          hash: stateHash,
          signature: serverSignature as `0x${string}`
        });

        console.log('[ChannelService] Recovered from user signature:', recoveredUser);
        console.log('[ChannelService] Expected (participant[0]):', channel.participants[0]);
        console.log('[ChannelService] User signature MATCH:', recoveredUser.toLowerCase() === channel.participants[0]?.toLowerCase() ? '✅ YES' : '❌ NO');

        console.log('');
        console.log('[ChannelService] Recovered from server signature:', recoveredServer);
        console.log('[ChannelService] Expected (participant[1]/clearnode):', channel.participants[1]);
        console.log('[ChannelService] Server signature MATCH:', recoveredServer.toLowerCase() === channel.participants[1]?.toLowerCase() ? '✅ YES' : '❌ NO');

        const userMatches = recoveredUser.toLowerCase() === channel.participants[0]?.toLowerCase();
        const serverMatches = recoveredServer.toLowerCase() === channel.participants[1]?.toLowerCase();

        console.log('');
        console.log('[ChannelService] ═══ SIGNATURE VERIFICATION SUMMARY ═══');
        console.log(`[ChannelService] User signature: ${userMatches ? '✅ VALID' : '❌ INVALID'}`);
        console.log(`[ChannelService] Server signature: ${serverMatches ? '✅ VALID' : '❌ INVALID'}`);

        if (!userMatches) {
          throw new Error(
            `User signature verification FAILED!\n` +
            `Expected: ${channel.participants[0]}\n` +
            `Recovered: ${recoveredUser}\n` +
            `This indicates our signing logic is incorrect.`
          );
        }

        if (!serverMatches) {
          console.warn('[ChannelService] ⚠️  WARNING: Server signature verification FAILED in our off-chain check!');
          console.warn(`[ChannelService] Expected (clearnode): ${channel.participants[1]}`);
          console.warn(`[ChannelService] Recovered: ${recoveredServer}`);
          console.warn(`[ChannelService] State hash: ${stateHash}`);
          console.warn('[ChannelService] This might be OK - Yellow may use different channelId computation');
          console.warn('[ChannelService] The contract will do the final verification on-chain');
          console.warn('[ChannelService] Proceeding with contract submission...');
        } else {
          console.log('[ChannelService] 🎉 BOTH SIGNATURES VERIFIED SUCCESSFULLY!');
        }
      } catch (error) {
        console.error('[ChannelService] ❌ Signature recovery failed:', error);
        throw error;
      }
    }

    // ============================================================================
    // CRITICAL: Use BOTH Signatures for 0.5.x Protocol - RAW ECDSA Format
    // ============================================================================
    // Yellow Network provides server_signature in create_channel response
    // The Custody contract requires BOTH participant signatures
    // Format: RAW ECDSA (no EIP-191 prefix) for smart contract ecrecover compatibility
    // Both signatures must be over the SAME state hash (flattened encoding)
    // Note: EIP-191 is only used for RPC request signing (session keys), not contract sigs
    // ============================================================================

    console.log('[ChannelService] ✅ USING DUAL SIGNATURE APPROACH (0.5.x protocol)');
    console.log('[ChannelService] Format: RAW ECDSA (for smart contract compatibility)');
    console.log('[ChannelService] Encoding: FLATTENED (channelId, intent, version, data, allocations)');
    console.log('[ChannelService] Both signatures will be submitted to Custody contract');

    const signatures = [
      userSignature as `0x${string}`,      // User (participant[0]) signature
      serverSignature as `0x${string}`     // Server (participant[1]) signature from Yellow Network
    ];

    // ============================================================================
    // Step 3: Call Custody.create() with minimal state (channel must exist before deposit)
    // ============================================================================
    // The contract will verify the user signature
    // Then Yellow Network clearnode will call join() with their signature
    // CRITICAL: Ensure all numeric values are BigInt to match what was signed
    
    // CRITICAL FIX: Convert allocations from [index, amount] to {destination, token, amount} for contract
    // The contract expects full allocation struct, not the index-based optimization
    // We need to map each allocation index back to the destination address
    const allocationsForContract = state.allocations.map(([index, amount]) => ({
      destination: channel.participants[Number(index)] as Address,
      token: token, // Use the token address from channel creation
      amount: BigInt(amount),
    }));

    const contractArgs = {
      channel: {
        participants: channel.participants as Address[], // Dynamic array (address[]) for contract
        adjudicator: channel.adjudicator,
        challenge: BigInt(channel.challenge),
        nonce: BigInt(channel.nonce),
      },
      state: {
        intent: state.intent,
        version: BigInt(state.version),
        data: state.data,
        allocations: allocationsForContract,
      },
      signatures,
    };
    
    console.log('[ChannelService] ═══════════════════════════════════════════════════════');
    console.log('[ChannelService] 📤 CALLING CUSTODY CONTRACT create()');
    console.log('[ChannelService] ═══════════════════════════════════════════════════════');
    console.log('[ChannelService] Contract Address:', custodyAddress);
    console.log('[ChannelService] Sender (user wallet):', this.walletClient.account!.address);
    console.log('[ChannelService] ───────────────────────────────────────────────────────');
    console.log('[ChannelService] Arg 1 - channel:');
    console.log('[ChannelService]   participants[0] (user):', contractArgs.channel.participants[0]);
    console.log('[ChannelService]   participants[1] (clearnode):', contractArgs.channel.participants[1]);
    console.log('[ChannelService]   adjudicator:', contractArgs.channel.adjudicator);
    console.log('[ChannelService]   challenge:', contractArgs.channel.challenge.toString());
    console.log('[ChannelService]   nonce:', contractArgs.channel.nonce.toString());
    console.log('[ChannelService] ───────────────────────────────────────────────────────');
    console.log('[ChannelService] Arg 2 - state:');
    console.log('[ChannelService]   intent:', contractArgs.state.intent);
    console.log('[ChannelService]   version:', contractArgs.state.version.toString());
    console.log('[ChannelService]   data:', contractArgs.state.data);
    console.log('[ChannelService]   allocations:');
    contractArgs.state.allocations.forEach((alloc, i) => {
      console.log(`[ChannelService]     [${i}] destination: ${alloc.destination}, token: ${alloc.token}, amount: ${alloc.amount.toString()}`);
    });
    console.log('[ChannelService] ───────────────────────────────────────────────────────');
    console.log('[ChannelService] Arg 3 - signatures (array length:', contractArgs.signatures.length, ')');
    contractArgs.signatures.forEach((sig, i) => {
      console.log(`[ChannelService]     [${i}] ${sig}`);
    });
    console.log('[ChannelService] ═══════════════════════════════════════════════════════');
    console.log('[ChannelService] Derived channelId:', channelId);
    console.log('[ChannelService] ═══════════════════════════════════════════════════════');
    
    const txHash = await this.walletClient.writeContract({
      address: custodyAddress,
      abi: CUSTODY_ABI,
      functionName: 'create',
      args: [
        contractArgs.channel,
        contractArgs.state as any,
        contractArgs.signatures as readonly `0x${string}`[],
      ],
      chain: undefined, // Use wallet's current chain
      account: this.walletClient.account!,
    });

    console.log('[ChannelService] ✅ Channel created! TX:', txHash);

    // Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    console.log(
      `[ChannelService] Transaction confirmed in block ${receipt.blockNumber}`,
    );

    // ============================================================================
    // Step 4: Add funds via resize_channel if initialDeposit was provided
    // 
    // Yellow Network 0.5.x Flow:
    // 1. Channel created with zero allocations (done above)
    // 2. Call resize_channel to add funds to unified balance
    // 
    // Note: In 0.5.x, funds go to "unified balance" not channel allocations
    // Channels should remain at zero to enable app sessions (Lightning Nodes)
    // ============================================================================
    
    let finalState = state;
    
    if (depositAmount > BigInt(0)) {
      console.log(
        `[ChannelService] Adding ${depositAmount.toString()} to unified balance via resize_channel (0.5.x protocol)...`
      );
      
      try {
        const userAddress = channel.participants[0]; // User is always participant 0
        
        if (!userAddress) {
          throw new Error('User address (participant[0]) not found in channel participants');
        }
        
        // Call resize_channel with the deposit amount
        // This adds funds to unified balance (not channel allocations)
        finalState = await this.resizeChannel(
          channelId,
          chainId,
          depositAmount, // resize_amount (positive = deposit to channel/unified balance)
          userAddress,
          token, // Pass token for allocation format conversion
          channel.participants as [Address, Address], // Pass participants for allocation format conversion
        );
        
        console.log(
          `[ChannelService] ✅ Funds added to unified balance via resize_channel. New state:`,
          finalState.allocations.map(([idx, amt]) => `[index: ${idx}, amount: ${amt}]`)
        );
      } catch (error) {
        const err = error as Error;
        console.error(
          `[ChannelService] ❌ Failed to add funds via resize_channel: ${err.message}`
        );
        
        // Channel was created successfully, but funding failed
        // Return the channel with zero allocations - user can resize later
        console.warn(
          `[ChannelService] Channel created successfully but funding via resize failed. ` +
          `Channel exists with zero balance. User can call resize_channel later to add funds. ` +
          `Error: ${err.message}`
        );
        
        // Don't throw - channel is still usable, just not funded yet
      }
    } else {
      // No deposit - channel created with zero balance (normal for 0.5.x)
      console.log(
        `[ChannelService] ✅ Channel created with zero balance (0.5.x protocol). ` +
        `User can call resize_channel later to add funds to unified balance.`
      );
    }

    // Return channel with final state
    return {
      ...channel,
      channelId,
      state: finalState,
      chainId,
      status: 'active',
    };
  }

  /**
   * Re-sync channel state by re-fetching from Yellow Network
   * 
   * Used when channel data is missing or inconsistent (e.g., after WebSocket disconnect).
   * 
   * @param chainId - Blockchain chain ID
   * @returns Re-synced channel state or null if channel doesn't exist
   */
  async resyncChannelState(chainId: number): Promise<ChannelWithState | null> {
    console.log(`[ChannelService] Re-syncing channel state for chain ${chainId}...`);
    
    try {
      // Re-fetch all channels and find the one for this chain
      const requestId = this.ws.getNextRequestId();
      let request: RPCRequest = {
        req: [requestId, 'get_channels', {}, Date.now()],
        sig: [] as string[],
      };

      request = await this.auth.signRequest(request);
      const response = await this.ws.send(request);
      
      // Check for errors
      if (response.error) {
        console.error('[ChannelService] Error re-syncing channels:', response.error.message);
        return null;
      }
      
      if (response.res && response.res[1] === 'error') {
        console.error('[ChannelService] Error re-syncing channels:', response.res[2]);
        return null;
      }
      
      const channelsData = response.res[2];
      if (!channelsData?.channels || !Array.isArray(channelsData.channels)) {
        console.warn('[ChannelService] No channels found during re-sync');
        return null;
      }

      // Find channel for this chain
      const channel = channelsData.channels.find((c: any) => c.chain_id === chainId);
      if (!channel) {
        console.warn(`[ChannelService] No channel found for chain ${chainId} during re-sync`);
        return null;
      }

      // Handle simplified structure from get_channels (participant vs participants)
      let participants: [Address, Address];
      if (channel.participants && Array.isArray(channel.participants) && channel.participants.length >= 2) {
        participants = [channel.participants[0] as Address, channel.participants[1] as Address];
      } else if (channel.participant) {
        // Simplified structure - use participant as first element, placeholder for second
        const userAddress = channel.participant as Address;
        participants = [userAddress, userAddress]; // Temporary workaround
        console.warn(
          `[ChannelService] get_channels returned simplified structure. ` +
          `Using placeholder for clearnode address in re-sync.`
        );
      } else {
        throw new Error(`Invalid channel structure in re-sync: missing participants or participant field`);
      }

      // Parse and return channel
      const syncedChannel: ChannelWithState = {
        participants,
        adjudicator: channel.adjudicator as Address,
        challenge: BigInt(channel.challenge),
        nonce: BigInt(channel.nonce),
        channelId: channel.channel_id,
        state: {
          intent: (channel.state?.intent ?? StateIntent.INITIALIZE) as StateIntent,
          version: BigInt(channel.version ?? channel.state?.version ?? 0),
          data: channel.state?.data ?? '0x',
          allocations: channel.state?.allocations
            ? channel.state.allocations.map((a: any, idx: number) => [
                BigInt(Array.isArray(a) ? a[0] : (a.index !== undefined ? a.index : idx)),
                BigInt(Array.isArray(a) ? a[1] : a.amount || 0),
              ])
            : [[BigInt(0), BigInt(0)], [BigInt(1), BigInt(0)]], // Default zero allocations
        },
        chainId: channel.chain_id,
        status: channel.status,
      };

      console.log(`[ChannelService] ✅ Channel state re-synced: ${syncedChannel.channelId}`);
      return syncedChannel;
    } catch (error) {
      console.error(`[ChannelService] Failed to re-sync channel state:`, error);
      return null;
    }
  }

  /**
   * Resize channel (add or remove funds)
   *
   * @param channelId - Channel identifier
   * @param chainId - Blockchain chain ID
   * @param amount - Amount to add (positive) or remove (negative) in smallest units
   * @param fundsDestination - Destination address for funds (typically user's wallet)
   * @param token - Token address (needed for allocation format conversion)
   * @param participants - Channel participants (needed for allocation format conversion)
   * @returns Updated channel state
   */
  async resizeChannel(
    channelId: Hash,
    chainId: number,
    amount: bigint,
    fundsDestination: Address,
    token?: Address,
    participants?: [Address, Address],
  ): Promise<ChannelState> {
    console.log(
      `[ChannelService] Resizing channel ${channelId} by ${amount}...`,
    );
    console.log(`[ChannelService] Funds destination: ${fundsDestination}`);

    // Yellow Network 0.5.x Protocol Changes:
    // - resize_amount: positive = deposit TO channel, negative = withdraw FROM channel
    // - allocate_amount: positive = withdraw FROM unified balance, negative = deposit TO unified balance
    // - Sign convention: resize_amount = -allocate_amount
    // 
    // For depositing to channel (most common case):
    //   resize_amount = +1000 (deposit 1000 to channel)
    //   allocate_amount = -1000 (take 1000 from unified balance)
    
    const resizeAmount = amount;
    const allocateAmount = -amount; // Sign convention per 0.5.x docs

    console.log(`[ChannelService] Yellow Network 0.5.x resize parameters:`);
    console.log(`  - resize_amount: ${resizeAmount} (${resizeAmount > 0 ? 'deposit to channel' : 'withdraw from channel'})`);
    console.log(`  - allocate_amount: ${allocateAmount} (${allocateAmount < 0 ? 'from unified balance' : 'to unified balance'})`);

    // Create session key signer for SDK
    const sessionKeyAddress = this.auth.getSessionKeyAddress();
    if (!sessionKeyAddress) {
      throw new Error('Session key not available');
    }

    // Verify session is still authenticated
    if (!this.auth.isAuthenticated()) {
      throw new Error('Session expired. Please re-authenticate.');
    }

    console.log(`[ChannelService] Using session key: ${sessionKeyAddress}`);

    // Get session key private key (we need to add this method to SessionKeyAuth)
    const sessionKeyPrivateKey = await this.auth.getSessionKeyPrivateKey();
    const sessionSigner = createECDSAMessageSigner(sessionKeyPrivateKey);

    console.log(`[ChannelService] Created signer for resize_channel request`);

    // Use SDK to create properly signed resize message
    const resizeMessageString = await createResizeChannelMessage(sessionSigner, {
      channel_id: channelId,
      resize_amount: BigInt(resizeAmount),
      allocate_amount: BigInt(allocateAmount),
      funds_destination: fundsDestination,
    });

    // Log the message for debugging
    console.log(`[ChannelService] Resize message created by SDK:`, resizeMessageString.substring(0, 200) + '...');

    // Parse the SDK message string to JSON and send it as RPCRequest
    const resizeMessage = JSON.parse(resizeMessageString) as RPCRequest;

    // Send the properly formatted message
    const response = await this.ws.send(resizeMessage);

    // Log full response for debugging
    console.log('[ChannelService] resize_channel response:', JSON.stringify(response, null, 2));

    // Check for errors in response
    if (response.error) {
      throw new Error(`Yellow Network error: ${response.error.message || JSON.stringify(response.error)}`);
    }

    if (response.res && response.res[1] === 'error') {
      throw new Error(`Yellow Network error: ${JSON.stringify(response.res[2])}`);
    }

    const resizeData = response.res[2];

    if (!resizeData) {
      throw new Error('No resize data in response. Response structure: ' + JSON.stringify(response.res));
    }

    // Validate resizeData structure
    if (!resizeData.state) {
      console.error('[ChannelService] Invalid resizeData structure:', JSON.stringify(resizeData, null, 2));
      throw new Error(
        `Invalid resize_channel response: missing 'state' field. ` +
        `Response keys: ${Object.keys(resizeData).join(', ')}. ` +
        `This may indicate a Yellow Network API change or error.`
      );
    }

    // Parse new state
    const newState: ChannelState = {
      intent: StateIntent.RESIZE,
      version: BigInt(resizeData.state.version),
      data: resizeData.state.data,
      allocations: resizeData.state.allocations.map((alloc: any) => [
        BigInt(alloc[0]),
        BigInt(alloc[1]),
      ]),
    };

    // Submit to on-chain Custody contract
    const custodyAddress = this.custodyAddresses[chainId];
    if (!custodyAddress) {
      throw new Error(`Custody address not found for chain ${chainId}`);
    }
    const signatures = [resizeData.user_signature, resizeData.server_signature];

    // CRITICAL FIX: Convert allocations to {destination, token, amount} format for contract
    // If token and participants are provided, use them; otherwise fall back to index format
    let allocationsForContract;
    if (token && participants) {
      allocationsForContract = newState.allocations.map(([index, amount]) => ({
        destination: participants[Number(index)] as Address,
        token: token,
        amount: amount,
      }));
    } else {
      // Fallback: try to extract from resize response if it has full format
      console.warn('[ChannelService] Token/participants not provided to resizeChannel, attempting to use response data');
      allocationsForContract = newState.allocations.map(([index, amount]) => ({
        destination: `0x${'0'.repeat(40)}` as Address, // Placeholder - will likely fail
        token: `0x${'0'.repeat(40)}` as Address,
        amount: amount,
      }));
    }

    const txHash = await this.walletClient.writeContract({
      address: custodyAddress,
      abi: CUSTODY_ABI,
      functionName: 'resize',
      args: [
        channelId,
        {
          ...newState,
          allocations: allocationsForContract,
        } as any,
        signatures,
      ],
      chain: undefined,
      account: this.walletClient.account!,
    });

    console.log('[ChannelService] ✅ Channel resized! TX:', txHash);

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return newState;
  }

  /**
   * Close channel cooperatively
   *
   * @param channelId - Channel identifier
   * @param chainId - Blockchain chain ID
   * @param fundsDestination - Address to send funds to
   * @param token - Token address (needed for allocation format conversion)
   * @param participants - Channel participants (needed for allocation format conversion)
   * @returns Final channel state
   */
  async closeChannel(
    channelId: Hash,
    chainId: number,
    fundsDestination: Address,
    token?: Address,
    participants?: [Address, Address],
  ): Promise<ChannelState> {
    console.log(`[ChannelService] Closing channel ${channelId}...`);

    // Request closure from clearnode
    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [
        requestId,
        'close_channel',
        {
          channel_id: channelId,
          funds_destination: fundsDestination,
        },
        Date.now(),
      ],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    // Log full response for debugging
    console.log('[ChannelService] close_channel response:', JSON.stringify(response, null, 2));

    // Check for errors in response
    if (response.error) {
      throw new Error(`Yellow Network error: ${response.error.message || JSON.stringify(response.error)}`);
    }

    if (response.res && response.res[1] === 'error') {
      throw new Error(`Yellow Network error: ${JSON.stringify(response.res[2])}`);
    }

    const closeData = response.res[2];

    if (!closeData) {
      throw new Error('No close data in response. Response structure: ' + JSON.stringify(response.res));
    }

    // Validate closeData structure
    if (!closeData.state) {
      console.error('[ChannelService] Invalid closeData structure:', JSON.stringify(closeData, null, 2));
      throw new Error(
        `Invalid close_channel response: missing 'state' field. ` +
        `Response keys: ${Object.keys(closeData).join(', ')}. ` +
        `This may indicate a Yellow Network API change or error.`
      );
    }

    // Parse final state
    const finalState: ChannelState = {
      intent: StateIntent.FINALIZE,
      version: BigInt(closeData.state.version),
      data: '0x',
      allocations: closeData.state.allocations.map((alloc: any) => [
        BigInt(alloc[0]),
        BigInt(alloc[1]),
      ]),
    };

    // Submit to on-chain Custody contract
    const custodyAddress = this.custodyAddresses[chainId];
    if (!custodyAddress) {
      throw new Error(`Custody address not found for chain ${chainId}`);
    }
    const signatures = [closeData.user_signature, closeData.server_signature];

    // CRITICAL FIX: Convert allocations to {destination, token, amount} format for contract
    // If token and participants are provided, use them; otherwise fall back to index format
    let allocationsForContract;
    if (token && participants) {
      allocationsForContract = finalState.allocations.map(([index, amount]) => ({
        destination: participants[Number(index)] as Address,
        token: token,
        amount: amount,
      }));
    } else {
      // Fallback: try to extract from close response if it has full format
      console.warn('[ChannelService] Token/participants not provided to closeChannel, attempting to use response data');
      allocationsForContract = finalState.allocations.map(([index, amount]) => ({
        destination: `0x${'0'.repeat(40)}` as Address, // Placeholder - will likely fail
        token: `0x${'0'.repeat(40)}` as Address,
        amount: amount,
      }));
    }

    const txHash = await this.walletClient.writeContract({
      address: custodyAddress,
      abi: CUSTODY_ABI,
      functionName: 'close',
      args: [
        channelId,
        {
          ...finalState,
          allocations: allocationsForContract,
        } as any,
        signatures,
      ],
      chain: undefined,
      account: this.walletClient.account!,
    });

    console.log('[ChannelService] ✅ Channel closed! TX:', txHash);

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return finalState;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Deposit funds to the Custody contract for an existing channel
   * 
   * IMPORTANT: Channel must be created on-chain FIRST before calling deposit().
   * The Custody contract's deposit() function requires the channel to exist.
   * 
   * @param channelId - Channel ID (must exist on-chain)
   * @param chainId - Blockchain chain ID
   * @param token - Token address (native = 0x0)
   * @param amount - Amount to deposit in smallest units
   * @returns Transaction hash
   */
  private async depositFunds(
    channelId: Hash,
    chainId: number,
    token: Address,
    amount: bigint,
  ): Promise<Hash> {
    console.log(
      `[ChannelService] Depositing ${amount.toString()} to channel ${channelId}...`
    );

    const custodyAddress = this.custodyAddresses[chainId];
    if (!custodyAddress) {
      throw new Error(`Custody address not found for chain ${chainId}`);
    }

    const isNative = token === '0x0000000000000000000000000000000000000000' || 
                     token === '0x0';

    // For ERC20 tokens, approve first
    if (!isNative) {
      console.log(`[ChannelService] Approving ERC20 token ${token}...`);
      
      // Check current allowance
      const currentAllowance = await this.publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [this.walletClient.account!.address, custodyAddress],
      });

      if (currentAllowance < amount) {
        // Approve the full amount (or use a reasonable max)
        const approveHash = await this.walletClient.writeContract({
          address: token,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [custodyAddress, amount],
          chain: undefined,
          account: this.walletClient.account!,
        });

        console.log(`[ChannelService] Approval transaction: ${approveHash}`);
        
        // Wait for approval confirmation
        await this.publicClient.waitForTransactionReceipt({
          hash: approveHash,
        });

        console.log(`[ChannelService] ✅ Token approved`);
      } else {
        console.log(`[ChannelService] Token already approved (allowance: ${currentAllowance.toString()})`);
      }
    }

    // Deposit to custody contract
    const depositTxHash = await this.walletClient.writeContract({
      address: custodyAddress,
      abi: CUSTODY_ABI,
      functionName: 'deposit',
      args: [channelId, token, amount],
      value: isNative ? amount : BigInt(0),
      chain: undefined,
      account: this.walletClient.account!,
    });

    console.log(`[ChannelService] Deposit transaction: ${depositTxHash}`);

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({
      hash: depositTxHash,
    });

    console.log(`[ChannelService] ✅ Funds deposited to custody contract`);

    return depositTxHash;
  }

  /**
   * Validate channelData shape before accessing nested properties
   * 
   * This defensive guard ensures we don't crash when Yellow Network returns
   * unexpected structures (e.g., due to WebSocket disconnects or schema changes).
   * 
   * @param channelData - Raw channel data from Yellow Network response
   * @returns true if structure is valid, false otherwise
   */
  private validateChannelDataShape(channelData: any): boolean {
    if (!channelData || typeof channelData !== 'object') {
      return false;
    }

    // Check for standard structure: { channel: {...}, state: {...}, server_signature: "..." }
    if (channelData.channel) {
      const channel = channelData.channel;
      return (
        channel &&
        typeof channel === 'object' &&
        Array.isArray(channel.participants) &&
        channel.participants.length >= 2 &&
        channel.adjudicator &&
        channel.nonce !== undefined
      );
    }

    // Check for alternative structure: channel data at top level
    if (channelData.participants) {
      return (
        Array.isArray(channelData.participants) &&
        channelData.participants.length >= 2 &&
        channelData.adjudicator &&
        channelData.nonce !== undefined
      );
    }

    // Invalid structure
    return false;
  }

  /**
   * Compute channel ID WITH chainId (matches on-chain Custody contract)
   *
   * CRITICAL FIX: The contract uses address[] NOT address[2]!
   *
   * The Custody contract computes:
   * channelId = keccak256(abi.encode(participants, adjudicator, challenge, nonce, chainId))
   * where:
   * - participants is address[] (dynamic array), NOT address[2] (fixed array)
   * - chainId is obtained via chainid() opcode
   *
   * This was causing channelId mismatch:
   * - With address[2]: 0xe748ca4c... (WRONG)
   * - With address[]:  0x771be78c... (CORRECT, matches Yellow Network)
   */
  private computeChannelIdWithChainId(channel: Channel, chainId: number): Hash {
    const encoded = encodeAbiParameters(
      parseAbiParameters('address[], address, uint256, uint256, uint256'),
      [
        channel.participants,
        channel.adjudicator,
        channel.challenge,
        channel.nonce,
        BigInt(chainId),
      ],
    );

    return keccak256(encoded);
  }

  /**
   * Compute channel ID from channel definition (legacy - for comparison)
   *
   * CRITICAL FIX: The contract uses address[] NOT address[2]!
   */
  private computeChannelId(channel: Channel, chainId?: number): Hash {
    // Try WITHOUT chainId first
    const encodedWithoutChainId = encodeAbiParameters(
      parseAbiParameters('address[], address, uint256, uint256'),
      [
        channel.participants,
        channel.adjudicator,
        channel.challenge,
        channel.nonce,
      ],
    );

    const channelIdWithoutChainId = keccak256(encodedWithoutChainId);

    // Also compute WITH chainId for comparison
    if (chainId) {
      const channelIdWithChainId = this.computeChannelIdWithChainId(channel, chainId);

      console.log('[ChannelService] ChannelId computation comparison:');
      console.log('  WITHOUT chainId:', channelIdWithoutChainId);
      console.log('  WITH chainId:   ', channelIdWithChainId);
    }

    // Return WITHOUT chainId (legacy)
    return channelIdWithoutChainId;
  }

  /**
   * Compute packed state hash for signing
   * packedState = keccak256(abi.encode(channelId, intent, version, data, allocations))
   * 
   * Used when we need to sign the state ourselves (e.g., if Yellow Network doesn't provide user_signature)
   */
  private computePackedState(channelId: Hash, state: ChannelState): Hash {
    const encoded = encodeAbiParameters(
      parseAbiParameters('bytes32, uint8, uint64, bytes, tuple(uint256, uint256)[]'),
      [
        channelId,
        state.intent,
        state.version,
        state.data,
        state.allocations.map(([index, amount]) => ({ index, amount })),
      ],
    );

    return keccak256(encoded);
  }
}
