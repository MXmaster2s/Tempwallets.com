'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import SignClient from '@walletconnect/sign-client';
import { SessionTypes } from '@walletconnect/types';
import { walletApi, ApiError } from '@/lib/api';

const SUBSTRATE_WALLETCONNECT_METHODS = [
  'polkadot_signTransaction',
  'polkadot_signMessage',
];

const SUBSTRATE_WALLETCONNECT_EVENTS = ['chainChanged', 'accountsChanged'];

export interface SubstrateWalletConnectSession {
  topic: string;
  peer: {
    metadata?: {
      name?: string;
      description?: string;
      url?: string;
      icons?: string[];
    };
  };
  namespaces: SessionTypes.Namespaces;
}

export interface UseSubstrateWalletConnectReturn {
  client: SignClient | null;
  sessions: SubstrateWalletConnectSession[];
  isInitializing: boolean;
  error: string | null;
  pair: (uri: string) => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
  approveSession: (proposalId: number, namespaces: SessionTypes.Namespaces) => Promise<void>;
  rejectSession: (proposalId: number) => Promise<void>;
  initialize: () => Promise<void>; // Lazy initialization method
}

/**
 * Hook for Substrate WalletConnect connections
 * 
 * Only handles Polkadot namespace - EVM chains are excluded
 */
// Global client instance to prevent multiple initializations
let globalSubstrateSignClient: SignClient | null = null;
let isInitializingGlobal = false;

export function useSubstrateWalletConnect(userId: string | null): UseSubstrateWalletConnectReturn {
  const [client, setClient] = useState<SignClient | null>(null);
  const [sessions, setSessions] = useState<SubstrateWalletConnectSession[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingProposalsRef = useRef<Map<number, any>>(new Map());
  const isInitializedRef = useRef(false);

  // Lazy initialization function - only called when modal opens
  const initialize = useCallback(async () => {
    if (!userId) {
      setIsInitializing(false);
      return;
    }

    // If already initialized with a valid client, just use it
    if (globalSubstrateSignClient) {
      if (client !== globalSubstrateSignClient) {
        setClient(globalSubstrateSignClient);
      }
      setIsInitializing(false);
      isInitializedRef.current = true;
      const existingSessions = globalSubstrateSignClient.session.getAll();
      setSessions(
        existingSessions
          .filter(s => {
            if (!s || !s.topic) return false;
            return s.namespaces?.polkadot !== undefined;
          })
          .map(s => ({
            topic: s.topic,
            peer: s.peer || { metadata: undefined },
            namespaces: s.namespaces || {},
          }))
      );
      return;
    }

    // Prevent multiple initializations
    if (isInitializedRef.current) {
      setIsInitializing(false);
      return;
    }

    // Prevent concurrent initializations
    if (isInitializingGlobal) {
      // Wait for existing initialization
      let waitCount = 0;
      while (isInitializingGlobal && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      const existingClient = globalSubstrateSignClient as SignClient | null;
      if (existingClient) {
        setClient(existingClient);
        setIsInitializing(false);
        isInitializedRef.current = true;
        const existingSessions = existingClient.session.getAll();
        setSessions(
          existingSessions
            .filter(s => {
              if (!s || !s.topic) return false;
              return s.namespaces?.polkadot !== undefined;
            })
            .map(s => ({
              topic: s.topic,
              peer: s.peer || { metadata: undefined },
              namespaces: s.namespaces || {},
            }))
        );
      }
      return;
    }

    isInitializingGlobal = true;
    setIsInitializing(true);

    try {
      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
      if (!projectId) {
        throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set in environment variables');
      }

      // Check if client already exists (from another instance)
      const existingGlobalClient = globalSubstrateSignClient as SignClient | null;
      if (existingGlobalClient) {
        setClient(existingGlobalClient);
        setIsInitializing(false);
        isInitializedRef.current = true;
        isInitializingGlobal = false;
        const existingSessions = existingGlobalClient.session.getAll();
        setSessions(
          existingSessions
            .filter(s => {
              if (!s || !s.topic) return false;
              return s.namespaces?.polkadot !== undefined;
            })
            .map(s => ({
              topic: s.topic,
              peer: s.peer || { metadata: undefined },
              namespaces: s.namespaces || {},
            }))
        );
        return;
      }

      // Wait a bit to ensure any other WalletConnect initialization has finished first
      // This helps avoid storage conflicts
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Initialize SignClient with error handling for storage conflicts
      let signClient: SignClient;
      try {
        signClient = await SignClient.init({
          projectId,
          metadata: {
            name: 'Tempwallets Substrate',
            description: 'Temporary wallet service - Substrate',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://tempwallets.com',
            icons: [`${typeof window !== 'undefined' ? window.location.origin : 'https://tempwallets.com'}/tempwallets-logo.png`],
          },
        });
      } catch (initError: any) {
        // If initialization fails due to storage conflict, wait and retry once
        if (initError?.message?.includes('restore') || initError?.message?.includes('storage')) {
          console.warn('[SubstrateWalletConnect] Initialization conflict detected, retrying after delay...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          signClient = await SignClient.init({
            projectId,
            metadata: {
              name: 'Tempwallets Substrate',
              description: 'Temporary wallet service - Substrate',
              url: typeof window !== 'undefined' ? window.location.origin : 'https://tempwallets.com',
              icons: [`${typeof window !== 'undefined' ? window.location.origin : 'https://tempwallets.com'}/tempwallets-logo.png`],
            },
          });
        } else {
          throw initError;
        }
      }

      // Store globally to prevent re-initialization
      globalSubstrateSignClient = signClient;

      setClient(signClient);
      setIsInitializing(false);
      isInitializedRef.current = true;
      isInitializingGlobal = false;

      // Load existing sessions (with null checks and filter for Substrate-only)
      const existingSessions = signClient.session.getAll();
      const validSessions = existingSessions
        .filter(s => {
          // Only include sessions with Polkadot namespace (Substrate chains)
          if (!s || !s.topic) return false;
          return s.namespaces?.polkadot !== undefined;
        })
        .map(s => ({
          topic: s.topic,
          peer: s.peer || { metadata: undefined }, // Ensure peer exists
          namespaces: s.namespaces || {},
        }));

      setSessions(validSessions);

      // Clean up any invalid/stale sessions that might cause "No matching key" errors
      // This helps reduce console noise from WalletConnect
      try {
        const allSessions = signClient.session.getAll();
        for (const session of allSessions) {
          // If session doesn't have required properties, it might be stale
          if (!session.topic || !session.namespaces) {
            try {
              await signClient.disconnect({
                topic: session.topic,
                reason: {
                  code: 6000,
                  message: 'Cleaning up invalid session',
                },
              });
            } catch (err) {
              // Ignore errors when cleaning up - session might already be deleted
            }
          }
        }
      } catch (cleanupError) {
        // Ignore cleanup errors - non-critical
        console.debug('[SubstrateWalletConnect] Session cleanup error (non-critical):', cleanupError);
      }

      // Listen for session proposals
      signClient.on('session_proposal', async (event) => {
          console.log('[SubstrateWalletConnect] Session proposal received:', event);
          const { id, params } = event;
          pendingProposalsRef.current.set(id, params);
          
          // Check if this is a Polkadot namespace request
          const hasPolkadotNamespace = params.requiredNamespaces?.polkadot || params.optionalNamespaces?.polkadot;
          
          if (!hasPolkadotNamespace) {
            console.warn('[SubstrateWalletConnect] Proposal does not include Polkadot namespace, rejecting');
            await signClient.reject({
              id,
              reason: {
                code: 6001,
                message: 'This wallet only supports Polkadot/Substrate chains',
              },
            });
            return;
          }

          // Show approval dialog (you can customize this)
          const approved = window.confirm(
            `Connect to ${params.proposer.metadata?.name || 'Unknown DApp'}?\n\n` +
            `URL: ${params.proposer.metadata?.url || 'Unknown'}\n\n` +
            `This will allow the DApp to request transactions and signatures from your Substrate wallets.`
          );

          if (approved) {
            try {
              // Get Substrate accounts from backend
              const accountsData = await walletApi.getSubstrateWalletConnectAccounts(userId, false);
              
              // Build namespaces with ONLY Polkadot accounts
              const namespaces: SessionTypes.Namespaces = {};
              
              // Handle both required and optional namespaces
              const requiredPolkadot = params.requiredNamespaces?.polkadot;
              const optionalPolkadot = params.optionalNamespaces?.polkadot;
              
              if (!requiredPolkadot && !optionalPolkadot) {
                throw new Error('Polkadot namespace is required but not provided in the connection request');
              }

              // Get ALL required chains - we MUST include all of them in the response
              const requiredChains = requiredPolkadot?.chains || [];
              const optionalChains = optionalPolkadot?.chains || [];
              
              // Merge methods and events from both required and optional
              const requiredMethods = requiredPolkadot?.methods || [];
              const optionalMethods = optionalPolkadot?.methods || [];
              const allMethods = [...new Set([...requiredMethods, ...optionalMethods])];
              
              const requiredEvents = requiredPolkadot?.events || [];
              const optionalEvents = optionalPolkadot?.events || [];
              const allEvents = [...new Set([...requiredEvents, ...optionalEvents])];

              // Use all chains (required + optional) for the response
              const allChains = [...new Set([...requiredChains, ...optionalChains])];

              // Ensure we have at least some chains
              if (allChains.length === 0) {
                throw new Error('No chains specified in the connection request');
              }

              // Ensure we have at least one account
              if (!accountsData.accounts || accountsData.accounts.length === 0) {
                throw new Error('No Substrate accounts available. Please ensure your wallet has addresses created.');
              }

              // Build accounts for ALL requested chains using the same address
              // WalletConnect requires accounts in format: "polkadot:genesisHash:address"
              const baseAddress = accountsData.accounts[0]?.accountId?.split(':')[2];
              if (!baseAddress) {
                throw new Error('Invalid account format from backend');
              }

              // Create accounts for all requested chains
              const allAccounts: string[] = [];
              for (const chain of allChains) {
                // chain format is "polkadot:genesisHash"
                allAccounts.push(`${chain}:${baseAddress}`);
              }

              // Build the polkadot namespace with all required fields
              namespaces.polkadot = {
                accounts: allAccounts,
                methods: allMethods.length > 0 ? allMethods : SUBSTRATE_WALLETCONNECT_METHODS,
                events: allEvents.length > 0 ? allEvents : SUBSTRATE_WALLETCONNECT_EVENTS,
                chains: allChains,
              };

              // Validate namespaces before approving
              if (!namespaces.polkadot || !namespaces.polkadot.accounts || namespaces.polkadot.accounts.length === 0) {
                throw new Error('Cannot approve session: No accounts available');
              }

              if (!namespaces.polkadot.chains || namespaces.polkadot.chains.length === 0) {
                throw new Error('Cannot approve session: No chains specified');
              }

              console.log('[SubstrateWalletConnect] Approving session with namespaces:', JSON.stringify(namespaces, null, 2));

              // Approve session
              const { topic } = await signClient.approve({
                id,
                namespaces,
              });
              
              // Get full session object from store
              const session = signClient.session.get(topic);

              console.log('[SubstrateWalletConnect] Session approved:', session);
              
              // Update sessions (with null checks)
              setSessions(prev => [...prev, {
                topic: session.topic,
                peer: session.peer || { metadata: undefined },
                namespaces: session.namespaces || {},
              }]);
            } catch (err) {
              console.error('[SubstrateWalletConnect] Failed to approve session:', err);
              await signClient.reject({
                id,
                reason: {
                  code: 5000,
                  message: err instanceof Error ? err.message : 'Failed to approve session',
                },
              });
            }
          } else {
            await signClient.reject({
              id,
              reason: {
                code: 5000,
                message: 'User rejected the connection',
              },
            });
          }
        });

        // Listen for session requests (transaction/message signing)
        signClient.on('session_request', async (event) => {
          console.log('[SubstrateWalletConnect] Session request received:', event);
          const { id, topic, params } = event;
          const { request, chainId } = params;

          try {
            let result;

            switch (request.method) {
              case 'polkadot_signTransaction': {
                const { accountId, transactionPayload } = request.params as any;
                
                // Show confirmation dialog
                const confirmed = window.confirm(
                  `Sign transaction?\n\n` +
                  `Account: ${accountId}\n` +
                  `Chain: ${chainId}\n\n` +
                  `⚠️ Review transaction details carefully before confirming.`
                );

                if (!confirmed) {
                  throw new Error('User rejected transaction');
                }

                result = await walletApi.signSubstrateWalletConnectTransaction({
                  userId,
                  accountId,
                  transactionPayload,
                  useTestnet: false, // TODO: Detect from chainId
                });
                break;
              }

              case 'polkadot_signMessage': {
                const { accountId, message } = request.params as any;
                
                // Show confirmation dialog
                const confirmed = window.confirm(
                  `Sign message?\n\n` +
                  `Account: ${accountId}\n\n` +
                  `Message: ${message}\n\n` +
                  `Do you want to sign this message?`
                );

                if (!confirmed) {
                  throw new Error('User rejected message signing');
                }

                result = await walletApi.signSubstrateWalletConnectMessage({
                  userId,
                  accountId,
                  message,
                  useTestnet: false, // TODO: Detect from chainId
                });
                break;
              }

              default:
                throw new Error(`Unsupported method: ${request.method}`);
            }

            // Send successful response
            await signClient.respond({
              topic,
              response: {
                id,
                jsonrpc: '2.0',
                result,
              },
            });

            console.log('[SubstrateWalletConnect] Request handled successfully');
          } catch (err) {
            console.error('[SubstrateWalletConnect] Request handling failed:', err);
            
            // Send error response
            await signClient.respond({
              topic,
              response: {
                id,
                jsonrpc: '2.0',
                error: {
                  code: 5000,
                  message: err instanceof Error ? err.message : 'Unknown error',
                },
              },
            });
          }
        });

        // Listen for session delete
        signClient.on('session_delete', (event) => {
          console.log('[SubstrateWalletConnect] Session deleted:', event);
          setSessions(prev => prev.filter(s => s && s.topic && s.topic !== event.topic));
        });

        // Listen for errors and handle them gracefully (non-critical)
        signClient.core.relayer.on('relayer_error', (error: any) => {
          // These are non-critical errors - just log for debugging
          console.debug('[SubstrateWalletConnect] Relayer error (non-critical):', error);
        });

        // Suppress "No matching key" warnings - these are expected for stale sessions
        // Note: We previously patched console.error here, but it caused stability issues.
        // It's better to allow the warnings than to risk crashing the application.
      } catch (err) {
        console.error('[SubstrateWalletConnect] Initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize WalletConnect');
        setIsInitializing(false);
        isInitializingGlobal = false;
      }
    }, [userId]);

  // Auto-initialize only if client is already available (from previous session)
  useEffect(() => {
    if (!userId) {
      setIsInitializing(false);
      return;
    }

    // If client already exists, just set it
    if (globalSubstrateSignClient) {
      setClient(globalSubstrateSignClient);
      setIsInitializing(false);
      const existingSessions = globalSubstrateSignClient.session.getAll();
      setSessions(
        existingSessions
          .filter(s => {
            if (!s || !s.topic) return false;
            return s.namespaces?.polkadot !== undefined;
          })
          .map(s => ({
            topic: s.topic,
            peer: s.peer || { metadata: undefined },
            namespaces: s.namespaces || {},
          }))
      );
    } else {
      // Don't auto-initialize - wait for explicit initialize() call
      setIsInitializing(false);
    }
  }, [userId]);

  const pair = useCallback(async (uri: string) => {
    if (!client) {
      throw new Error('WalletConnect client not initialized');
    }

    if (!uri.startsWith('wc:')) {
      throw new Error('Invalid WalletConnect URI. Must start with "wc:"');
    }

    try {
      await client.pair({ uri });
      console.log('[SubstrateWalletConnect] Paired successfully');
    } catch (err) {
      console.error('[SubstrateWalletConnect] Pairing failed:', err);
      throw err;
    }
  }, [client]);

  const disconnect = useCallback(async (topic: string) => {
    if (!client) {
      throw new Error('WalletConnect client not initialized');
    }

    try {
      await client.disconnect({
        topic,
        reason: {
          code: 6000,
          message: 'User disconnected',
        },
      });
      
      setSessions(prev => prev.filter(s => s.topic !== topic));
    } catch (err) {
      console.error('[SubstrateWalletConnect] Disconnect failed:', err);
      throw err;
    }
  }, [client]);

  const approveSession = useCallback(async (proposalId: number, namespaces: SessionTypes.Namespaces) => {
    if (!client) {
      throw new Error('WalletConnect client not initialized');
    }

    try {
      const { topic } = await client.approve({
        id: proposalId,
        namespaces,
      });
      
      const session = client.session.get(topic);

      setSessions(prev => [...prev, {
        topic: session.topic,
        peer: session.peer,
        namespaces: session.namespaces,
      }]);
    } catch (err) {
      console.error('[SubstrateWalletConnect] Approve session failed:', err);
      throw err;
    }
  }, [client]);

  const rejectSession = useCallback(async (proposalId: number) => {
    if (!client) {
      throw new Error('WalletConnect client not initialized');
    }

    try {
      await client.reject({
        id: proposalId,
        reason: {
          code: 5000,
          message: 'User rejected the connection',
        },
      });
    } catch (err) {
      console.error('[SubstrateWalletConnect] Reject session failed:', err);
      throw err;
    }
  }, [client]);

  return {
    client,
    sessions,
    isInitializing,
    error,
    pair,
    disconnect,
    approveSession,
    rejectSession,
    initialize,
  };
}

