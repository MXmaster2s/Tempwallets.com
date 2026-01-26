'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  lightningNodeApi,
  LightningNode,
  CreateLightningNodeRequest,
  UnifiedBalanceAsset,
} from '@/lib/api';
import { useAuth } from './useAuth';
import {
  trackLightningWalletConnected,
  trackLightningSessionCreated,
  trackLightningSessionJoined,
  trackLightningSessionsDiscovered,
  trackLightningAuthFailed,
} from '@/lib/mixpanel-events';

/**
 * Hook to manage Lightning Nodes (Yellow Network Nitrolite Channels)
 *
 * New Yellow Network Native Flow:
 * 1. Authenticate wallet (one-time)
 * 2. Discover sessions (auto-find all sessions user is part of)
 * 3. Search sessions (find specific session by ID)
 * 4. Interact (deposit, transfer, close)
 */
export function useLightningNodes() {
  const { userId } = useAuth();

  // Authentication state
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Unified balance state
  const [unifiedBalance, setUnifiedBalance] = useState<UnifiedBalanceAsset[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Sessions state
  const [allSessions, setAllSessions] = useState<LightningNode[]>([]);
  const [activeSessions, setActiveSessions] = useState<LightningNode[]>([]);
  const [invitations, setInvitations] = useState<LightningNode[]>([]);

  // Legacy nodes state (for backward compatibility)
  const [nodes, setNodes] = useState<LightningNode[]>([]);

  // Loading & error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  /**
   * Step 1: Authenticate user's wallet with Yellow Network
   * This should be called once when the user accesses the Lightning Node UI
   * 
   * OPTIMIZATION: Checks localStorage cache first to avoid reconnections
   */
  const authenticate = useCallback(async (chain: string = 'base') => {
    console.log('[Lightning] authenticate called - userId:', userId, 'authenticated:', authenticated);
    
    // Skip if already authenticated
    if (authenticated) {
      console.log('[Lightning] Already authenticated, skipping');
      return;
    }

    // If no userId yet, don't set error - auto-retry will handle it
    if (!userId) {
      console.warn('[Lightning] ⚠️ No userId available yet - will retry when available');
      return;
    }

    setAuthenticating(true);
    setError(null);

    try {
      // Check localStorage cache first
      const { getCachedSession, cacheSession } = await import('@/lib/lightning-session-cache');
      const cachedSession = getCachedSession(userId, chain);

      if (cachedSession) {
        console.log('[Lightning] � Restoring session from cache');
        
        // Restore session without backend call
        setAuthenticated(true);
        setWalletAddress(cachedSession.walletAddress);
        console.log('[Lightning] ✅ Session restored from cache:', cachedSession.walletAddress);

        // Track restoration
        trackLightningWalletConnected({
          userId,
          walletAddress: cachedSession.walletAddress,
          chain,
          timestamp: Date.now(),
        });

        console.log('[Lightning] Authentication complete (cached). Call discoverSessions() to load sessions.');
        setAuthenticating(false);
        return;
      }

      // No valid cache, authenticate with backend
      console.log('[Lightning] 🔄 No valid cache, authenticating with backend...');
      console.log('[Lightning] Request payload:', { userId, chain });
      
      const response = await lightningNodeApi.authenticateWallet({ userId, chain });
      
      console.log('[Lightning] 📥 Backend response:', response);

      if (response.ok && response.authenticated) {
        setAuthenticated(true);
        setWalletAddress(response.walletAddress);
        console.log('[Lightning] ✅ Wallet authenticated successfully:', response.walletAddress);

        // Cache the session with 24h expiry
        if (response.sessionKey && response.jwtToken && response.expiresAt) {
          cacheSession({
            userId,
            chain,
            walletAddress: response.walletAddress,
            sessionKey: response.sessionKey,
            jwtToken: response.jwtToken,
            expiresAt: response.expiresAt,
          });
        }

        // Track successful authentication
        trackLightningWalletConnected({
          userId,
          walletAddress: response.walletAddress,
          chain,
          timestamp: Date.now(),
        });

        // OPTIMIZATION: Don't auto-discover sessions after authentication
        // Sessions will be fetched on-demand when component explicitly calls discoverSessions()
        console.log('[Lightning] Authentication complete. Call discoverSessions() to load sessions.');
      } else {
        console.error('[Lightning] ❌ Authentication failed - response:', response);
        throw new Error('Authentication failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to authenticate wallet';
      setError(errorMessage);
      console.error('[Lightning] ❌ Authentication error:', err);
      setAuthenticated(false);

      // Track authentication failure
      trackLightningAuthFailed({
        userId: userId || 'unknown',
        chain,
        errorMessage,
      });
    } finally {
      setAuthenticating(false);
    }
  }, [userId, authenticated]);

  /**
   * Fetch unified balance from Clearnode
   * This shows all assets available in the off-chain balance
   */
  const fetchUnifiedBalance = useCallback(async (chain: string = 'base') => {
    if (!userId || !authenticated) {
      console.warn('[Lightning] Cannot fetch balance - user not authenticated');
      return;
    }

    setBalanceLoading(true);

    try {
      console.log('[Lightning] Fetching unified balance...');
      const response = await lightningNodeApi.getUnifiedBalance(userId, chain);

      if (response.success) {
        setUnifiedBalance(response.balances);
        console.log('[Lightning] ✅ Unified balance fetched:', response.balances);
      } else {
        console.error('[Lightning] Failed to fetch unified balance');
      }
    } catch (err) {
      console.error('[Lightning] Error fetching unified balance:', err);
      // Don't set error state for balance fetches - it's not critical
    } finally {
      setBalanceLoading(false);
    }
  }, [userId, authenticated]);

  /**
   * Fetch custody balance (on-chain Custody contract balance)
   * This shows the balance deposited to the Custody smart contract
   * before it's moved to unified balance via channel resize.
   */
  const fetchCustodyBalance = useCallback(async (
    chain: string = 'base',
    asset: string = 'usdc'
  ) => {
    if (!userId || !authenticated) {
      console.warn('[Lightning] Cannot fetch custody balance - user not authenticated');
      return null;
    }

    try {
      console.log('[Lightning] Fetching custody balance...');
      const response = await lightningNodeApi.getCustodyBalance(userId, chain, asset);

      if (response.success) {
        console.log('[Lightning] ✅ Custody balance:', response.balanceFormatted, asset.toUpperCase());
        return response;
      }
    } catch (err) {
      console.error('[Lightning] Error fetching custody balance:', err);
    }
    return null;
  }, [userId, authenticated]);

  /**
   * Step 2: Discover all sessions where user is a participant
   * Uses Yellow Network's getLightningNodes() to auto-discover
   */
  const discoverSessions = useCallback(async (chain: string = 'base') => {
    if (!userId) {
      setAllSessions([]);
      setActiveSessions([]);
      setInvitations([]);
      setNodes([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Lightning] Discovering sessions for user:', userId);
      const response = await lightningNodeApi.discoverSessions(userId, chain);

      if (response.ok) {
        setAllSessions(response.sessions);
        setActiveSessions(response.activeSessions);
        setInvitations(response.invitations);
        setNodes(response.sessions); // For backward compatibility
        setLastFetched(Date.now());

        console.log('[Lightning] ✅ Discovered sessions:', {
          total: response.sessions.length,
          active: response.activeSessions.length,
          invitations: response.invitations.length
        });

        // Track session discovery (only if sessions found)
        trackLightningSessionsDiscovered({
          userId,
          chain,
          totalSessions: response.sessions.length,
          activeSessions: response.activeSessions.length,
          invitations: response.invitations.length,
        });

        // Show notification for new invitations
        if (response.invitations.length > 0) {
          console.log(`[Lightning] 📨 ${response.invitations.length} new invitation(s)`);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to discover sessions';
      setError(errorMessage);
      console.error('[Lightning] Discovery error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Search for a specific session by ID or URI
   * Uses Yellow Network's getLightningNode()
   */
  const searchSession = useCallback(async (sessionId: string): Promise<LightningNode | null> => {
    if (!userId) {
      throw new Error('User ID is required to search for a session');
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Lightning] Searching for session:', sessionId);
      const response = await lightningNodeApi.searchSession({ userId, sessionId });

      if (response.ok && response.localMetadata) {
        // Add to sessions list if not already there
        setAllSessions(prev => {
          const exists = prev.some(s => s.appSessionId === response.localMetadata!.appSessionId);
          if (exists) return prev;
          return [response.localMetadata!, ...prev];
        });

        // Move from invitations to active sessions
        setInvitations(prev =>
          prev.filter(s => s.appSessionId !== response.localMetadata!.appSessionId)
        );
        setActiveSessions(prev => {
          const exists = prev.some(s => s.appSessionId === response.localMetadata!.appSessionId);
          if (exists) return prev;
          return [response.localMetadata!, ...prev];
        });

        setLastFetched(Date.now());
        console.log('[Lightning] ✅ Session found:', response.localMetadata.appSessionId);

        // Track session joined
        trackLightningSessionJoined({
          userId,
          sessionId: response.localMetadata.appSessionId,
          chain: response.localMetadata.chain || 'base',
        });

        return response.localMetadata;
      }

      throw new Error(response.message || 'Session not found');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search for session';
      setError(errorMessage);
      console.error('[Lightning] Search error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Best-effort presence heartbeat (used to show "active" participants).
   */
  const heartbeat = useCallback(
    async (appSessionId: string) => {
      if (!userId) return;
      try {
        await lightningNodeApi.heartbeatLightningNode(appSessionId, userId);
      } catch {
        // Non-critical
      }
    },
    [userId]
  );

  /**
   * Create a new Lightning Node
   */
  const createNode = useCallback(async (
    data: Omit<CreateLightningNodeRequest, 'userId'>
  ): Promise<LightningNode | null> => {
    if (!userId) {
      throw new Error('User ID is required to create a Lightning Node');
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Lightning] Creating new node');
      const response = await lightningNodeApi.createLightningNode({
        ...data,
        userId,
      });

      if (response.ok && response.node) {
        // Add the new node to all lists
        setAllSessions(prev => [response.node, ...prev]);
        setActiveSessions(prev => [response.node, ...prev]);
        setNodes(prev => [response.node, ...prev]);
        setLastFetched(Date.now());

        console.log('[Lightning] ✅ Node created:', response.node.appSessionId);

        // Track session creation
        trackLightningSessionCreated({
          userId,
          sessionId: response.node.appSessionId,
          chain: response.node.chain || 'base',
        });

        return response.node;
      }

      throw new Error('Failed to create Lightning Node');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create Lightning Node';
      setError(errorMessage);
      console.error('[Lightning] Create error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Join an existing Lightning Node by URI (DEPRECATED - use searchSession instead)
   * @deprecated Use searchSession() for Yellow Network native flow
   */
  const joinNode = useCallback(async (uri: string): Promise<LightningNode | null> => {
    console.warn('[Lightning] joinNode() is deprecated. Use searchSession() instead.');

    // Extract session ID from URI
    const sessionId = uri.replace('lightning://', '');
    return searchSession(sessionId);
  }, [searchSession]);

  /**
   * Refresh sessions list (re-discover)
   */
  const refreshNodes = useCallback(() => {
    return discoverSessions();
  }, [discoverSessions]);

  // Auto-authenticate when userId becomes available
  // This ensures authentication happens automatically when user navigates to Lightning Node UI
  useEffect(() => {
    if (userId && !authenticated && !authenticating) {
      console.log('[Lightning] UserId now available, auto-authenticating...');
      authenticate('base');
    }
  }, [userId, authenticated, authenticating, authenticate]);

  return {
    // Authentication state
    authenticated,
    authenticating,
    walletAddress,
    authenticate,

    // Unified balance state
    unifiedBalance,
    balanceLoading,
    fetchUnifiedBalance,
    fetchCustodyBalance,

    // Sessions state (Yellow Network native)
    allSessions,
    activeSessions,
    invitations,
    discoverSessions,
    searchSession,

    // Legacy state (for backward compatibility)
    nodes: allSessions, // Map to allSessions for backward compatibility

    // Actions
    createNode,
    joinNode, // deprecated but kept for backward compatibility
    refreshNodes,
    heartbeat,

    // UI state
    loading,
    error,
    lastFetched,
  };
}
