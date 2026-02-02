/**
 * Yellow Network SDK-Based Channel Service
 *
 * This service wraps the official @erc7824/nitrolite SDK to provide
 * channel management functionality with correct channelId computation.
 *
 * Key differences from our custom implementation:
 * - Uses SDK's WalletStateSigner for state signing
 * - SDK handles channelId computation internally
 * - SDK handles all state hash creation and signature generation
 * - Proven to work with Yellow Network's RPC and contracts
 */

import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import { NitroliteClient, WalletStateSigner } from '@erc7824/nitrolite';
import type { WebSocketManager } from './websocket-manager.js';
import type { SessionKeyAuth } from './session-auth.js';
import type {
  Channel,
  ChannelState,
  ChannelWithState,
  RPCRequest,
} from './types.js';
import { StateIntent } from './types.js';

/**
 * SDK-Based Channel Service
 *
 * Wraps the Yellow Network SDK for channel operations
 */
export class SDKChannelService {
  private ws: WebSocketManager;
  private auth: SessionKeyAuth;
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private sdkClient: NitroliteClient;
  private custodyAddresses: Record<number, Address>;

  constructor(
    ws: WebSocketManager,
    auth: SessionKeyAuth,
    publicClient: PublicClient,
    walletClient: WalletClient,
    custodyAddresses: Record<number, Address>,
    adjudicatorAddress: Address,
    chainId: number,
  ) {
    this.ws = ws;
    this.auth = auth;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.custodyAddresses = custodyAddresses;

    // Initialize SDK Client
    const custodyAddress = custodyAddresses[chainId];
    if (!custodyAddress) {
      throw new Error(`Custody address not found for chain ${chainId}`);
    }

    console.log('[SDKChannelService] Initializing Yellow Network SDK');
    console.log(`[SDKChannelService] Chain ID: ${chainId}`);
    console.log(`[SDKChannelService] Custody: ${custodyAddress}`);
    console.log(`[SDKChannelService] Adjudicator: ${adjudicatorAddress}`);

    this.sdkClient = new NitroliteClient({
      publicClient,
      walletClient: this.walletClient as any, // SDK type inference
      stateSigner: new WalletStateSigner(this.walletClient as any),
      addresses: {
        custody: custodyAddress,
        adjudicator: adjudicatorAddress,
      },
      chainId,
      challengeDuration: 3600n, // 1 hour
    });

    console.log('[SDKChannelService] ✅ SDK initialized successfully');
  }

  /**
   * Create a new 2-party payment channel using the SDK
   *
   * @param chainId - Blockchain chain ID
   * @param token - Token address
   * @param initialDeposit - Optional initial deposit (NOT USED in 0.5.x, channels created with zero balance)
   * @returns Created channel with ID and state
   */
  async createChannel(
    chainId: number,
    token: Address,
    initialDeposit?: bigint,
  ): Promise<ChannelWithState> {
    console.log(`[SDKChannelService] Creating channel on chain ${chainId}...`);

    // Check authentication
    if (!this.auth.isAuthenticated()) {
      throw new Error('Session key not authenticated');
    }

    // Step 1: Request channel creation from Yellow Network
    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [
        requestId,
        'create_channel',
        { chain_id: chainId, token },
        Date.now(),
      ],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    // Check for errors
    if (response.error) {
      throw new Error(`Yellow Network error: ${response.error.message}`);
    }

    if (response.res && response.res[1] === 'error') {
      throw new Error(`Yellow Network error: ${JSON.stringify(response.res[2])}`);
    }

    const channelData = response.res[2];
    if (!channelData) {
      throw new Error('No channel data in response');
    }

    console.log('[SDKChannelService] Received channel data from Yellow Network');
    console.log('[SDKChannelService] Raw response keys:', Object.keys(channelData));
    console.log('[SDKChannelService] Channel ID (from Yellow):', channelData.channel_id || channelData.channelId);
    
    // Log FULL channelData to see exact structure from Yellow Network
    console.log('[SDKChannelService] FULL channelData from Yellow Network:');
    console.log(JSON.stringify(channelData, null, 2));

    // Step 2: Parse channel and state from response
    // Handle both camelCase and snake_case field names from Yellow Network
    const channel = channelData.channel;
    const state = channelData.state;
    // Try both serverSignature (camelCase) and server_signature (snake_case)
    const serverSignature = channelData.serverSignature || channelData.server_signature;

    if (!channel || !state || !serverSignature) {
      console.error('[SDKChannelService] Missing data in response:');
      console.error('  channel:', !!channel);
      console.error('  state:', !!state);
      console.error('  serverSignature:', !!serverSignature);
      console.error('  Full channelData:', JSON.stringify(channelData, null, 2));
      throw new Error('Invalid channel data structure');
    }

    // Log state field names to debug camelCase vs snake_case
    console.log('[SDKChannelService] State object keys:', Object.keys(state));
    console.log('[SDKChannelService] State raw values:');
    console.log('  state.stateData:', state.stateData);
    console.log('  state.state_data:', state.state_data);
    console.log('  state.data:', state.data);

    // Step 3: Build unsigned initial state
    // Try stateData (camelCase from tutorial) first, then snake_case, then 'data'
    const stateDataValue = state.stateData || state.state_data || state.data || '0x';
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
    
    console.log('[SDKChannelService] Using stateData value:', stateDataValue);

    console.log('[SDKChannelService] Channel parameters:');
    console.log('  Participants:', channel.participants);
    console.log('  Adjudicator:', channel.adjudicator);
    console.log('  Challenge:', channel.challenge);
    console.log('  Nonce:', channel.nonce);

    console.log('[SDKChannelService] Initial state:');
    console.log('  Intent:', unsignedInitialState.intent);
    console.log('  Version:', unsignedInitialState.version.toString());
    console.log('  Data:', unsignedInitialState.data);
    console.log('  Allocations:', unsignedInitialState.allocations.length);

    // Step 4: Use SDK to create channel on-chain
    console.log('[SDKChannelService] Calling SDK createChannel()...');
    
    // Build the channel object exactly as SDK expects
    // Convert challenge and nonce to bigint as required by SDK
    const channelForSDK = {
      participants: channel.participants as [Address, Address],
      adjudicator: channel.adjudicator as Address,
      challenge: BigInt(channel.challenge),
      nonce: BigInt(channel.nonce),
    };
    
    console.log('[SDKChannelService] SDK Channel object:', JSON.stringify({
      ...channelForSDK,
      challenge: channelForSDK.challenge.toString(),
      nonce: channelForSDK.nonce.toString(),
    }, null, 2));
    console.log('[SDKChannelService] SDK unsignedInitialState:', JSON.stringify({
      ...unsignedInitialState,
      version: unsignedInitialState.version.toString(),
      allocations: unsignedInitialState.allocations.map(a => ({
        ...a,
        amount: a.amount.toString(),
      })),
    }, null, 2));
    console.log('[SDKChannelService] Server signature:', serverSignature);
    
    // Debug: Check wallet client account address vs participants[0]
    const walletClientAccount = (this.walletClient as any).account;
    console.log('[SDKChannelService] DEBUG - Address comparison:');
    console.log('  walletClient.account.address:', walletClientAccount?.address);
    console.log('  participants[0]:', channelForSDK.participants[0]);
    console.log('  Address match (strict):', walletClientAccount?.address === channelForSDK.participants[0]);
    console.log('  Address match (lowercase):', walletClientAccount?.address?.toLowerCase() === channelForSDK.participants[0].toLowerCase());
    
    // Debug: Check channelId computation
    // Import from SDK or compute manually to compare with Yellow Network's channel_id
    const { encodeAbiParameters, keccak256 } = await import('viem');
    const computedChannelId = keccak256(encodeAbiParameters(
      [
        { name: 'participants', type: 'address[]' },
        { name: 'adjudicator', type: 'address' },
        { name: 'challenge', type: 'uint64' },
        { name: 'nonce', type: 'uint64' },
        { name: 'chainId', type: 'uint256' },
      ],
      [channelForSDK.participants, channelForSDK.adjudicator, channelForSDK.challenge, channelForSDK.nonce, BigInt(chainId)]
    ));
    console.log('[SDKChannelService] DEBUG - ChannelId comparison:');
    console.log('  Yellow Network channel_id:', channelData.channel_id);
    console.log('  SDK computed channelId:   ', computedChannelId);
    console.log('  ChannelIds match:', channelData.channel_id === computedChannelId);
    
    // Debug: Compute state hash to see what Yellow Network signed
    const stateHash = keccak256(encodeAbiParameters(
      [
        { name: 'channelId', type: 'bytes32' },
        { name: 'intent', type: 'uint8' },
        { name: 'version', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'allocations', type: 'tuple[]', components: [
          { name: 'destination', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ]},
      ],
      [
        computedChannelId,
        unsignedInitialState.intent,
        unsignedInitialState.version,
        unsignedInitialState.data as `0x${string}`,
        unsignedInitialState.allocations,
      ]
    ));
    console.log('[SDKChannelService] DEBUG - State hash computation:');
    console.log('  State hash:', stateHash);
    console.log('  This is what Yellow Network signed with server_signature');
    
    // Debug: Verify signatures to see who actually signed
    const { recoverMessageAddress } = await import('viem');
    try {
      const recoveredFromServerSig = await recoverMessageAddress({
        message: { raw: stateHash },
        signature: serverSignature as `0x${string}`,
      });
      console.log('[SDKChannelService] DEBUG - Server signature verification:');
      console.log('  Recovered address:', recoveredFromServerSig);
      console.log('  Expected (clearnode):', channelForSDK.participants[1]); // participants[1] is clearnode
      console.log('  Match:', recoveredFromServerSig.toLowerCase() === channelForSDK.participants[1].toLowerCase());
    } catch (error: any) {
      console.error('[SDKChannelService] ERROR - Failed to recover address from server signature:', error.message);
    }

    const result = await this.sdkClient.createChannel({
      channel: channelForSDK,
      unsignedInitialState,
      serverSignature: serverSignature as `0x${string}`,
    });

    console.log('[SDKChannelService] ✅ Channel created successfully!');
    console.log('[SDKChannelService] Channel ID:', result.channelId);
    console.log('[SDKChannelService] Transaction:', result.txHash);

    // Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: result.txHash,
    });

    console.log(`[SDKChannelService] Confirmed in block ${receipt.blockNumber}`);

    // Step 5: If initialDeposit provided, resize channel
    if (initialDeposit && initialDeposit > BigInt(0)) {
      console.log(`[SDKChannelService] Adding ${initialDeposit} via resize_channel...`);

      const userAddress = channel.participants[0] as Address;
      await this.resizeChannel(
        result.channelId as Hash,
        chainId,
        initialDeposit,
        userAddress,
        token,
        [channel.participants[0] as Address, channel.participants[1] as Address],
      );
    }

    // Return channel with state
    return {
      participants: [
        channel.participants[0] as Address,
        channel.participants[1] as Address,
      ],
      adjudicator: channel.adjudicator as Address,
      challenge: BigInt(channel.challenge),
      nonce: BigInt(channel.nonce),
      channelId: result.channelId as Hash,
      state: {
        intent: result.initialState.intent as StateIntent,
        version: result.initialState.version,
        data: result.initialState.data,
        allocations: result.initialState.allocations.map((a: any) => [
          BigInt(0), // Index 0 for first participant
          a.amount,
        ]),
      },
      chainId,
      status: 'active',
    };
  }

  /**
   * Resize channel (add or remove funds)
   *
   * @param channelId - Channel identifier
   * @param chainId - Blockchain chain ID
   * @param amount - Amount to add (positive) or remove (negative)
   * @param fundsDestination - Destination address for funds
   * @param token - Token address
   * @param participants - Channel participants
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
    console.log(`[SDKChannelService] Resizing channel ${channelId}...`);

    // Request resize from Yellow Network
    const resizeAmount = amount;
    const allocateAmount = -amount; // Sign convention

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [
        requestId,
        'resize_channel',
        {
          channel_id: channelId,
          resize_amount: resizeAmount.toString(),
          allocate_amount: allocateAmount.toString(),
          funds_destination: fundsDestination,
        },
        Date.now(),
      ],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    if (response.error) {
      throw new Error(`Yellow Network error: ${response.error.message || JSON.stringify(response.error)}`);
    }

    if (response.res && response.res[1] === 'error') {
      throw new Error(`Yellow Network error: ${JSON.stringify(response.res[2])}`);
    }

    const resizeData = response.res[2];
    if (!resizeData || !resizeData.state) {
      throw new Error('Invalid resize response');
    }

    // Build resize state for SDK
    const resizeState = {
      channelId: channelId as `0x${string}`,
      intent: resizeData.state.intent,
      version: BigInt(resizeData.state.version),
      data: resizeData.state.data || resizeData.state.state_data || '0x',
      allocations: resizeData.state.allocations.map((a: any) => ({
        destination: a.destination as Address,
        token: a.token as Address,
        amount: BigInt(a.amount || 0),
      })),
      serverSignature: resizeData.server_signature as `0x${string}`,
    };

    console.log('[SDKChannelService] Calling SDK resizeChannel()...');

    const result = await this.sdkClient.resizeChannel({
      resizeState,
      proofStates: [], // No proof states needed for cooperative resize
    });

    console.log('[SDKChannelService] ✅ Channel resized!');
    console.log('[SDKChannelService] Transaction:', result.txHash);

    await this.publicClient.waitForTransactionReceipt({ hash: result.txHash });

    return {
      intent: result.resizeState.intent as StateIntent,
      version: result.resizeState.version,
      data: result.resizeState.data,
      allocations: resizeData.state.allocations.map((a: any, idx: number) => [
        BigInt(idx),
        BigInt(a.amount || 0),
      ]),
    };
  }

  /**
   * Close channel cooperatively
   *
   * @param channelId - Channel identifier
   * @param chainId - Blockchain chain ID
   * @param fundsDestination - Address to send funds to
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

    // Request closure from Yellow Network
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

    if (response.error) {
      throw new Error(`Yellow Network error: ${response.error.message || JSON.stringify(response.error)}`);
    }

    if (response.res && response.res[1] === 'error') {
      throw new Error(`Yellow Network error: ${JSON.stringify(response.res[2])}`);
    }

    const closeData = response.res[2];
    if (!closeData || !closeData.state) {
      throw new Error('Invalid close response');
    }

    // Build final state for SDK
    const finalState = {
      channelId: channelId as `0x${string}`,
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

    console.log('[SDKChannelService] Calling SDK closeChannel()...');

    const txHash = await this.sdkClient.closeChannel({
      finalState,
      stateData: '0x',
    });

    console.log('[SDKChannelService] ✅ Channel closed!');
    console.log('[SDKChannelService] Transaction:', txHash);

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

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
   * Re-sync channel state by re-fetching from Yellow Network
   */
  async resyncChannelState(chainId: number): Promise<ChannelWithState | null> {
    console.log(`[SDKChannelService] Re-syncing channel state for chain ${chainId}...`);

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [requestId, 'get_channels', {}, Date.now()],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    if (response.error || (response.res && response.res[1] === 'error')) {
      return null;
    }

    const channelsData = response.res[2];
    if (!channelsData?.channels || !Array.isArray(channelsData.channels)) {
      return null;
    }

    const channel = channelsData.channels.find((c: any) => c.chain_id === chainId);
    if (!channel) {
      return null;
    }

    // Parse channel (simplified structure from get_channels)
    const participants: [Address, Address] = channel.participants
      ? [channel.participants[0] as Address, channel.participants[1] as Address]
      : [channel.participant as Address, channel.participant as Address];

    return {
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
              BigInt(idx),
              BigInt(a.amount || 0),
            ])
          : [[BigInt(0), BigInt(0)], [BigInt(1), BigInt(0)]],
      },
      chainId: channel.chain_id,
      status: channel.status,
    };
  }
}
