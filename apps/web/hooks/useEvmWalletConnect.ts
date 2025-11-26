'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import SignClient from '@walletconnect/sign-client';
import { SessionTypes } from '@walletconnect/types';
import { walletApi, ApiError } from '@/lib/api';
import { getMainnetChainIds } from '@/lib/evm-chain-ids';

const EVM_WALLETCONNECT_METHODS = [
  'eth_sendTransaction',
  'eth_signTransaction',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  'wallet_getCapabilities',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
];

const EVM_WALLETCONNECT_EVENTS = ['chainChanged', 'accountsChanged'];

export interface EvmWalletConnectSession {
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

export interface UseEvmWalletConnectReturn {
  client: SignClient | null;
  sessions: EvmWalletConnectSession[];
  isInitializing: boolean;
  error: string | null;
  pair: (uri: string) => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
  approveSession: (proposalId: number, namespaces: SessionTypes.Namespaces) => Promise<void>;
  rejectSession: (proposalId: number) => Promise<void>;
  initialize: () => Promise<void>; // Lazy initialization method
}

/**
 * Hook for EVM WalletConnect connections
 * 
 * Only handles eip155 namespace - Substrate chains are excluded
 */
// Global client instance to prevent multiple initializations (separate from Substrate)
let globalEvmSignClient: SignClient | null = null;
let isInitializingEvmGlobal = false;

export function useEvmWalletConnect(userId: string | null): UseEvmWalletConnectReturn {
  const [client, setClient] = useState<SignClient | null>(null);
  const [sessions, setSessions] = useState<EvmWalletConnectSession[]>([]);
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
    if (globalEvmSignClient) {
      if (client !== globalEvmSignClient) {
        setClient(globalEvmSignClient);
      }
      setIsInitializing(false);
      isInitializedRef.current = true;
      const existingSessions = globalEvmSignClient.session.getAll();
      setSessions(
        existingSessions
          .filter(s => {
            if (!s || !s.topic) return false;
            return s.namespaces?.eip155 !== undefined;
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
    if (isInitializingEvmGlobal) {
      // Wait for existing initialization
      let waitCount = 0;
      while (isInitializingEvmGlobal && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      const existingClient = globalEvmSignClient as SignClient | null;
      if (existingClient) {
        setClient(existingClient);
        setIsInitializing(false);
        isInitializedRef.current = true;
        const existingSessions = existingClient.session.getAll();
        setSessions(
          existingSessions
            .filter(s => {
              if (!s || !s.topic) return false;
              return s.namespaces?.eip155 !== undefined;
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

    isInitializingEvmGlobal = true;
    setIsInitializing(true);

    try {
      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
      if (!projectId) {
        throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set in environment variables');
      }

      // Check if client already exists (from another instance)
      const existingGlobalClient = globalEvmSignClient as SignClient | null;
      if (existingGlobalClient) {
        setClient(existingGlobalClient);
        setIsInitializing(false);
        isInitializedRef.current = true;
        isInitializingEvmGlobal = false;
        const existingSessions = existingGlobalClient.session.getAll();
        setSessions(
          existingSessions
            .filter(s => {
              if (!s || !s.topic) return false;
              return s.namespaces?.eip155 !== undefined;
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
            name: 'Tempwallets EVM',
            description: 'Temporary wallet service - EVM',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://tempwallets.com',
            icons: [`${typeof window !== 'undefined' ? window.location.origin : 'https://tempwallets.com'}/tempwallets-logo.png`],
          },
        });
      } catch (initError: any) {
        // If initialization fails due to storage conflict, wait and retry once
        if (initError?.message?.includes('restore') || initError?.message?.includes('storage')) {
          console.warn('[EvmWalletConnect] Initialization conflict detected, retrying after delay...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          signClient = await SignClient.init({
            projectId,
            metadata: {
              name: 'Tempwallets EVM',
              description: 'Temporary wallet service - EVM',
              url: typeof window !== 'undefined' ? window.location.origin : 'https://tempwallets.com',
              icons: [`${typeof window !== 'undefined' ? window.location.origin : 'https://tempwallets.com'}/tempwallets-logo.png`],
            },
          });
        } else {
          throw initError;
        }
      }

      // Store globally to prevent re-initialization
      globalEvmSignClient = signClient;

      setClient(signClient);
      setIsInitializing(false);
      isInitializedRef.current = true;
      isInitializingEvmGlobal = false;

      // Load existing sessions (with null checks and filter for EVM-only)
      const existingSessions = signClient.session.getAll();
      const validSessions = existingSessions
        .filter(s => {
          // Only include sessions with eip155 namespace (EVM chains)
          if (!s || !s.topic) return false;
          return s.namespaces?.eip155 !== undefined;
        })
        .map(s => ({
          topic: s.topic,
          peer: s.peer || { metadata: undefined },
          namespaces: s.namespaces || {},
        }));

      setSessions(validSessions);

      // Clean up any invalid/stale sessions
      try {
        const allSessions = signClient.session.getAll();
        for (const session of allSessions) {
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
              // Ignore errors when cleaning up
            }
          }
        }
      } catch (cleanupError) {
        console.debug('[EvmWalletConnect] Session cleanup error (non-critical):', cleanupError);
      }

      // Listen for session proposals
      signClient.on('session_proposal', async (event) => {
        console.log('[EvmWalletConnect] Session proposal received:', event);
        const { id, params } = event;
        pendingProposalsRef.current.set(id, params);
        
        // Check if this is an EIP-155 (EVM) namespace request
        const hasEip155Namespace = params.requiredNamespaces?.eip155 || params.optionalNamespaces?.eip155;
        
        if (!hasEip155Namespace) {
          console.warn('[EvmWalletConnect] Proposal does not include EIP-155 namespace, rejecting');
          await signClient.reject({
            id,
            reason: {
              code: 6001,
              message: 'This wallet only supports EVM chains',
            },
          });
          return;
        }

        // Show approval dialog
        const approved = window.confirm(
          `Connect to ${params.proposer.metadata?.name || 'Unknown DApp'}?\n\n` +
          `URL: ${params.proposer.metadata?.url || 'Unknown'}\n\n` +
          `This will allow the DApp to request transactions and signatures from your EVM wallets.`
        );

        if (approved) {
          try {
            // Get EVM accounts from backend
            const accountsData = await walletApi.getEvmWalletConnectAccounts(userId, false);
            
            // Build namespaces with ONLY EIP-155 accounts
            const namespaces: SessionTypes.Namespaces = {};
            
            // Handle both required and optional namespaces
            const eip155Namespace = params.requiredNamespaces?.eip155 || params.optionalNamespaces?.eip155;
            
            if (!eip155Namespace) {
              throw new Error('EIP-155 namespace is required but not provided in the connection request');
            }

            const chains = eip155Namespace.chains || [];
            const methods = eip155Namespace.methods || EVM_WALLETCONNECT_METHODS;
            const events = eip155Namespace.events || EVM_WALLETCONNECT_EVENTS;

            // Ensure chains array is not empty
            if (chains.length === 0) {
              // If no specific chains requested, use all mainnet chains
              const mainnetChainIds = getMainnetChainIds();
              chains.push(...mainnetChainIds.map(id => `eip155:${id}`));
            }

            // Ensure methods array is not empty
            if (methods.length === 0) {
              throw new Error('No methods specified in the connection request');
            }

            // Filter accounts to only include chains requested by the dapp
            const requestedChainIds = chains.map((c: string) => c.split(':')[1]); // Extract chain ID
            const filteredAccounts = accountsData.accounts.filter(acc => {
              const accountChainId = acc.accountId.split(':')[1];
              return requestedChainIds.includes(accountChainId);
            });

            // If no accounts match the requested chains, use all available accounts
            const accountsToUse = filteredAccounts.length > 0 
              ? filteredAccounts 
              : accountsData.accounts;

            // Ensure we have at least one account
            if (accountsToUse.length === 0) {
              throw new Error('No EVM accounts available. Please ensure your wallet has addresses created.');
            }

            // Build the eip155 namespace with all required fields
            namespaces.eip155 = {
              accounts: accountsToUse.map(acc => acc.accountId),
              methods: Array.isArray(methods) && methods.length > 0 ? methods : EVM_WALLETCONNECT_METHODS,
              events: Array.isArray(events) && events.length > 0 ? events : EVM_WALLETCONNECT_EVENTS,
              chains: Array.isArray(chains) && chains.length > 0 ? chains : [],
            };

            // Validate namespaces before approving
            if (!namespaces.eip155 || !namespaces.eip155.accounts || namespaces.eip155.accounts.length === 0) {
              throw new Error('Cannot approve session: No accounts available');
            }

            if (!namespaces.eip155.chains || namespaces.eip155.chains.length === 0) {
              throw new Error('Cannot approve session: No chains specified');
            }

            console.log('[EvmWalletConnect] Approving session with namespaces:', JSON.stringify(namespaces, null, 2));

            // Approve session
            const { topic } = await signClient.approve({
              id,
              namespaces,
            });
            
            // Get full session object from store
            const session = signClient.session.get(topic);

            console.log('[EvmWalletConnect] Session approved:', session);
            
            // Update sessions
            setSessions(prev => [...prev, {
              topic: session.topic,
              peer: session.peer || { metadata: undefined },
              namespaces: session.namespaces || {},
            }]);
          } catch (err) {
            console.error('[EvmWalletConnect] Failed to approve session:', err);
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
        console.log('[EvmWalletConnect] Session request received:', event);
        const { id, topic, params } = event;
        const { request, chainId } = params;

        try {
          let result;

          switch (request.method) {
            case 'eth_sendTransaction':
            case 'eth_signTransaction': {
              const [transaction] = request.params as any[];
              
              // Extract accountId (from address)
              const accountId = `eip155:${chainId.split(':')[1]}:${transaction.from}`;
              
              // Show confirmation dialog
              const confirmed = window.confirm(
                `Sign transaction?\n\n` +
                `Account: ${accountId}\n` +
                `To: ${transaction.to || 'Contract Creation'}\n` +
                `Value: ${transaction.value || '0'}\n\n` +
                `⚠️ Review transaction details carefully before confirming.`
              );

              if (!confirmed) {
                throw new Error('User rejected transaction');
              }

              const signResult = await walletApi.signEvmWalletConnectTransaction({
                userId,
                accountId,
                transaction,
                useTestnet: false, // TODO: Detect from chainId
              });
              
              result = signResult.signature;
              break;
            }

            case 'personal_sign':
            case 'eth_sign': {
              // personal_sign format: [message, address]
              const [message, address] = request.params as [string, string];
              
              // Extract accountId
              const accountId = `eip155:${chainId.split(':')[1]}:${address}`;
              
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

              const signResult = await walletApi.signEvmWalletConnectMessage({
                userId,
                accountId,
                message,
                useTestnet: false,
              });
              
              result = signResult.signature;
              break;
            }

            case 'eth_signTypedData':
            case 'eth_signTypedData_v4': {
              // Format: [address, typedData]
              const [address, typedDataStr] = request.params as [string, string];
              const typedData = typeof typedDataStr === 'string' ? JSON.parse(typedDataStr) : typedDataStr;
              
              // Extract accountId
              const accountId = `eip155:${chainId.split(':')[1]}:${address}`;
              
              // Show confirmation dialog
              const confirmed = window.confirm(
                `Sign typed data?\n\n` +
                `Account: ${accountId}\n\n` +
                `Primary Type: ${typedData.primaryType}\n\n` +
                `⚠️ Review typed data carefully before confirming.`
              );

              if (!confirmed) {
                throw new Error('User rejected typed data signing');
              }

              const signResult = await walletApi.signEvmWalletConnectTypedData({
                userId,
                accountId,
                typedData,
                useTestnet: false,
              });
              
              result = signResult.signature;
              break;
            }

            case 'wallet_getCapabilities': {
              // Return EIP-5792 wallet capabilities
              // Indicate support for smart accounts and EIP-1559
              result = {
                [chainId]: {
                  eip1559: {
                    supported: true,
                  },
                  smartAccounts: {
                    supported: true,
                  },
                },
              };
              break;
            }

            case 'wallet_switchEthereumChain': {
              // Handle chain switching request
              // For now, just acknowledge - actual switching handled by dapp
              const [switchParams] = request.params as [{ chainId: string }];
              console.log('[EvmWalletConnect] Chain switch requested:', switchParams);
              result = null;
              break;
            }

            case 'wallet_addEthereumChain': {
              // Handle add chain request
              // For now, just acknowledge - chain already supported
              const [addChainParams] = request.params as [any];
              console.log('[EvmWalletConnect] Add chain requested:', addChainParams);
              result = null;
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

          console.log('[EvmWalletConnect] Request handled successfully');
        } catch (err) {
          console.error('[EvmWalletConnect] Request handling failed:', err);
          
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
        console.log('[EvmWalletConnect] Session deleted:', event);
        setSessions(prev => prev.filter(s => s && s.topic && s.topic !== event.topic));
      });

      // Listen for errors and handle them gracefully (non-critical)
      signClient.core.relayer.on('relayer_error', (error: any) => {
        console.debug('[EvmWalletConnect] Relayer error (non-critical):', error);
      });
    } catch (err) {
      console.error('[EvmWalletConnect] Initialization failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize WalletConnect');
      setIsInitializing(false);
      isInitializingEvmGlobal = false;
    }
  }, [userId]);

  // Auto-initialize only if client is already available (from previous session)
  useEffect(() => {
    if (!userId) {
      setIsInitializing(false);
      return;
    }

    // If client already exists, just set it
    if (globalEvmSignClient) {
      setClient(globalEvmSignClient);
      setIsInitializing(false);
      const existingSessions = globalEvmSignClient.session.getAll();
      setSessions(
        existingSessions
          .filter(s => {
            if (!s || !s.topic) return false;
            return s.namespaces?.eip155 !== undefined;
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
      console.log('[EvmWalletConnect] Paired successfully');
    } catch (err) {
      console.error('[EvmWalletConnect] Pairing failed:', err);
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
      console.error('[EvmWalletConnect] Disconnect failed:', err);
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
      console.error('[EvmWalletConnect] Approve session failed:', err);
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
      console.error('[EvmWalletConnect] Reject session failed:', err);
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

