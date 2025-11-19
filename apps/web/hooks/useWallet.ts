import { useState, useCallback, useRef } from 'react';
import { walletApi, UiWalletPayload, ApiError, subscribeToSSE } from '@/lib/api';
import { walletStorage } from '@/lib/walletStorage';

export interface WalletData {
  name: string;
  address: string;
  chain: string;
  category?: string;
}

export interface UseWalletReturn {
  wallets: WalletData[];
  loading: boolean;
  error: string | null;
  loadWallets: (userId: string) => Promise<void>;
  changeWallets: (userId: string) => Promise<void>;
}

const SMART_ACCOUNT_FALLBACK_NAME = 'EVM Smart Account';
const SMART_ACCOUNT_CHAIN_KEY = 'evmSmartAccount';

const hasWalletEntries = (payload?: UiWalletPayload | null): boolean => {
  if (!payload) return false;
  if (payload.smartAccount?.address) return true;
  return payload.auxiliary?.some((entry) => !!entry.address) ?? false;
};

export function useWallet(): UseWalletReturn {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef<Record<string, boolean>>({});

  const processWallets = useCallback((payload?: UiWalletPayload | null) => {
    if (!payload) {
      setWallets([]);
      return;
    }

    const walletData: WalletData[] = [];

    if (payload.smartAccount?.address) {
      walletData.push({
        name: payload.smartAccount.label || SMART_ACCOUNT_FALLBACK_NAME,
        address: payload.smartAccount.address,
        chain: SMART_ACCOUNT_CHAIN_KEY,
      });
    }

    // Process all auxiliary entries (including Substrate chains)
    payload.auxiliary?.forEach((entry) => {
      if (!entry.address) return;
      walletData.push({
        name: entry.label || entry.chain,
        address: entry.address,
        chain: entry.chain,
        category: entry.category,
      });
    });

    setWallets(walletData);
  }, []);

  const loadWallets = useCallback(async (userId: string, forceRefresh: boolean = false) => {
    if (!userId) {
      return;
    }

    setError(null);
    
    // STEP 1: Always load from localStorage first (instant display)
    const cachedWallets = walletStorage.getAddresses(userId);
    const hasLoadedBefore = hasLoadedOnceRef.current[userId] || false;
    const hasWalletsInCache = hasWalletEntries(cachedWallets);
    
    // Check if cache has Substrate addresses
    const hasSubstrateInCache = cachedWallets?.auxiliary?.some(
      (entry) => entry.category === 'substrate' && entry.address
    ) || false;
    
    // If we have cached data and not forcing refresh, use cache and skip API
    // BUT: If cache doesn't have Substrate addresses, force refresh to get them
    if (hasWalletsInCache && !forceRefresh && hasLoadedBefore && hasSubstrateInCache) {
      processWallets(cachedWallets);
      return; // Skip API call - addresses don't change unless user changes wallet
    }
    
    // If cache is missing Substrate addresses, we need to force a refresh
    const needsSubstrateRefresh = hasWalletsInCache && !hasSubstrateInCache;
    if (needsSubstrateRefresh) {
      // Force refresh by resetting hasLoadedBefore for this case
      hasLoadedOnceRef.current[userId] = false;
    }

    // STEP 2: Load from cache immediately for display (even if we'll refresh)
    if (hasWalletsInCache && cachedWallets) {
      processWallets(cachedWallets);
    }

    // STEP 3: Only call API if first time, forceRefresh, or missing Substrate
    if (!forceRefresh && !needsSubstrateRefresh && hasLoadedBefore) {
      return;
    }

    // STEP 4: Fetch from backend using SSE for progressive loading
    // Only show blocking loader if we don't have cached wallets to show
    setLoading(!hasWalletsInCache);
    
    // Try SSE first for progressive loading
    const useSSE = typeof EventSource !== 'undefined';
    
    if (useSSE) {
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005'}/wallet/addresses-stream?userId=${encodeURIComponent(userId)}`;
      let completed = false;
      let unsubscribeFn: (() => void) | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      
      try {
        unsubscribeFn = subscribeToSSE<UiWalletPayload>(
          url,
          (data) => {
            if (!data) return;
            processWallets(data);
            walletStorage.setAddresses(userId, data);
          },
          (error) => {
            // Fallback to batch API
            if (unsubscribeFn) unsubscribeFn();
            if (timeoutId) clearTimeout(timeoutId);
            loadWalletsBatch(userId, cachedWallets ?? null);
          },
          () => {
            completed = true;
            if (timeoutId) clearTimeout(timeoutId);
            hasLoadedOnceRef.current[userId] = true;
            setLoading(false);
          }
        );

        // Cleanup function (timeout after 30 seconds)
        timeoutId = setTimeout(() => {
          if (!completed && unsubscribeFn) {
            unsubscribeFn();
            loadWalletsBatch(userId, cachedWallets ?? null);
          }
        }, 30000);

        // Wait a bit for SSE to complete, but don't block forever
        // The completion callback will handle the final state
        return;
      } catch (err) {
        if (unsubscribeFn) unsubscribeFn();
        if (timeoutId) clearTimeout(timeoutId);
        await loadWalletsBatch(userId, cachedWallets ?? null);
        return;
      }
    }
    
    // Fallback to batch API if SSE not supported
    await loadWalletsBatch(userId, cachedWallets ?? null);

    // Helper function for batch loading (fallback)
    async function loadWalletsBatch(userId: string, cachedPayload: UiWalletPayload | null) {
      try {
        // Try to get addresses from API
        let addresses: UiWalletPayload;
        try {
          addresses = await walletApi.getAddresses(userId);
        } catch (err) {
          // If 404, wallet doesn't exist - we'll create it
          if (err instanceof ApiError && err.status === 404) {
            // Auto-create wallet
            await walletApi.createOrImportSeed({
              userId,
              mode: 'random',
            });
            
            // Wait a moment for backend to process
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Fetch addresses again after creation
            addresses = await walletApi.getAddresses(userId);
          } else {
            // If it's a different error, check if we have cache to fall back to
            if (!cachedPayload) {
              throw err;
            }
            // If we have cache, use cached data
            hasLoadedOnceRef.current[userId] = true;
            setLoading(false);
            return;
          }
        }
        
        // Check if user has any wallets (in case addresses are all null)
        const hasWallets = hasWalletEntries(addresses);
        
        if (!hasWallets) {
          // Auto-create wallet if addresses are null
          await walletApi.createOrImportSeed({
            userId,
            mode: 'random',
          });
          
          // Wait a moment for backend to process
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Fetch addresses again after creation
          const newAddresses = await walletApi.getAddresses(userId);
          
          // Cache the new addresses
          walletStorage.setAddresses(userId, newAddresses);
          processWallets(newAddresses);
        } else {
          // Cache the addresses (including Substrate)
          walletStorage.setAddresses(userId, addresses);
          // Update wallets (they may be different from cache)
          processWallets(addresses);
        }

        // Mark as loaded
        hasLoadedOnceRef.current[userId] = true;
      } catch (err) {
        const errorMessage = err instanceof ApiError 
          ? err.message
          : 'Failed to load wallet';
        
        console.error('Error loading wallet:', err);
        
        // If we have cached data and API fails, keep showing cached data silently
        // Only show error if we don't have cached data to fall back to
        if (!cachedPayload) {
          setError(errorMessage);
        }
        hasLoadedOnceRef.current[userId] = true; // Mark as attempted even on error
      } finally {
        setLoading(false);
      }
    }
  }, [processWallets]);

  const changeWallets = useCallback(async (userId: string) => {
    // Clear the loaded flag and force refresh from API
    hasLoadedOnceRef.current[userId] = false;
    await loadWallets(userId, true); // Force refresh
  }, [loadWallets]);

  return {
    wallets,
    loading,
    error,
    loadWallets,
    changeWallets,
  };
}