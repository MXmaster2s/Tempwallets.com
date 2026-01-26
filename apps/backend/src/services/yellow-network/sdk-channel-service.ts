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
   * Yellow Network Flow (per Yellow team guidance):
   * 1. Deposit funds to Custody contract (if initialDeposit provided)
   * 2. Request channel creation from Yellow Network (off-chain RPC)
   * 3. Create channel on-chain using SDK (handles signatures correctly)
   * 4. Resize channel to move funds to off-chain unified balance
   *
   * @param chainId - Blockchain chain ID
   * @param token - Token address
   * @param initialDeposit - Optional initial deposit amount
   * @returns Created channel with ID and state
   */
  async createChannel(
    chainId: number,
    token: Address,
    initialDeposit?: bigint,
  ): Promise<ChannelWithState> {
    console.log(`[SDKChannelService] Creating channel on chain ${chainId}...`);
    console.log(`[SDKChannelService] Token: ${token}`);
    console.log(`[SDKChannelService] Initial deposit: ${initialDeposit?.toString() || '0'}`);

    // Check authentication
    if (!this.auth.isAuthenticated()) {
      throw new Error('Session key not authenticated. Please call authenticate() first.');
    }

    // ============================================================================
    // Step 0: Deposit funds to Custody contract FIRST (Yellow team recommendation)
    // ============================================================================
    // Yellow team: "In order to move funds in and out of the yellow clearnode
    // you [use] the Custody contract to create a channel, deposit to the channel,
    // and resize the channel."
    //
    // The SDK's deposit() method deposits to the user's account in the Custody contract.
    // This must happen BEFORE channel creation if we want funds available.
    // ============================================================================

    if (initialDeposit && initialDeposit > BigInt(0)) {
      console.log('[SDKChannelService] ═══════════════════════════════════════════════════════');
      console.log('[SDKChannelService] Step 0: Depositing funds to Custody contract');
      console.log('[SDKChannelService] ═══════════════════════════════════════════════════════');

      try {
        // Step 0a: Check and approve token allowance
        console.log('[SDKChannelService] Checking token allowance...');
        const currentAllowance = await this.sdkClient.getTokenAllowance(token);
        console.log(`[SDKChannelService] Current allowance: ${currentAllowance.toString()}`);

        if (currentAllowance < initialDeposit) {
          console.log(`[SDKChannelService] Approving ${initialDeposit.toString()} tokens...`);
          const approveHash = await this.sdkClient.approveTokens(token, initialDeposit);
          console.log(`[SDKChannelService] Approval tx: ${approveHash}`);

          const approveReceipt = await this.publicClient.waitForTransactionReceipt({
            hash: approveHash
          });
          console.log(`[SDKChannelService] ✅ Approval confirmed in block ${approveReceipt.blockNumber}`);
        } else {
          console.log('[SDKChannelService] ✅ Sufficient allowance already exists');
        }

        // Step 0b: Deposit to Custody contract
        console.log(`[SDKChannelService] Depositing ${initialDeposit.toString()} to Custody...`);
        const depositHash = await this.sdkClient.deposit(token, initialDeposit);
        console.log(`[SDKChannelService] Deposit tx: ${depositHash}`);

        const depositReceipt = await this.publicClient.waitForTransactionReceipt({
          hash: depositHash
        });
        console.log(`[SDKChannelService] ✅ Deposit confirmed in block ${depositReceipt.blockNumber}`);

        // Verify account balance in custody
        const accountBalance = await this.sdkClient.getAccountBalance(token);
        console.log(`[SDKChannelService] ✅ Account balance in Custody: ${accountBalance.toString()}`);

      } catch (depositError) {
        const err = depositError as Error;
        console.error('[SDKChannelService] ❌ Failed to deposit to Custody:', err.message);
        throw new Error(
          `Failed to deposit funds to Custody contract: ${err.message}. ` +
          `Ensure you have sufficient ${token} balance and the token is approved.`
        );
      }
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
    console.log('[SDKChannelService] Channel ID:', channelData.channel_id);

    // Step 2: Parse channel and state from response
    // Note: Yellow Network may use different field naming conventions
    // SDK tutorial uses: channel, state, serverSignature (camelCase)
    // Yellow Network RPC may use: channel, state, server_signature (snake_case)
    const channel = channelData.channel;
    const state = channelData.state;
    // Handle both camelCase (SDK tutorial) and snake_case (Yellow Network RPC)
    const serverSignature = channelData.serverSignature || channelData.server_signature;

    if (!channel || !state || !serverSignature) {
      console.error('[SDKChannelService] Invalid channel data structure:');
      console.error('  channel:', !!channel);
      console.error('  state:', !!state);
      console.error('  serverSignature:', !!serverSignature);
      console.error('  Raw channelData keys:', Object.keys(channelData));
      throw new Error('Invalid channel data structure from Yellow Network');
    }

    // Step 3: Build unsigned initial state
    // Per SDK tutorial: https://github.com/stevenzeiler/yellow-sdk-tutorials/blob/main/scripts/create_channel.ts
    // The state data field can be named: stateData (SDK), state_data (RPC), or data
    const stateData = state.stateData || state.state_data || state.data || '0x';

    // Build allocations - ensure proper BigInt conversion for amounts
    // SDK expects: { destination: Address, token: Address, amount: bigint }
    const allocations = state.allocations.map((a: any) => ({
      destination: (a.destination || a.participant) as Address,
      token: a.token as Address,
      amount: BigInt(a.amount || '0'),
    }));

    const unsignedInitialState = {
      intent: state.intent as number,
      version: BigInt(state.version),
      data: stateData as `0x${string}`,
      allocations,
    };

    // Log channel details (matching SDK tutorial format)
    console.log('[SDKChannelService] 📋 Channel Details from Yellow Network:');
    console.log('  Participants:', channel.participants);
    console.log('  Adjudicator:', channel.adjudicator);
    console.log('  Challenge:', channel.challenge);
    console.log('  Nonce:', channel.nonce);

    console.log('[SDKChannelService] 📋 Initial State:');
    console.log('  Intent:', unsignedInitialState.intent, `(${unsignedInitialState.intent === 1 ? 'INITIALIZE' : 'OTHER'})`);
    console.log('  Version:', unsignedInitialState.version.toString());
    console.log('  Data:', unsignedInitialState.data);
    console.log('  Allocations:');
    unsignedInitialState.allocations.forEach((a, i) => {
      console.log(`    [${i}] ${a.destination}: ${a.amount.toString()} of ${a.token}`);
    });
    console.log('  Server Signature:', serverSignature.slice(0, 20) + '...');

    // Step 4: Use SDK to create channel on-chain
    // Per SDK tutorial: https://github.com/stevenzeiler/yellow-sdk-tutorials/blob/main/scripts/create_channel.ts
    // The SDK's createChannel handles:
    // - Correct state hash computation
    // - Proper signature formatting
    // - ABI encoding that matches the Custody contract
    console.log('[SDKChannelService] 🧬 Calling SDK createChannel() for on-chain creation...');

    // Build channel object matching SDK's Channel type
    const channelForSDK = {
      participants: [
        channel.participants[0] as Address,
        channel.participants[1] as Address,
      ] as [Address, Address],
      adjudicator: channel.adjudicator as Address,
      challenge: BigInt(channel.challenge),
      nonce: BigInt(channel.nonce),
    };

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

    // ============================================================================
    // Step 5: Resize channel to move funds to off-chain unified balance
    // ============================================================================
    // Yellow team: "Once resize is performed you will have funds available in
    // your off-chain balance ready to use in app sessions."
    //
    // This moves funds from the on-chain Custody contract to the off-chain
    // Yellow Network unified balance, enabling gasless operations.
    // ============================================================================

    if (initialDeposit && initialDeposit > BigInt(0)) {
      console.log('[SDKChannelService] ═══════════════════════════════════════════════════════');
      console.log('[SDKChannelService] Step 5: Resizing channel to move funds off-chain');
      console.log('[SDKChannelService] ═══════════════════════════════════════════════════════');
      console.log(`[SDKChannelService] Moving ${initialDeposit.toString()} to unified balance...`);

      try {
        const userAddress = channel.participants[0] as Address;
        await this.resizeChannel(
          result.channelId as Hash,
          chainId,
          initialDeposit,
          userAddress,
          token,
          [channel.participants[0] as Address, channel.participants[1] as Address],
        );
        console.log('[SDKChannelService] ✅ Funds now available in off-chain unified balance!');
      } catch (resizeError) {
        const err = resizeError as Error;
        console.error('[SDKChannelService] ⚠️ Resize failed:', err.message);
        console.log('[SDKChannelService] Channel created but funds not yet in unified balance.');
        console.log('[SDKChannelService] You can call resizeChannel() manually to complete the transfer.');
        // Don't throw - channel was created successfully, resize can be retried
      }
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
   * Deposit funds to Custody contract
   *
   * This is the FIRST step in the Yellow Network flow when adding funds.
   * After depositing, you must call resizeChannel() to move funds to
   * the off-chain unified balance.
   *
   * Yellow Network Flow:
   * 1. depositToCustody() - Move funds from wallet to Custody contract
   * 2. resizeChannel() - Move funds from Custody to off-chain balance
   *
   * @param token - Token address
   * @param amount - Amount to deposit
   * @returns Transaction hash
   */
  async depositToCustody(
    token: Address,
    amount: bigint,
  ): Promise<`0x${string}`> {
    console.log('[SDKChannelService] ═══════════════════════════════════════════════════════');
    console.log('[SDKChannelService] Depositing funds to Custody contract');
    console.log('[SDKChannelService] ═══════════════════════════════════════════════════════');
    console.log(`[SDKChannelService] Token: ${token}`);
    console.log(`[SDKChannelService] Amount: ${amount.toString()}`);

    // Check authentication
    if (!this.auth.isAuthenticated()) {
      throw new Error('Session key not authenticated. Please call authenticate() first.');
    }

    // EIP-7702 NOTE: Gas checks removed - paymaster sponsors all transactions
    console.log('[SDKChannelService] Using EIP-7702 gasless transactions (no gas check needed)');

    // Check token balance BEFORE attempting approval
    console.log('[SDKChannelService] Checking wallet token balance...');
    try {
      const tokenBalance = await this.sdkClient.getTokenBalance(token);
      console.log(`[SDKChannelService] Current token balance: ${tokenBalance.toString()}`);
      
      if (tokenBalance < amount) {
        const decimals = 6; // USDC/USDT decimals
        const balanceFormatted = (Number(tokenBalance) / Math.pow(10, decimals)).toFixed(6);
        const amountFormatted = (Number(amount) / Math.pow(10, decimals)).toFixed(6);
        
        throw new Error(
          `Insufficient token balance. ` +
          `You have ${balanceFormatted} tokens but need ${amountFormatted}. ` +
          `Please add more tokens to your wallet first.`
        );
      }
      
      console.log('[SDKChannelService] ✅ Sufficient token balance');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient token balance')) {
        throw error; // Re-throw our formatted error
      }
      console.error('[SDKChannelService] Failed to check token balance:', error);
      throw new Error(`Failed to check token balance: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    // Step 1: Check and approve token allowance
    console.log('[SDKChannelService] Checking token allowance...');
    const currentAllowance = await this.sdkClient.getTokenAllowance(token);
    console.log(`[SDKChannelService] Current allowance: ${currentAllowance.toString()}`);

    if (currentAllowance < amount) {
      console.log(`[SDKChannelService] Approving ${amount.toString()} tokens...`);
      
      try {
        const approveHash = await this.sdkClient.approveTokens(token, amount);
        console.log(`[SDKChannelService] Approval tx: ${approveHash}`);

        const approveReceipt = await this.publicClient.waitForTransactionReceipt({
          hash: approveHash
        });
        console.log(`[SDKChannelService] ✅ Approval confirmed in block ${approveReceipt.blockNumber}`);
      } catch (error) {
        console.error('[SDKChannelService] Token approval failed:', error);
        throw new Error(
          `Failed to approve tokens. This usually means: ` +
          `1) You don't have enough tokens in your wallet, ` +
          `2) You don't have enough gas (ETH/Base) for the approval transaction, or ` +
          `3) The token contract rejected the approval. ` +
          `Error: ${error instanceof Error ? error.message : 'unknown'}`
        );
      }
    } else {
      console.log('[SDKChannelService] ✅ Sufficient allowance already exists');
    }

    // Step 2: Deposit to Custody contract
    console.log(`[SDKChannelService] Depositing ${amount.toString()} to Custody...`);
    const depositHash = await this.sdkClient.deposit(token, amount);
    console.log(`[SDKChannelService] Deposit tx: ${depositHash}`);

    const depositReceipt = await this.publicClient.waitForTransactionReceipt({
      hash: depositHash
    });
    console.log(`[SDKChannelService] ✅ Deposit confirmed in block ${depositReceipt.blockNumber}`);

    // Verify account balance in custody
    const accountBalance = await this.sdkClient.getAccountBalance(token);
    console.log(`[SDKChannelService] ✅ Account balance in Custody: ${accountBalance.toString()}`);

    return depositHash;
  }

  /**
   * Get account balance in Custody contract
   *
   * @param token - Token address
   * @returns Balance in Custody
   */
  async getCustodyBalance(token: Address): Promise<bigint> {
    return await this.sdkClient.getAccountBalance(token);
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
