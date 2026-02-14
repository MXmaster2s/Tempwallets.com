/**
 * Query Service
 *
 * Provides query methods for:
 * - Unified balance (off-chain ledger)
 * - App sessions (Lightning Nodes)
 * - Payment channels
 * - Transaction history
 *
 * Protocol Reference:
 * - Query Methods: /Users/monstu/Developer/crawl4Ai/yellow/docs_protocol_off-chain_queries.md
 */

import type { Address, Hash } from 'viem';
import type { WebSocketManager } from './websocket-manager.js';
import type { SessionKeyAuth } from './session-auth.js';
import type {
  LedgerBalance,
  LedgerTransaction,
  AppSession,
  ChannelWithState,
  RPCRequest,
} from './types.js';
import { StateIntent } from './types.js';

/**
 * Query Service
 *
 * Handles all query operations for balances, channels, and sessions
 */
export class QueryService {
  private ws: WebSocketManager;
  private auth: SessionKeyAuth;

  constructor(ws: WebSocketManager, auth: SessionKeyAuth) {
    this.ws = ws;
    this.auth = auth;
  }

  /**
   * Get unified balance for account
   *
   * @param accountId - Optional account ID (defaults to authenticated user)
   * @returns Array of balance entries per asset
   */
  async getLedgerBalances(accountId?: string): Promise<LedgerBalance[]> {
    console.log('[QueryService] Fetching ledger balances...');

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [
        requestId,
        'get_ledger_balances',
        accountId ? { account_id: accountId } : {},
        Date.now(),
      ],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    const balanceData = response.res[2] as {
      ledger_balances: Array<{
        asset: string;
        amount: string;
        locked?: string;
        available?: string;
      }>;
    };
    if (!balanceData || !Array.isArray(balanceData.ledger_balances)) {
      console.warn(
        '[QueryService] No ledger_balances array in response. Returning empty array.',
      );
      return [];
    }

    const balances: LedgerBalance[] = balanceData.ledger_balances.map((b) => ({
      asset: b.asset,
      amount: b.amount,
      locked: b.locked ?? '0',
      available: b.available ?? b.amount,
    }));

    console.log(
      `[QueryService] Found ${balances.length} assets in unified balance`,
    );

    return balances;
  }

  /**
   * Get all app sessions (Lightning Nodes)
   *
   * @param status - Filter by status ('open' or 'closed')
   * @param participant - Filter by participant wallet address (optional but recommended)
   * @returns Array of app sessions
   */
  async getAppSessions(
    status?: 'open' | 'closed',
    participant?: string,
  ): Promise<AppSession[]> {
    console.log('[QueryService] Fetching app sessions...');

    // Build filter parameters

    const params: Record<string, unknown> = {};
    if (status) (params as { status?: string }).status = status;
    if (participant) {
      (params as { participant?: string }).participant = participant;
      console.log(`[QueryService] Filtering by participant: ${participant}`);
    }

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [requestId, 'get_app_sessions', params, Date.now()],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    const sessionsData = response.res[2] as {
      app_sessions: Array<{
        app_session_id: string;
        status: string;
        version: number;
        session_data: unknown;
        allocations?: unknown[];
        definition?: unknown;
        created_at: string | number | Date;
        updated_at: string | number | Date;
        closed_at?: string | number | Date;
      }>;
    };
    if (!sessionsData || !Array.isArray(sessionsData.app_sessions)) {
      console.warn(
        '[QueryService] No app_sessions array in response. Returning empty array.',
      );
      return [];
    }

    const sessions: AppSession[] = sessionsData.app_sessions.map((s) => ({
      app_session_id: s.app_session_id as `0x${string}`,
      status: s.status === 'open' || s.status === 'closed' ? s.status : 'open',
      version: s.version,
      session_data:
        typeof s.session_data === 'string'
          ? s.session_data
          : JSON.stringify(s.session_data ?? {}),
      allocations: Array.isArray(s.allocations)
        ? (s.allocations as any[]).map(
            (a) => a as import('./types.js').AppSessionAllocation,
          )
        : [],
      definition: s.definition as import('./types.js').AppDefinition,
      createdAt: new Date(s.created_at),
      updatedAt: new Date(s.updated_at),
      closedAt: s.closed_at ? new Date(s.closed_at) : undefined,
    }));

    console.log(`[QueryService] Found ${sessions.length} app sessions`);

    return sessions;
  }

  /**
   * Get payment channels
   *
   * @returns Array of payment channels
   */
  async getChannels(): Promise<ChannelWithState[]> {
    console.log('[QueryService] Fetching payment channels...');

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [requestId, 'get_channels', {}, Date.now()],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    // Log full response for debugging
    console.log(
      '[QueryService] Full get_channels response:',
      JSON.stringify(response, null, 2),
    );

    // Check for errors in response
    if (response.error) {
      console.error(
        '[QueryService] Error in get_channels response:',
        response.error.message,
      );
      throw new Error(`Yellow Network error: ${response.error.message}`);
    }

    if (response.res && response.res[1] === 'error') {
      console.error(
        '[QueryService] Error in get_channels response:',
        response.res[2],
      );
      throw new Error(
        `Yellow Network error: ${JSON.stringify(response.res[2])}`,
      );
    }

    const channelsData = response.res[2] as { channels?: any[] };

    if (!channelsData) {
      console.warn(
        '[QueryService] No channels data in response. Returning empty array.',
      );
      return [];
    }

    // Check if channels array exists
    if (!channelsData.channels || !Array.isArray(channelsData.channels)) {
      console.warn(
        `[QueryService] Invalid response structure: 'channels' is missing or not an array. ` +
          `Response keys: ${Object.keys(channelsData).join(', ')}. ` +
          `Returning empty array.`,
      );
      return [];
    }

    const channels: ChannelWithState[] = Array.isArray(channelsData.channels)
      ? channelsData.channels.map((c) => {
          // Participants
          let participants: [Address, Address];
          if (
            c &&
            Array.isArray((c as { participants?: unknown[] }).participants) &&
            (c as { participants: unknown[] }).participants.length >= 2
          ) {
            const p = (c as { participants: [Address, Address] }).participants;
            participants = [p[0], p[1]];
          } else if (
            c &&
            typeof (c as { participant?: unknown }).participant === 'string'
          ) {
            const userAddress = (c as { participant: Address }).participant;
            participants = [userAddress, userAddress];
            const channelId = (c as { channel_id?: string }).channel_id;
            console.warn(
              `[QueryService] get_channels returned simplified structure for channel ${channelId}. ` +
                `Using placeholder for clearnode address. Full participants array requires create_channel response.`,
            );
          } else {
            throw new Error(
              `Invalid channel structure: missing participants or participant field. Channel: ${JSON.stringify(c)}`,
            );
          }

          // Channel fields
          const channelId = (c as { channel_id?: string })
            .channel_id as `0x${string}`;
          const adjudicator = (c as { adjudicator?: Address })
            .adjudicator as Address;
          const challengeRaw = (c as { challenge?: string | number | bigint })
            .challenge;
          const challenge =
            typeof challengeRaw === 'string' ||
            typeof challengeRaw === 'number' ||
            typeof challengeRaw === 'bigint'
              ? BigInt(challengeRaw)
              : BigInt(0);
          const nonceRaw = (c as { nonce?: string | number | bigint }).nonce;
          const nonce =
            typeof nonceRaw === 'string' ||
            typeof nonceRaw === 'number' ||
            typeof nonceRaw === 'bigint'
              ? BigInt(nonceRaw)
              : BigInt(0);
          const chainIdRaw = (c as { chain_id?: number }).chain_id;
          const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : 0;
          const statusRaw = (c as { status?: string }).status;
          // Preserve the actual status from Yellow Network (open, resizing, closed, etc.)
          // so callers can detect stuck "resizing" channels and handle them appropriately.
          const status = (statusRaw ?? 'active') as
            | 'active'
            | 'open'
            | 'resizing'
            | 'closed';
          // State
          const stateRaw = (c as { state?: unknown; version?: unknown }).state;
          const stateVersionRaw = (c as { version?: unknown }).version;
          let intent: StateIntent = StateIntent.INITIALIZE;
          let version: bigint = BigInt(0);
          let data: `0x${string}` = '0x';
          let allocations: [bigint, bigint][] = [
            [BigInt(0), BigInt(0)],
            [BigInt(1), BigInt(0)],
          ];
          if (stateRaw && typeof stateRaw === 'object') {
            const s = stateRaw as Record<string, unknown>;
            if (typeof s.intent === 'string') {
              intent = s.intent as unknown as StateIntent;
            }
            if (
              typeof stateVersionRaw === 'string' ||
              typeof stateVersionRaw === 'number' ||
              typeof stateVersionRaw === 'bigint'
            ) {
              try {
                version = BigInt(stateVersionRaw);
              } catch {
                version = BigInt(0);
              }
            } else if (
              typeof s.version === 'string' ||
              typeof s.version === 'number' ||
              typeof s.version === 'bigint'
            ) {
              try {
                version = BigInt(s.version);
              } catch {
                version = BigInt(0);
              }
            }
            if (typeof s.data === 'string' && s.data.startsWith('0x')) {
              data = s.data as `0x${string}`;
            }
            if (Array.isArray(s.allocations)) {
              allocations = s.allocations.map((a, idx) => {
                if (Array.isArray(a) && a.length === 2) {
                  let v0 = BigInt(idx);
                  let v1 = BigInt(0);
                  if (
                    (typeof a[0] === 'string' ||
                      typeof a[0] === 'number' ||
                      typeof a[0] === 'bigint') &&
                    (typeof a[1] === 'string' ||
                      typeof a[1] === 'number' ||
                      typeof a[1] === 'bigint')
                  ) {
                    try {
                      v0 = BigInt(a[0]);
                    } catch {
                      /* ignore */
                    }
                    try {
                      v1 = BigInt(a[1]);
                    } catch {
                      /* ignore */
                    }
                  }
                  return [v0, v1];
                } else if (a && typeof a === 'object') {
                  const obj = a as Record<string, unknown>;
                  let index = BigInt(idx);
                  let amount = BigInt(0);
                  if (
                    typeof obj.index === 'number' ||
                    typeof obj.index === 'string'
                  ) {
                    try {
                      index = BigInt(obj.index);
                    } catch {
                      /* ignore */
                    }
                  }
                  if (
                    typeof obj.amount === 'number' ||
                    typeof obj.amount === 'string'
                  ) {
                    try {
                      amount = BigInt(obj.amount);
                    } catch {
                      /* ignore */
                    }
                  }
                  return [index, amount];
                } else {
                  return [BigInt(idx), BigInt(0)];
                }
              });
            }
          }
          const state: ChannelWithState['state'] = {
            intent,
            version,
            data,
            allocations,
          };
          return {
            participants,
            adjudicator,
            challenge,
            nonce,
            channelId,
            state,
            chainId,
            status,
          };
        })
      : [];

    console.log(`[QueryService] Found ${channels.length} payment channels`);

    return channels;
  }

  /**
   * Get ledger transaction history
   *
   * @param filters - Optional filters (asset, type, limit, offset)
   * @returns Array of transactions
   */
  async getLedgerTransactions(filters?: {
    asset?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<LedgerTransaction[]> {
    console.log('[QueryService] Fetching ledger transactions...');

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [requestId, 'get_ledger_transactions', filters || {}, Date.now()],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);
    const txData = response.res[2] as { transactions?: any[] };
    if (!txData || !Array.isArray(txData.transactions)) {
      console.warn(
        '[QueryService] No transactions array in response. Returning empty array.',
      );
      return [];
    }

    const transactions: LedgerTransaction[] = txData.transactions
      .map((tx) => {
        if (!tx || typeof tx !== 'object') return null;
        const t = tx as Record<string, unknown>;
        return {
          id: typeof t.id === 'string' ? t.id : '',
          type: typeof t.type === 'string' ? t.type : '',
          asset: typeof t.asset === 'string' ? t.asset : '',
          amount: typeof t.amount === 'string' ? t.amount : '',
          from: typeof t.from === 'string' ? t.from : '',
          to: typeof t.to === 'string' ? t.to : '',
          timestamp: typeof t.timestamp === 'number' ? t.timestamp : 0,
          status: typeof t.status === 'string' ? t.status : '',
        };
      })
      .filter(Boolean) as LedgerTransaction[];

    console.log(`[QueryService] Found ${transactions.length} transactions`);

    return transactions;
  }

  /**
   * Get app definition (governance parameters and participants)
   *
   * Uses Yellow Network's get_app_definition RPC method to retrieve the
   * immutable definition for a specific app session. This method always
   * returns full participant information unlike get_app_sessions which
   * may filter participants for privacy when querying all sessions.
   *
   * @param appSessionId - App session identifier
   * @returns App definition with participants, weights, quorum, etc.
   */
  async getAppDefinition(appSessionId: Hash): Promise<any> {
    console.log(
      `[QueryService] Fetching app definition for ${appSessionId}...`,
    );

    const requestId = this.ws.getNextRequestId();
    const request: RPCRequest = {
      req: [
        requestId,
        'get_app_definition',
        { app_session_id: appSessionId },
        Date.now(),
      ],
      sig: [] as string[], // Public method
    };

    const response = await this.ws.send(request);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const definition: any = response.res[2];

    const def = definition as Record<string, unknown>;
    const protocol = typeof def.protocol === 'string' ? def.protocol : '';
    const participants = Array.isArray(def.participants)
      ? def.participants
      : [];
    const weights = Array.isArray(def.weights) ? def.weights : [];
    const quorum = typeof def.quorum === 'number' ? def.quorum : 0;
    const challenge = typeof def.challenge === 'number' ? def.challenge : 0;
    const nonce = typeof def.nonce === 'number' ? def.nonce : 0;

    console.log(
      `[QueryService] ✅ Got app definition with ${participants.length} participants`,
    );

    return {
      protocol,
      participants,
      weights,
      quorum,
      challenge,
      nonce,
    };
  }

  /**
   * Get single app session by ID
   *
   * Fetches both the session metadata (status, version, allocations) and
   * the full definition (participants, weights, quorum) by combining
   * get_app_sessions and get_app_definition RPC calls.
   *
   * @param appSessionId - App session identifier
   * @returns App session details with full definition
   */
  async getAppSession(appSessionId: Hash): Promise<AppSession> {
    console.log(`[QueryService] Fetching app session ${appSessionId}...`);

    // Step 1: Get app definition directly by ID (public method, no pagination issues)
    // This is the reliable way to fetch a specific session's governance parameters.
    const definitionRaw = (await this.getAppDefinition(
      appSessionId,
    )) as unknown;
    const def =
      definitionRaw && typeof definitionRaw === 'object'
        ? (definitionRaw as Record<string, unknown>)
        : {};
    const allowedProtocols = ['NitroRPC/0.2', 'NitroRPC/0.4'] as const;
    const protocol =
      typeof def.protocol === 'string' &&
      allowedProtocols.includes(def.protocol as any)
        ? (def.protocol as import('./types.js').AppSessionProtocol)
        : 'NitroRPC/0.4';
    const participants =
      Array.isArray(def.participants) &&
      def.participants.every((p) => typeof p === 'string' && p.startsWith('0x'))
        ? (def.participants as `0x${string}`[])
        : [];
    const weights =
      Array.isArray(def.weights) &&
      def.weights.every((w) => typeof w === 'number')
        ? def.weights
        : [];
    const quorum = typeof def.quorum === 'number' ? def.quorum : 0;
    const challenge = typeof def.challenge === 'number' ? def.challenge : 0;
    const nonce = typeof def.nonce === 'number' ? def.nonce : 0;

    const definition = {
      protocol,
      participants,
      weights,
      quorum,
      challenge,
      nonce,
    };

    // Step 2: Get actual allocations via get_ledger_balances with app_session_id as account_id
    // The get_app_sessions API does NOT return per-participant allocations.
    // Per Yellow docs: "To query balance within a specific app session,
    // provide the app_session_id as the account_id."
    const allocations: import('./types.js').AppSessionAllocation[] = [];
    try {
      const sessionBalances = await this.getAppSessionBalances(appSessionId);
      // Convert LedgerBalance[] to AppSessionAllocation[]
      // Note: get_ledger_balances returns per-asset totals for the session,
      // not per-participant. We distribute across participants based on
      // what we know. For single-asset sessions, we can build from this.
      if (sessionBalances.length > 0) {
        console.log(
          `[QueryService] Session balances: ${JSON.stringify(sessionBalances)}`,
        );
        // Build allocations from session balances
        // Each balance entry represents an asset in the session
        for (const balance of sessionBalances) {
          if (parseFloat(balance.amount) > 0) {
            // We know the session has this asset with this total amount
            // For per-participant breakdown, we'll rely on the session list data below
            allocations.push({
              participant: participants[0] || ('0x' as `0x${string}`),
              asset: balance.asset,
              amount: balance.amount,
            });
          }
        }
      }
    } catch (error) {
      console.warn(`[QueryService] Failed to get session balances:`, error);
    }

    // Step 3: Try to find session metadata from get_app_sessions with higher limit
    // The default limit is 10 which may miss newly created sessions.
    // Use limit=100 to improve chances.
    let session: AppSession | undefined;
    try {
      const sessions = await this.getAppSessionsPaginated({ limit: 100 });
      session = sessions.find((s) => s.app_session_id === appSessionId);
    } catch (error) {
      console.warn(
        `[QueryService] Failed to fetch sessions list, building from definition only:`,
        error,
      );
    }

    if (session) {
      // If the session list had allocations, use them; otherwise use what we got from ledger
      const sessionAllocations =
        session.allocations && session.allocations.length > 0
          ? session.allocations
          : allocations;
      console.log(
        `[QueryService] ✅ Found session in list, merged with definition (${participants.length} participants, ${sessionAllocations.length} allocations)`,
      );
      return {
        ...session,
        definition,
        allocations: sessionAllocations,
      };
    }

    // Step 4: Session not in paginated list, but definition exists — build a minimal AppSession
    console.log(
      `[QueryService] ⚠️ Session not in paginated list, building from definition (${participants.length} participants)`,
    );
    return {
      app_session_id: appSessionId,
      status: 'open',
      version: 1,
      session_data: '{}',
      allocations,
      definition,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get app sessions with explicit pagination
   *
   * @param options - Pagination and filter options
   * @returns Array of app sessions
   */
  private async getAppSessionsPaginated(options?: {
    status?: 'open' | 'closed';
    participant?: string;
    limit?: number;
    offset?: number;
  }): Promise<AppSession[]> {
    const params: Record<string, unknown> = {};
    if (options?.status) params.status = options.status;
    if (options?.participant) params.participant = options.participant;
    if (options?.limit) params.limit = options.limit;
    if (options?.offset) params.offset = options.offset;

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [requestId, 'get_app_sessions', params, Date.now()],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    const sessionsData = response.res[2] as {
      app_sessions: Array<{
        app_session_id: string;
        status: string;
        version: number;
        session_data: unknown;
        allocations?: unknown[];
        definition?: unknown;
        created_at: string | number | Date;
        updated_at: string | number | Date;
        closed_at?: string | number | Date;
      }>;
    };
    if (!sessionsData || !Array.isArray(sessionsData.app_sessions)) {
      return [];
    }

    return sessionsData.app_sessions.map((s) => ({
      app_session_id: s.app_session_id as `0x${string}`,
      status: s.status === 'open' || s.status === 'closed' ? s.status : 'open',
      version: s.version,
      session_data:
        typeof s.session_data === 'string'
          ? s.session_data
          : JSON.stringify(s.session_data ?? {}),
      allocations: Array.isArray(s.allocations)
        ? (s.allocations as any[]).map(
            (a) => a as import('./types.js').AppSessionAllocation,
          )
        : [],
      definition: s.definition as import('./types.js').AppDefinition,
      createdAt: new Date(s.created_at),
      updatedAt: new Date(s.updated_at),
      closedAt: s.closed_at ? new Date(s.closed_at) : undefined,
    }));
  }

  /**
   * Get balances within a specific app session
   *
   * Uses get_ledger_balances with the app_session_id as account_id.
   * Per Yellow docs: "To query balance within a specific app session,
   * provide the app_session_id as the account_id."
   *
   * @param appSessionId - App session identifier
   * @returns Array of balance entries (asset + amount) for the session
   */
  async getAppSessionBalances(appSessionId: Hash): Promise<LedgerBalance[]> {
    console.log(
      `[QueryService] Fetching balances for app session ${appSessionId}...`,
    );

    const requestId = this.ws.getNextRequestId();
    let request: RPCRequest = {
      req: [
        requestId,
        'get_ledger_balances',
        { account_id: appSessionId },
        Date.now(),
      ],
      sig: [] as string[],
    };

    request = await this.auth.signRequest(request);
    const response = await this.ws.send(request);

    const balanceData = response.res[2] as {
      ledger_balances: Array<{
        asset: string;
        amount: string;
        locked?: string;
        available?: string;
      }>;
    };
    if (!balanceData || !Array.isArray(balanceData.ledger_balances)) {
      console.warn(
        '[QueryService] No ledger_balances for app session. Returning empty array.',
      );
      return [];
    }

    const balances: LedgerBalance[] = balanceData.ledger_balances.map((b) => ({
      asset: b.asset,
      amount: b.amount,
      locked: b.locked ?? '0',
      available: b.available ?? b.amount,
    }));

    console.log(
      `[QueryService] Found ${balances.length} assets in app session balance`,
    );

    return balances;
  }

  /**
   * Ping clearnode to check connection
   *
   * @returns Pong response with timestamp
   */
  async ping(): Promise<{ pong: string; timestamp: number }> {
    const requestId = this.ws.getNextRequestId();
    const request: RPCRequest = {
      req: [requestId, 'ping', {}, Date.now()],
      sig: [] as string[], // Public method
    };

    const response = await this.ws.send(request);
    const pongDataRaw: unknown = response.res[2];
    if (!pongDataRaw || typeof pongDataRaw !== 'object') {
      return {
        pong: 'pong',
        timestamp: Date.now(),
      };
    }
    const pongData = pongDataRaw as Record<string, unknown>;
    return {
      pong: typeof pongData.pong === 'string' ? pongData.pong : 'pong',
      timestamp:
        typeof pongData.timestamp === 'number'
          ? pongData.timestamp
          : Date.now(),
    };
  }
}
