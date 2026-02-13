/**
 * App Session Service (Lightning Node Core)
 *
 * Implements multi-party app sessions with:
 * - DEPOSIT: Add funds from unified balance to app session
 * - OPERATE: Transfer funds within app session (gasless)
 * - WITHDRAW: Remove funds from app session back to unified balance
 *
 * IMPORTANT: App Sessions = Lightning Nodes (multi-party, off-chain)
 * Uses NitroRPC/0.4 protocol with intent-based state updates.
 *
 * Protocol Reference:
 * - App Sessions: /Users/monstu/Developer/crawl4Ai/yellow/docs_protocol_off-chain_app-sessions.md
 */

import type { Address, Hash } from 'viem';
import { keccak256, toBytes } from 'viem';
import type { WebSocketManager } from './websocket-manager.js';
import type { SessionKeyAuth } from './session-auth.js';
import type {
  AppDefinition,
  AppSession,
  AppSessionAllocation,
  AppSessionIntent,
  AppSessionState,
  RPCRequest,
} from './types.js';

/**
 * App Session Service
 *
 * Manages multi-party app sessions (Lightning Nodes)
 */
export class AppSessionService {
  private ws: WebSocketManager;
  private auth: SessionKeyAuth;

  constructor(ws: WebSocketManager, auth: SessionKeyAuth) {
    this.ws = ws;
    this.auth = auth;
  }

  /**
   * Create a new app session (Lightning Node)
   *
   * @param definition - App governance definition
   * @param allocations - Initial fund allocations from unified balance
   * @param sessionData - Optional application-specific state (JSON)
   * @returns Created app session with ID and metadata
   */
  async createAppSession(
    definition: AppDefinition,
    allocations: AppSessionAllocation[],
    sessionData?: string,
  ): Promise<AppSession> {
    console.log('[AppSessionService] Creating app session...');
    console.log(`  - Protocol: ${definition.protocol}`);
    console.log(`  - Participants: ${definition.participants.length}`);
    console.log(`  - Quorum: ${definition.quorum}`);

    // Validate protocol version
    if (definition.protocol !== 'NitroRPC/0.4') {
      console.warn(
        `[AppSessionService] ⚠️  Using ${definition.protocol}. Recommended: NitroRPC/0.4`,
      );
    }

    // Request app session creation
    const requestId = this.ws.getNextRequestId();
    
    // Build params object, excluding undefined values
    const params: any = {
      definition,
      allocations,
    };
    
    // Only include session_data if it's defined
    if (sessionData !== undefined) {
      params.session_data = sessionData;
    }
    
    let request: RPCRequest = {
      req: [
        requestId,
        'create_app_session',
        params,
        Date.now(),
      ],
      sig: [] as string[],
    };

    // Sign with session key
    request = await this.auth.signRequest(request);

    const response = await this.ws.send(request);
    const sessionResponse = response.res[2];

    // Log full response for debugging
    console.log('[AppSessionService] Full response:', JSON.stringify(response, null, 2));
    console.log('[AppSessionService] Session response:', JSON.stringify(sessionResponse, null, 2));

    // Extract app session ID - try multiple possible field names
    const appSessionId: Hash = sessionResponse?.app_session_id || 
                               sessionResponse?.appSessionId || 
                               sessionResponse?.session_id ||
                               sessionResponse?.sessionId;

    // app_session_id MUST come from Yellow Network - no fallback computation
    if (!appSessionId || typeof appSessionId !== 'string') {
      console.error('[AppSessionService] ❌ app_session_id missing from Yellow Network response');
      console.error('[AppSessionService] Response structure:', JSON.stringify(sessionResponse, null, 2));
      throw new Error(
        'Failed to create app session: Yellow Network did not return app_session_id. ' +
        `Response: ${JSON.stringify(sessionResponse)}`
      );
    }

    // Ensure appSessionId is a valid Hash (0x-prefixed hex string)
    if (!appSessionId.startsWith('0x') || appSessionId.length !== 66) {
      console.error('[AppSessionService] ❌ Invalid app_session_id format:', appSessionId);
      throw new Error(
        `Invalid app_session_id format from Yellow Network: ${appSessionId}. ` +
        'Expected 0x-prefixed 64-character hex string.'
      );
    }

    const status = (sessionResponse?.status || 'open') as 'open' | 'closed';
    const version = (sessionResponse?.version || 1) as number;

    console.log('[AppSessionService] ✅ App session created!');
    console.log(`  - Session ID: ${appSessionId}`);
    console.log(`  - Status: ${status}`);
    console.log(`  - Version: ${version}`);

    // Return app session object
    return {
      app_session_id: appSessionId,
      status,
      version,
      session_data: sessionData,
      allocations,
      definition,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Submit app state update with intent
   *
   * @param appSessionId - App session identifier
   * @param intent - Operation intent (DEPOSIT, OPERATE, WITHDRAW)
   * @param allocations - New allocations after operation
   * @param sessionData - Updated application state (optional)
   * @returns Updated app session state
   */
  async submitAppState(
    appSessionId: Hash,
    intent: AppSessionIntent,
    allocations: AppSessionAllocation[],
    sessionData?: string,
  ): Promise<AppSessionState> {
    console.log(`[AppSessionService] Submitting ${intent} intent...`);
    console.log(`  - Session: ${appSessionId}`);
    console.log(`  - Allocations: ${allocations.length}`);

    // Request state update
    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [
        requestId,
        'submit_app_state',
        {
          app_session_id: appSessionId,
          intent: intent.toLowerCase(), // Yellow protocol expects lowercase: "deposit", "operate", "withdraw"
          allocations,
          session_data: sessionData,
        },
        Date.now(),
      ],
      sig: [] as string[],
    };

    // Sign with session key
    request = await this.auth.signRequest(request);

    const response = await this.ws.send(request);
    const stateData = response.res[2];

    console.log(`[AppSessionService] ✅ ${intent} completed!`);
    console.log(`  - New version: ${stateData.version}`);

    return {
      app_session_id: appSessionId,
      status: stateData.status,
      version: stateData.version,
      session_data: sessionData,
      allocations,
      signatures: stateData.signatures,
    };
  }

  /**
   * Submit app state with explicit version (NitroRPC/0.4)
   *
   * Per Yellow Network protocol, NitroRPC/0.4 requires:
   * - version: must be exactly currentVersion + 1
   * - intent: "operate" | "deposit" | "withdraw" (lowercase)
   * - allocations: FINAL state after the operation, NOT delta
   *
   * @param appSessionId - App session identifier
   * @param intent - Operation intent
   * @param version - Next version number (currentVersion + 1)
   * @param allocations - FINAL allocation state after this update
   * @param sessionData - Optional application state
   */
  async submitAppStateWithVersion(
    appSessionId: Hash,
    intent: AppSessionIntent,
    version: number,
    allocations: AppSessionAllocation[],
    sessionData?: string,
  ): Promise<AppSessionState> {
    console.log(`[AppSessionService] Submitting ${intent} intent (v${version})...`);
    console.log(`  - Session: ${appSessionId}`);
    console.log(`  - Version: ${version}`);
    console.log(`  - Allocations: ${JSON.stringify(allocations)}`);

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [
        requestId,
        'submit_app_state',
        {
          app_session_id: appSessionId,
          intent: intent.toLowerCase(), // Yellow protocol expects lowercase
          version,
          allocations,
          ...(sessionData !== undefined ? { session_data: sessionData } : {}),
        },
        Date.now(),
      ],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);

    const response = await this.ws.send(request);
    console.log(`[AppSessionService] Full submit_app_state response:`, JSON.stringify(response, null, 2));
    const stateData = response.res[2];

    console.log(`[AppSessionService] ✅ ${intent} completed!`);
    console.log(`  - Confirmed version: ${stateData.version}`);
    console.log(`  - Status: ${stateData.status}`);
    console.log(`  - State data keys: ${Object.keys(stateData).join(', ')}`);

    return {
      app_session_id: appSessionId,
      status: stateData.status || 'open',
      version: stateData.version || version,
      session_data: sessionData,
      allocations,
      signatures: stateData.signatures,
    };
  }

  /**
   * Deposit funds to app session from unified balance (gasless)
   *
   * @param appSessionId - App session identifier
   * @param participant - Participant address
   * @param asset - Asset identifier (e.g., 'usdc')
   * @param amount - Amount in human-readable format
   * @param currentAllocations - Current allocations (to update)
   * @returns Updated state after deposit
   */
  async depositToAppSession(
    appSessionId: Hash,
    participant: Address,
    asset: string,
    amount: string,
    currentAllocations: AppSessionAllocation[],
  ): Promise<AppSessionState> {
    console.log(
      `[AppSessionService] Deposit: ${amount} ${asset} from ${participant}`,
    );

    // Calculate new allocations after deposit
    const newAllocations = this.addAllocation(
      currentAllocations,
      participant,
      asset,
      amount,
    );

    return await this.submitAppState(appSessionId, 'DEPOSIT', newAllocations);
  }

  /**
   * Transfer funds within app session (gasless)
   *
   * @param appSessionId - App session identifier
   * @param from - Sender address
   * @param to - Recipient address
   * @param asset - Asset identifier
   * @param amount - Amount in human-readable format
   * @param currentAllocations - Current allocations (to update)
   * @returns Updated state after transfer
   */
  async transferInAppSession(
    appSessionId: Hash,
    from: Address,
    to: Address,
    asset: string,
    amount: string,
    currentAllocations: AppSessionAllocation[],
  ): Promise<AppSessionState> {
    console.log(
      `[AppSessionService] Transfer: ${amount} ${asset} from ${from} to ${to}`,
    );

    // Calculate new allocations after transfer
    const newAllocations = this.transferAllocation(
      currentAllocations,
      from,
      to,
      asset,
      amount,
    );

    return await this.submitAppState(appSessionId, 'OPERATE', newAllocations);
  }

  /**
   * Withdraw funds from app session back to unified balance (gasless)
   *
   * @param appSessionId - App session identifier
   * @param participant - Participant address
   * @param asset - Asset identifier
   * @param amount - Amount in human-readable format
   * @param currentAllocations - Current allocations (to update)
   * @returns Updated state after withdrawal
   */
  async withdrawFromAppSession(
    appSessionId: Hash,
    participant: Address,
    asset: string,
    amount: string,
    currentAllocations: AppSessionAllocation[],
  ): Promise<AppSessionState> {
    console.log(
      `[AppSessionService] Withdraw: ${amount} ${asset} to ${participant}`,
    );

    // Calculate new allocations after withdrawal
    const newAllocations = this.subtractAllocation(
      currentAllocations,
      participant,
      asset,
      amount,
    );

    return await this.submitAppState(appSessionId, 'WITHDRAW', newAllocations);
  }

  /**
   * Close app session and return funds to unified balance
   *
   * @param appSessionId - App session identifier
   * @param finalAllocations - Final fund distribution
   * @returns Closure confirmation
   */
  async closeAppSession(
    appSessionId: Hash,
    finalAllocations: AppSessionAllocation[],
  ): Promise<{ success: boolean }> {
    console.log(`[AppSessionService] Closing app session ${appSessionId}...`);

    // Request session closure
    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [
        requestId,
        'close_app_session',
        {
          app_session_id: appSessionId,
          final_allocations: finalAllocations,
        },
        Date.now(),
      ],
      sig: [] as string[],
    };

    // Sign with session key
    request = await this.auth.signRequest(request);

    const response = await this.ws.send(request);
    const closeData = response.res[2];

    console.log('[AppSessionService] ✅ App session closed!');
    console.log(`  - Funds returned to unified balance`);

    return {
      success: closeData.success || true,
    };
  }

  /**
   * Compute app session ID from definition
   *
   * @param definition - App definition
   * @returns App session ID (deterministic hash)
   */
  computeAppSessionId(definition: AppDefinition): Hash {
    // appSessionId = keccak256(JSON.stringify(definition))
    const definitionString = JSON.stringify({
      application: definition.application,
      protocol: definition.protocol,
      participants: definition.participants,
      weights: definition.weights,
      quorum: definition.quorum,
      challenge: definition.challenge,
      nonce: definition.nonce,
    });

    return keccak256(toBytes(definitionString));
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Add amount to participant's allocation
   */
  private addAllocation(
    allocations: AppSessionAllocation[],
    participant: Address,
    asset: string,
    amount: string,
  ): AppSessionAllocation[] {
    const newAllocations = [...allocations];
    const existing = newAllocations.find(
      (a) =>
        a.participant.toLowerCase() === participant.toLowerCase() &&
        a.asset === asset,
    );

    if (existing) {
      // Add to existing
      const currentAmount = parseFloat(existing.amount);
      const addAmount = parseFloat(amount);
      existing.amount = (currentAmount + addAmount).toString();
    } else {
      // Create new allocation
      newAllocations.push({ participant, asset, amount });
    }

    return newAllocations;
  }

  /**
   * Subtract amount from participant's allocation
   */
  private subtractAllocation(
    allocations: AppSessionAllocation[],
    participant: Address,
    asset: string,
    amount: string,
  ): AppSessionAllocation[] {
    const newAllocations = [...allocations];
    const existing = newAllocations.find(
      (a) =>
        a.participant.toLowerCase() === participant.toLowerCase() &&
        a.asset === asset,
    );

    if (!existing) {
      throw new Error(`Participant ${participant} has no ${asset} allocation`);
    }

    const currentAmount = parseFloat(existing.amount);
    const subtractAmount = parseFloat(amount);

    if (currentAmount < subtractAmount) {
      throw new Error(
        `Insufficient balance: ${currentAmount} < ${subtractAmount}`,
      );
    }

    existing.amount = (currentAmount - subtractAmount).toString();

    return newAllocations;
  }

  /**
   * Transfer amount from one participant to another
   */
  private transferAllocation(
    allocations: AppSessionAllocation[],
    from: Address,
    to: Address,
    asset: string,
    amount: string,
  ): AppSessionAllocation[] {
    // Subtract from sender
    let newAllocations = this.subtractAllocation(
      allocations,
      from,
      asset,
      amount,
    );

    // Add to recipient
    newAllocations = this.addAllocation(newAllocations, to, asset, amount);

    return newAllocations;
  }
}
