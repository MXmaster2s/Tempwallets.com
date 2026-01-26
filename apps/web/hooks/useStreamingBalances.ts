/**
 * Streaming Balances Hook
 * 
 * Progressive balance loading with SSE support.
 * Fetches balances for each wallet independently and updates UI as soon as data is available.
 * 
 * Features:
 * - SSE streaming for progressive loading
 * - Per-wallet balance states
 * - Automatic fallback to batch loading
 * - Balance caching with TTL
 * - Rate limiting handling
 * - Automatic cleanup on unmount
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { subscribeToSSE, walletApi, type TokenBalance as ApiTokenBalance } from '@/lib/api';
import type { 
  BalanceStreamState, 
  BalanceData, 
  NativeBalance,
  TokenBalance,
} from '@/types/wallet.types';
import { getWalletConfig, getWalletConfigs } from '@/lib/wallet-config';
import { isBalanceCacheValid, calculateTotalUSD } from '@/lib/balance-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

/**
 * Balance payload from backend SSE stream
 */
interface BalancePayload {
  configId: string;
  chain: string;
  native: {
    balance: string;
    symbol: string;
    decimals: number;
    usdValue?: number;
  } | null;
  tokens: ApiTokenBalance[];
  totalUsdValue?: number;
  error?: string;
}

/**
 * Map backend chain name to wallet config ID
 * Backend uses names like 'ethereum', 'base', 'arbitrum', etc.
 * We map to config IDs like 'ethereumErc4337', 'baseErc4337', etc.
 */
function mapChainNameToConfigId(chainName: string): string {
  // EVM chains map to ERC-4337 smart accounts
  const evmMappings: Record<string, string> = {
    'ethereum': 'ethereumErc4337',
    'base': 'baseErc4337',
    'arbitrum': 'arbitrumErc4337',
    'polygon': 'polygonErc4337',
    'avalanche': 'avalancheErc4337',
  };
  
  // Other chains (Bitcoin, Solana, Tron)
  const otherMappings: Record<string, string> = {
    'bitcoin': 'bitcoin',
    'solana': 'solana',
    'tron': 'tron',
  };
  
  return evmMappings[chainName] || otherMappings[chainName] || chainName;
}

/**
 * Return type for useStreamingBalances hook
 */
export interface UseStreamingBalancesReturn {
  /** Balance states indexed by wallet config ID */
  balances: Record<string, BalanceStreamState>;
  
  /** Global loading state (true if any balance is loading) */
  loading: boolean;
  
  /** Global error state */
  error: string | null;
  
  /** Load balances (triggers streaming or batch) */
  loadBalances: (userId: string, forceRefresh?: boolean) => Promise<void>;
  
  /** Get balance for specific wallet */
  getBalance: (configId: string) => BalanceStreamState | undefined;
  
  /** Get balances by chain type */
  getBalancesByType: (chainType: string) => BalanceStreamState[];
  
  /** Refresh specific wallet balance */
  refreshBalance: (userId: string, configId: string) => Promise<void>;
  
  /** Whether streaming is active */
  isStreaming: boolean;
  
  /** Number of balances loaded */
  loadedCount: number;
  
  /** Total number of wallets */
  totalCount: number;
}

/**
 * Default cache TTL (1 minute)
 */
const DEFAULT_CACHE_TTL = 60000;

/**
 * Convert API token balance to internal format
 */
function convertTokenBalance(apiToken: ApiTokenBalance): TokenBalance {
  return {
    address: apiToken.address,
    symbol: apiToken.symbol,
    balance: apiToken.balance,
    decimals: apiToken.decimals,
    balanceHuman: undefined, // Backend may provide this
    usdValue: undefined, // TODO: Add USD value support from backend
    name: undefined,
    logoUrl: undefined,
  };
}

/**
 * Process balance payload from backend
 */
function processBalancePayload(payload: BalancePayload, configId: string): BalanceData {
  const native: NativeBalance | null = payload.native
    ? {
        balance: payload.native.balance,
        formatted: payload.native.balance, // TODO: Format properly
        symbol: payload.native.symbol,
        decimals: payload.native.decimals,
        usdValue: payload.native.usdValue,
      }
    : null;

  const tokens: TokenBalance[] = payload.tokens.map(convertTokenBalance);

  return {
    configId,
    native,
    tokens,
    totalUsdValue: payload.totalUsdValue || calculateTotalUSD(native, tokens),
    lastUpdated: new Date(),
    error: payload.error || null,
  };
}

/**
 * Hook for streaming balance data
 */
export function useStreamingBalances(): UseStreamingBalancesReturn {
  const [balances, setBalances] = useState<Record<string, BalanceStreamState>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track active connections and loading state
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isLoadingRef = useRef<Record<string, boolean>>({});
  const activeConnectionRef = useRef<EventSource | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (activeConnectionRef.current) {
        activeConnectionRef.current.close();
      }
    };
  }, []);

  /**
   * Update a single balance state
   */
  const updateBalance = useCallback((configId: string, update: Partial<BalanceStreamState>) => {
    setBalances((prev) => {
      const existing = prev[configId] || {
        configId,
        loading: false,
        balanceData: null,
      };

      return {
        ...prev,
        [configId]: {
          ...existing,
          ...update,
          lastUpdated: update.lastUpdated || existing.lastUpdated,
        },
      };
    });
  }, []);

  /**
   * Load balances via batch API
   */
  const loadViaBatch = useCallback(
    async (userId: string, forceRefresh: boolean = false): Promise<void> => {
      if (process.env.NODE_ENV === 'development') {
        console.debug('📦 Loading balances via batch...');
      }
      setError(null);

      try {
        // Get all wallet configurations that support balance fetching
        const configs = getWalletConfigs({ capabilities: { balanceFetch: true } });

        // Mark all as loading
        configs.forEach((config) => {
          updateBalance(config.id, { loading: true });
        });

        // Fetch balances for EVM chains
        const evmConfigs = configs.filter((config) => config.type === 'evm');
        
        if (evmConfigs.length > 0) {
          try {
            const evmBalances = await walletApi.getBalances(userId);
            
            evmBalances.forEach((balance) => {
              // Map chain name to config ID
              const configId = mapChainNameToConfigId(balance.chain);
              const config = evmConfigs.find((c) => c.id === configId);
              
              if (config) {
                const balanceData: BalanceData = {
                  configId: config.id,
                  native: {
                    balance: balance.balance,
                    formatted: balance.balance, // TODO: Format properly using balance-utils
                    symbol: config.symbol,
                    decimals: 18,
                    usdValue: undefined,
                  },
                  tokens: [],
                  totalUsdValue: undefined,
                  lastUpdated: new Date(),
                  error: null,
                };

                updateBalance(config.id, {
                  loading: false,
                  balanceData,
                  error: null,
                  lastUpdated: new Date(),
                  cacheTTL: DEFAULT_CACHE_TTL,
                });
              }
            });
          } catch (err) {
            console.error('Error fetching EVM balances:', err);
            evmConfigs.forEach((config) => {
              updateBalance(config.id, {
                loading: false,
                error: err instanceof Error ? err.message : 'Failed to fetch balance',
              });
            });
          }
        }

        // Fetch balances for Aptos chains
        const aptosConfigs = configs.filter((config) => config.type === 'aptos');
        
        if (aptosConfigs.length > 0) {
          try {
            // Fetch balance for each Aptos config (mainnet/testnet)
            await Promise.all(
              aptosConfigs.map(async (config) => {
                try {
                  const network = config.isTestnet ? 'testnet' : 'mainnet';
                  const balanceData = await walletApi.getAptosBalance(userId, network);
                  
                  // Convert balance from string to octas (8 decimals)
                  const balanceInOctas = (parseFloat(balanceData.balance) * Math.pow(10, 8)).toString();
                  
                  const balance: BalanceData = {
                    configId: config.id,
                    native: {
                      balance: balanceInOctas,
                      formatted: balanceData.balance,
                      symbol: 'APT',
                      decimals: 8,
                      usdValue: undefined,
                    },
                    tokens: [],
                    totalUsdValue: undefined,
                    lastUpdated: new Date(),
                    error: null,
                  };

                  updateBalance(config.id, {
                    loading: false,
                    balanceData: balance,
                    error: null,
                    lastUpdated: new Date(),
                    cacheTTL: DEFAULT_CACHE_TTL,
                  });
                } catch (err) {
                  console.error(`Error fetching Aptos balance for ${config.id}:`, err);
                  updateBalance(config.id, {
                    loading: false,
                    error: err instanceof Error ? err.message : 'Failed to fetch balance',
                  });
                }
              })
            );
          } catch (err) {
            console.error('Error fetching Aptos balances:', err);
            aptosConfigs.forEach((config) => {
              updateBalance(config.id, {
                loading: false,
                error: err instanceof Error ? err.message : 'Failed to fetch balance',
              });
            });
          }
        }

        // Mark remaining as complete (for chains without balance support)
        configs.forEach((config) => {
          setBalances((prev) => {
            const currentState = prev[config.id];
            if (!currentState || currentState.loading) {
              return {
                ...prev,
                [config.id]: {
                  configId: config.id,
                  loading: false,
                  balanceData: null,
                  error: 'Balance fetching not implemented for this chain',
                },
              };
            }
            return prev;
          });
        });

        if (process.env.NODE_ENV === 'development') {
          console.debug('✅ Batch balance loading complete');
        }
      } catch (err) {
        console.error('❌ Batch loading error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load balances');
        throw err;
      }
    },
    [updateBalance],
  );

  /**
   * Load balances via SSE streaming
   */
  const loadViaStreaming = useCallback(
    (userId: string, forceRefresh: boolean = false): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Prevent duplicate calls for the same userId
        if (isLoadingRef.current[userId] && !forceRefresh) {
          return;
        }

        // Cleanup existing connection synchronously BEFORE creating new one
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }

        // Close active EventSource connection if exists
        if (activeConnectionRef.current) {
          activeConnectionRef.current.close();
          activeConnectionRef.current = null;
        }

        if (process.env.NODE_ENV === 'development') {
          console.debug('📡 Streaming balances...');
        }
        setIsStreaming(true);
        setError(null);
        isLoadingRef.current[userId] = true;

        const url = `${API_BASE_URL}/wallet/balances-stream?userId=${encodeURIComponent(userId)}&forceRefresh=${forceRefresh}`;
        
        let hasReceivedData = false;
        let streamCompleted = false;
        let timeoutId: NodeJS.Timeout | null = null;

        const cleanup = subscribeToSSE<BalancePayload>(
          url,
          // onMessage
          (payload) => {
            hasReceivedData = true;
            // Map chain name to configId if configId is not provided
            const configId = payload.configId || mapChainNameToConfigId(payload.chain);
            const balanceData = processBalancePayload(payload, configId);

            updateBalance(configId, {
              loading: false,
              balanceData,
              error: payload.error || null,
              lastUpdated: new Date(),
              cacheTTL: DEFAULT_CACHE_TTL,
            });
          },
          // onError
          (err) => {
            console.error('❌ Balance streaming error:', err);
            setError(err.message);
            setIsStreaming(false);
            isLoadingRef.current[userId] = false;
            if (timeoutId) clearTimeout(timeoutId);
            activeConnectionRef.current = null;
            // Fallback to batch loading
            loadViaBatch(userId, forceRefresh)
              .then(resolve)
              .catch(reject);
          },
          // onComplete
          () => {
            streamCompleted = true;
            if (process.env.NODE_ENV === 'development') {
              console.debug('✅ Balance streaming complete');
            }
            setIsStreaming(false);
            isLoadingRef.current[userId] = false;
            if (timeoutId) clearTimeout(timeoutId);
            activeConnectionRef.current = null;
            resolve();
          },
        );

        unsubscribeRef.current = cleanup;

        // Timeout after 30 seconds
        timeoutId = setTimeout(() => {
          if (!streamCompleted) {
            console.warn('⏱️ Balance streaming timeout, falling back to batch...');
            cleanup();
            setIsStreaming(false);
            isLoadingRef.current[userId] = false;
            activeConnectionRef.current = null;
            
            if (!hasReceivedData) {
              // Fallback to batch loading
              loadViaBatch(userId, forceRefresh)
                .then(resolve)
                .catch(reject);
            } else {
              // We got some data, consider it success
              resolve();
            }
          }
        }, 30000);
      });
    },
    [updateBalance, loadViaBatch],
  );


  /**
   * Load balances (tries streaming first, falls back to batch)
   */
  const loadBalances = useCallback(
    async (userId: string, forceRefresh: boolean = false): Promise<void> => {
      // Check cache if not forcing refresh
      if (!forceRefresh) {
        const cachedBalances = Object.values(balances).filter(
          (balance) => balance.balanceData && isBalanceCacheValid(balance.lastUpdated, balance.cacheTTL),
        );
        
        if (cachedBalances.length > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.debug(`💾 Using cached balances for ${cachedBalances.length} wallets`);
          }
          return;
        }
      }

      try {
        // Try streaming first
        await loadViaStreaming(userId, forceRefresh);
      } catch (err) {
        console.warn('Streaming failed, falling back to batch:', err);
        // Fallback to batch if streaming fails
        await loadViaBatch(userId, forceRefresh);
      }
    },
    [balances, loadViaStreaming, loadViaBatch],
  );

  /**
   * Refresh specific wallet balance
   */
  const refreshBalance = useCallback(
    async (userId: string, configId: string): Promise<void> => {
      const config = getWalletConfig(configId);
      if (!config || !config.capabilities.balanceFetch) {
        console.warn(`Balance fetching not supported for ${configId}`);
        return;
      }

      updateBalance(configId, { loading: true, error: null });

      try {
        // Implement single balance refresh based on chain type
        if (config.type === 'evm') {
          const balances = await walletApi.getBalances(userId);
          // Find the balance for this specific config's chain
          const balance = balances.find((b) => mapChainNameToConfigId(b.chain) === configId);
          
          if (balance) {
            const balanceData: BalanceData = {
              configId,
              native: {
                balance: balance.balance,
                formatted: balance.balance,
                symbol: config.symbol,
                decimals: 18,
                usdValue: undefined,
              },
              tokens: [],
              totalUsdValue: undefined,
              lastUpdated: new Date(),
              error: null,
            };

            updateBalance(configId, {
              loading: false,
              balanceData,
              error: null,
              lastUpdated: new Date(),
              cacheTTL: DEFAULT_CACHE_TTL,
            });
          }
        } else if (config.type === 'aptos') {
          const network = config.isTestnet ? 'testnet' : 'mainnet';
          const balanceData = await walletApi.getAptosBalance(userId, network);
          
          // Convert balance from string to octas (8 decimals)
          const balanceInOctas = (parseFloat(balanceData.balance) * Math.pow(10, 8)).toString();
          
          const balance: BalanceData = {
            configId,
            native: {
              balance: balanceInOctas,
              formatted: balanceData.balance,
              symbol: 'APT',
              decimals: 8,
              usdValue: undefined,
            },
            tokens: [],
            totalUsdValue: undefined,
            lastUpdated: new Date(),
            error: null,
          };

          updateBalance(configId, {
            loading: false,
            balanceData: balance,
            error: null,
            lastUpdated: new Date(),
            cacheTTL: DEFAULT_CACHE_TTL,
          });
        }
      } catch (err) {
        console.error(`Error refreshing balance for ${configId}:`, err);
        updateBalance(configId, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to refresh balance',
        });
      }
    },
    [updateBalance],
  );

  /**
   * Get balance for specific wallet
   */
  const getBalance = useCallback(
    (configId: string): BalanceStreamState | undefined => {
      return balances[configId];
    },
    [balances],
  );

  /**
   * Get balances by chain type
   */
  const getBalancesByType = useCallback(
    (chainType: string): BalanceStreamState[] => {
      return Object.values(balances).filter((balance) => {
        const config = getWalletConfig(balance.configId);
        return config?.type === chainType;
      });
    },
    [balances],
  );

  /**
   * Calculate derived state
   */
  const loading = useMemo(
    () => Object.values(balances).some((balance) => balance.loading),
    [balances],
  );

  const loadedCount = useMemo(
    () => Object.values(balances).filter((balance) => balance.balanceData !== null).length,
    [balances],
  );

  const totalCount = useMemo(() => Object.keys(balances).length, [balances]);

  return {
    balances,
    loading,
    error,
    loadBalances,
    getBalance,
    getBalancesByType,
    refreshBalance,
    isStreaming,
    loadedCount,
    totalCount,
  };
}
