'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { walletApi, AnyChainAsset, Transaction } from '@/lib/api';
import {
  getCache,
  setCache,
  isCacheFresh,
  getCacheKey,
  clearAllCache,
} from '@/lib/cache-utils';
import {
  NormalizedBalance,
  mergeAndNormalizeBalances,
} from '@/types/wallet-data';

interface WalletDataContextValue {
  balances: NormalizedBalance[];
  transactions: Transaction[];
  loading: {
    balances: boolean;
    transactions: boolean;
  };
  errors: {
    balances: string | null;
    transactions: string | null;
  };
  refresh: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  lastFetched: {
    balances: number | null;
    transactions: number | null;
  };
}

const WalletDataContext = createContext<WalletDataContextValue | null>(null);

interface WalletDataProviderProps {
  children: ReactNode;
  fingerprint: string | null;
}

// TTL constants
const BALANCE_TTL = 60 * 1000; // 60 seconds for balances
const TRANSACTION_TTL = 30 * 1000; // 30 seconds for transactions

export function WalletDataProvider({
  children,
  fingerprint,
}: WalletDataProviderProps) {
  const [balances, setBalances] = useState<NormalizedBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState({
    balances: false,
    transactions: false,
  });
  const [errors, setErrors] = useState({
    balances: null as string | null,
    transactions: null as string | null,
  });
  const [lastFetched, setLastFetched] = useState({
    balances: null as number | null,
    transactions: null as number | null,
  });

  // Track in-flight requests to prevent race conditions
  const balancesRequestRef = useRef<Promise<void> | null>(null);
  const transactionsRequestRef = useRef<Promise<void> | null>(null);

  // Fetch balances
  const fetchBalances = useCallback(async (
    showLoading: boolean = false,
    forceRefresh: boolean = false,
  ): Promise<void> => {
    if (!fingerprint) {
      setBalances([]);
      setLoading((prev) => ({ ...prev, balances: false }));
      return;
    }

    // Declare cache key outside conditional to enable caching response after fetch
    const cacheKey = getCacheKey(fingerprint, 'balances');

    // Check cache first (but skip if forceRefresh is true)
    if (!forceRefresh) {
      const cached = getCache<NormalizedBalance[]>(cacheKey);
      
      if (cached && isCacheFresh(cacheKey, BALANCE_TTL)) {
        setBalances(cached);
        setLoading((prev) => ({ ...prev, balances: false }));
        setErrors((prev) => ({ ...prev, balances: null }));
        
        // Try to get timestamp from cache entry
        try {
          const cacheEntry = localStorage.getItem(cacheKey);
          if (cacheEntry) {
            const parsed = JSON.parse(cacheEntry);
            if (parsed.timestamp) {
              setLastFetched((prev) => ({ ...prev, balances: parsed.timestamp }));
            }
          }
        } catch {
          // Ignore cache read errors
        }
        
        // Still refresh in background if cache is getting stale
        const cacheAge = Date.now() - (getCache(cacheKey) ? 
          (() => {
            try {
              const entry = localStorage.getItem(cacheKey);
              if (entry) {
                const parsed = JSON.parse(entry);
                return parsed.timestamp || 0;
              }
            } catch {}
            return 0;
          })() : 0);
        
        if (cacheAge > BALANCE_TTL * 0.8) {
          // Cache is >80% stale, refresh in background
          // Continue to fetch below
        } else {
          return; // Cache is fresh, skip fetch
        }
      }
    }

    // Prevent duplicate requests
    if (balancesRequestRef.current) {
      return balancesRequestRef.current;
    }

    // Only show loading spinner if explicitly requested (e.g., manual refresh)
    // For initial load with no cache, we show empty state instead
    if (showLoading) {
      setLoading((prev) => ({ ...prev, balances: true }));
    }
    setErrors((prev) => ({ ...prev, balances: null }));

    const fetchPromise = (async () => {
      try {
        // Fetch EVM and other chain assets
  const assets = await walletApi.getAssetsAny(fingerprint, forceRefresh);

        // Fetch Substrate balances
        let substrateBalances: Record<string, {
          balance: string;
          address: string | null;
          token: string;
          decimals: number;
        }> = {};
        
        try {
          substrateBalances = await walletApi.getSubstrateBalances(fingerprint, false);
        } catch (substrateErr) {
          console.warn('Failed to load Substrate balances:', substrateErr);
          // Don't fail the whole fetch if Substrate fails
        }

        // Fetch Aptos balances (testnet and mainnet)
        const aptosBalances: AnyChainAsset[] = [];
        try {
          // Fetch testnet balance
          try {
            const testnetBalance = await walletApi.getAptosBalance(fingerprint, 'testnet');
            // Convert APT to octas (8 decimals) for smallest units
            const balanceInOctas = (parseFloat(testnetBalance.balance) * Math.pow(10, 8)).toString();
            aptosBalances.push({
              chain: 'aptosTestnet',
              address: null,
              symbol: 'APT',
              balance: balanceInOctas,
              decimals: 8,
              balanceHuman: testnetBalance.balance,
            });
          } catch (testnetErr) {
            // Silently fail - Aptos testnet is optional
            if (process.env.NODE_ENV === 'development') {
              console.debug('Aptos testnet balance unavailable');
            }
          }

          // Fetch mainnet balance
          try {
            const mainnetBalance = await walletApi.getAptosBalance(fingerprint, 'mainnet');
            // Convert APT to octas (8 decimals) for smallest units
            const balanceInOctas = (parseFloat(mainnetBalance.balance) * Math.pow(10, 8)).toString();
            aptosBalances.push({
              chain: 'aptos',
              address: null,
              symbol: 'APT',
              balance: balanceInOctas,
              decimals: 8,
              balanceHuman: mainnetBalance.balance,
            });
          } catch (mainnetErr) {
            // Silently fail - Aptos mainnet is optional
            if (process.env.NODE_ENV === 'development') {
              console.debug('Aptos mainnet balance unavailable');
            }
          }
        } catch (aptosErr) {
          // Don't fail the whole fetch if Aptos fails
          // Only log in development
          if (process.env.NODE_ENV === 'development') {
            console.debug('Aptos balances unavailable');
          }
        }

        // Combine all assets including Aptos
        const allAssets = [...assets, ...aptosBalances];

        // Merge and normalize all balances
        const normalized = mergeAndNormalizeBalances(allAssets, substrateBalances);

        setBalances(normalized);
        setLastFetched((prev) => ({ ...prev, balances: Date.now() }));
        setErrors((prev) => ({ ...prev, balances: null }));

        // Cache the normalized balances
        setCache(cacheKey, normalized, BALANCE_TTL);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load balances';
        setErrors((prev) => ({ ...prev, balances: errorMessage }));
        console.error('Failed to fetch balances:', err);
      } finally {
        setLoading((prev) => ({ ...prev, balances: false }));
        balancesRequestRef.current = null;
      }
    })();

    balancesRequestRef.current = fetchPromise;
    return fetchPromise;
  }, [fingerprint]);

  // Fetch transactions
  const fetchTransactions = useCallback(async (
    showLoading: boolean = false,
    forceRefresh: boolean = false,
  ): Promise<void> => {
    if (!fingerprint) {
      setTransactions([]);
      setLoading((prev) => ({ ...prev, transactions: false }));
      return;
    }

    // Declare cache key outside conditional to enable caching response after fetch
    const cacheKey = getCacheKey(fingerprint, 'transactions');

    // Check cache first (but skip if forceRefresh is true)
    if (!forceRefresh) {
      const cached = getCache<Transaction[]>(cacheKey);
      
      if (cached && isCacheFresh(cacheKey, TRANSACTION_TTL)) {
        setTransactions(cached);
        setLoading((prev) => ({ ...prev, transactions: false }));
        setErrors((prev) => ({ ...prev, transactions: null }));
        
        // Try to get timestamp from cache entry
        try {
          const cacheEntry = localStorage.getItem(cacheKey);
          if (cacheEntry) {
            const parsed = JSON.parse(cacheEntry);
            if (parsed.timestamp) {
              setLastFetched((prev) => ({ ...prev, transactions: parsed.timestamp }));
            }
          }
        } catch {
          // Ignore cache read errors
        }
        
        // Still refresh in background if cache is getting stale
        const cacheAge = Date.now() - (getCache(cacheKey) ? 
          (() => {
            try {
              const entry = localStorage.getItem(cacheKey);
              if (entry) {
                const parsed = JSON.parse(entry);
                return parsed.timestamp || 0;
              }
            } catch {}
            return 0;
          })() : 0);
        
        if (cacheAge > TRANSACTION_TTL * 0.8) {
          // Cache is >80% stale, refresh in background
          // Continue to fetch below
        } else {
          return; // Cache is fresh, skip fetch
        }
      }
    }

    // Prevent duplicate requests
    if (transactionsRequestRef.current) {
      return transactionsRequestRef.current;
    }

    // Only show loading spinner if explicitly requested (e.g., manual refresh)
    // For initial load with no cache, we show empty state instead
    if (showLoading) {
      setLoading((prev) => ({ ...prev, transactions: true }));
    }
    setErrors((prev) => ({ ...prev, transactions: null }));

    const fetchPromise = (async () => {
      try {
        // Fetch aggregated any-chain transactions
        const allTransactions = await walletApi.getTransactionsAny(fingerprint, 100);

        // Load Substrate transactions for all Substrate chains
        const SUBSTRATE_CHAINS = [
          'polkadot',
          'hydrationSubstrate',
          'bifrostSubstrate',
          'uniqueSubstrate',
          'paseo',
          'paseoAssethub',
        ];
        const substrateTransactions: Transaction[] = [];

        // Fetch Substrate transactions in parallel
        const substratePromises = SUBSTRATE_CHAINS.map(async (chain) => {
          try {
            const history = await walletApi.getSubstrateTransactions(
              fingerprint,
              chain,
              false,
              10
            );
            // Transform Substrate transactions to Transaction format
            return history.transactions.map(
              (tx) =>
                ({
                  txHash: tx.txHash,
                  from: tx.from,
                  to: tx.to || null,
                  value: tx.amount || '0',
                  timestamp: tx.timestamp
                    ? Math.floor(tx.timestamp / 1000)
                    : null, // Convert ms to seconds if needed
                  blockNumber: tx.blockNumber || null,
                  status:
                    tx.status === 'finalized' || tx.status === 'inBlock'
                      ? 'success'
                      : tx.status === 'failed' || tx.status === 'error'
                      ? 'failed'
                      : 'pending',
                  chain: chain,
                  tokenSymbol: undefined,
                } as Transaction)
            );
          } catch (chainErr) {
            console.warn(`Failed to load transactions for ${chain}:`, chainErr);
            return [];
          }
        });

        try {
          const substrateResults = await Promise.allSettled(substratePromises);
          substrateResults.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              substrateTransactions.push(...result.value);
            }
          });
        } catch (substrateErr) {
          console.warn('Failed to load Substrate transactions:', substrateErr);
        }

        // Combine EVM and Substrate transactions
        const combinedTransactions = [...allTransactions, ...substrateTransactions];

        // Filter out transactions with invalid/missing data
        const validTransactions = combinedTransactions.filter(
          (tx) =>
            tx.txHash &&
            tx.txHash.length > 0 &&
            (tx.value !== undefined || tx.tokenSymbol !== undefined)
        );

        // Sort by timestamp (most recent first)
        validTransactions.sort((a, b) => {
          const timeA = a.timestamp || 0;
          const timeB = b.timestamp || 0;
          return timeB - timeA;
        });

        setTransactions(validTransactions);
        setLastFetched((prev) => ({ ...prev, transactions: Date.now() }));
        setErrors((prev) => ({ ...prev, transactions: null }));

        // Cache the transactions
        setCache(cacheKey, validTransactions, TRANSACTION_TTL);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load transactions';
        setErrors((prev) => ({ ...prev, transactions: errorMessage }));
        console.error('Failed to fetch transactions:', err);
      } finally {
        setLoading((prev) => ({ ...prev, transactions: false }));
        transactionsRequestRef.current = null;
      }
    })();

    transactionsRequestRef.current = fetchPromise;
    return fetchPromise;
  }, [fingerprint]);

  // Refresh function that respects TTL
  const refresh = useCallback(async (): Promise<void> => {
    if (!fingerprint) return;

    // Clear cache to force refresh
    clearAllCache(fingerprint);

    // Fetch both in parallel with loading indicators (manual refresh)
    await Promise.all([fetchBalances(true, true), fetchTransactions(true, true)]);
  }, [fingerprint, fetchBalances, fetchTransactions]);

  // Refresh balances only
  const refreshBalances = useCallback(async (): Promise<void> => {
    if (!fingerprint) return;

    // Fetch balances with loading indicator and force refresh (bypasses cache)
    await fetchBalances(true, true);
  }, [fingerprint, fetchBalances]);

  // Refresh transactions only
  const refreshTransactions = useCallback(async (): Promise<void> => {
    if (!fingerprint) return;

    // Fetch transactions with loading indicator and force refresh (bypasses cache)
    await fetchTransactions(true, true);
  }, [fingerprint, fetchTransactions]);

  // Helper to get cache timestamp
  const getCacheTimestamp = useCallback((cacheKey: string): number | null => {
    try {
      const entry = localStorage.getItem(cacheKey);
      if (entry) {
        const parsed = JSON.parse(entry);
        return parsed.timestamp || null;
      }
    } catch {
      // Ignore cache read errors
    }
    return null;
  }, []);

  // Initial fetch and fingerprint change handling
  useEffect(() => {
    if (!fingerprint) {
      setBalances([]);
      setTransactions([]);
      setLoading({ balances: false, transactions: false });
      setErrors({ balances: null, transactions: null });
      setLastFetched({ balances: null, transactions: null });
      return;
    }

    // Check cache synchronously BEFORE setting loading state
    const balanceCacheKey = getCacheKey(fingerprint, 'balances');
    const transactionCacheKey = getCacheKey(fingerprint, 'transactions');
    
    const cachedBalances = getCache<NormalizedBalance[]>(balanceCacheKey);
    const cachedTransactions = getCache<Transaction[]>(transactionCacheKey);
    
    const hasFreshBalanceCache = cachedBalances && isCacheFresh(balanceCacheKey, BALANCE_TTL);
    const hasFreshTransactionCache = cachedTransactions && isCacheFresh(transactionCacheKey, TRANSACTION_TTL);

    // Initialize state based on cache availability
    if (hasFreshBalanceCache) {
      // Cache exists and is fresh - show cached data immediately
      setBalances(cachedBalances);
      const balanceTimestamp = getCacheTimestamp(balanceCacheKey);
      if (balanceTimestamp) {
        setLastFetched((prev) => ({ ...prev, balances: balanceTimestamp }));
      }
    } else {
      // No cache or stale - show empty state immediately (not loading)
      setBalances([]);
      setLastFetched((prev) => ({ ...prev, balances: null }));
    }

    if (hasFreshTransactionCache) {
      // Cache exists and is fresh - show cached data immediately
      setTransactions(cachedTransactions);
      const transactionTimestamp = getCacheTimestamp(transactionCacheKey);
      if (transactionTimestamp) {
        setLastFetched((prev) => ({ ...prev, transactions: transactionTimestamp }));
      }
    } else {
      // No cache or stale - show empty state immediately (not loading)
      setTransactions([]);
      setLastFetched((prev) => ({ ...prev, transactions: null }));
    }

    // Set loading to false initially (we'll show empty state if no cache)
    // Only set loading to true if we're actually going to fetch
    setLoading({ 
      balances: false, // Start with false - will be set to true in fetchBalances if needed
      transactions: false // Start with false - will be set to true in fetchTransactions if needed
    });
    setErrors({ balances: null, transactions: null });

    // Fetch in background to update the data
    // fetchBalances and fetchTransactions will handle setting loading state appropriately
    fetchBalances();
    fetchTransactions();
  }, [fingerprint, fetchBalances, fetchTransactions, getCacheTimestamp]);

  const value: WalletDataContextValue = {
    balances,
    transactions,
    loading,
    errors,
    refresh,
    refreshBalances,
    refreshTransactions,
    lastFetched,
  };

  return (
    <WalletDataContext.Provider value={value}>
      {children}
    </WalletDataContext.Provider>
  );
}

export function useWalletDataContext(): WalletDataContextValue {
  const context = useContext(WalletDataContext);
  if (!context) {
    throw new Error(
      'useWalletDataContext must be used within WalletDataProvider'
    );
  }
  return context;
}

