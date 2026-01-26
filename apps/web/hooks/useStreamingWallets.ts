import { useState, useCallback, useRef, useEffect } from 'react';
import { subscribeToSSE, UiWalletPayload, ApiError } from '@/lib/api';
import { WalletData } from '@/types/wallet.types';
import { getWalletConfig } from '@/lib/wallet-config';
import { mapWalletCategoryToChainType, ChainType } from '@/lib/chains';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

/**
 * Individual wallet stream state
 */
interface WalletStreamState {
  configId: string;
  loading: boolean;
  address: string | null;
  label?: string;
  error?: string | null;
  lastUpdated?: Date;
}

/**
 * Streaming wallets hook return type
 */
export interface UseStreamingWalletsReturn {
  /** Wallet states indexed by config ID */
  wallets: Record<string, WalletStreamState>;
  
  /** Overall loading state (true if any wallet is loading) */
  loading: boolean;
  
  /** Global error (only if complete failure) */
  error: string | null;
  
  /** Load wallets for user (uses streaming if available) */
  loadWallets: (userId: string, forceRefresh?: boolean) => Promise<void>;
  
  /** Get wallet by config ID */
  getWallet: (configId: string) => WalletStreamState | undefined;
  
  /** Get wallet by chain type */
  getWalletByType: (type: ChainType) => WalletStreamState | undefined;
  
  /** Check if streaming is in progress */
  isStreaming: boolean;
  
  /** Number of wallets loaded */
  loadedCount: number;
  
  /** Total wallets expected */
  totalCount: number;
}

/**
 * Map backend wallet keys to wallet config IDs
 */
function mapBackendKeyToConfigId(key: string): string {
  // Direct mappings for known backend keys
  const keyMap: Record<string, string> = {
    // EVM Standard (EOA) - backend uses short names, frontend uses 'Eoa' suffix
    'ethereum': 'ethereumEoa',
    'base': 'baseEoa',
    'arbitrum': 'arbitrumEoa',
    'polygon': 'polygonEoa',
    'avalanche': 'avalancheEoa',
    
    // EVM Smart Accounts (ERC-4337)
    'ethereumErc4337': 'ethereumErc4337',
    'baseErc4337': 'baseErc4337',
    'arbitrumErc4337': 'arbitrumErc4337',
    'polygonErc4337': 'polygonErc4337',
    'avalancheErc4337': 'avalancheErc4337',
    
    // Non-EVM
    'bitcoin': 'bitcoin',
    'solana': 'solana',
    'tron': 'tron',
    
    // Testnets
    'moonbeamTestnet': 'moonbeamTestnet',
    'astarShibuya': 'astarShibuya',
    'paseoPassetHub': 'paseoPassetHub',
  };
  
  return keyMap[key] || key;
}

/**
 * Process backend wallet payload into stream states
 */
function processWalletPayload(
  payload: UiWalletPayload,
  existingStates: Record<string, WalletStreamState> = {}
): Record<string, WalletStreamState> {
  const newStates: Record<string, WalletStreamState> = { ...existingStates };
  
  // Process smart account
  if (payload.smartAccount?.address) {
    const smartAccountChains = payload.smartAccount.chains;
    
    // Map each ERC-4337 chain
    Object.entries(smartAccountChains).forEach(([key, address]) => {
      const configId = mapBackendKeyToConfigId(key);
      const config = getWalletConfig(configId);
      
      if (config) {
        newStates[configId] = {
          configId,
          loading: false,
          address: address,
          label: config.name,
          lastUpdated: new Date(),
        };
      }
    });
  }
  
  // Process auxiliary wallets
  if (payload.auxiliary && payload.auxiliary.length > 0) {
    payload.auxiliary.forEach((entry) => {
      const configId = mapBackendKeyToConfigId(entry.key || entry.chain);
      const config = getWalletConfig(configId);
      
      if (config) {
        newStates[configId] = {
          configId,
          loading: false,
          address: entry.address,
          label: entry.label || config.name,
          lastUpdated: new Date(),
        };
      }
    });
  }
  
  return newStates;
}

/**
 * Hook for streaming wallet data
 * 
 * Progressively loads wallet addresses using SSE streaming.
 * Falls back to batch loading if streaming fails or is not available.
 * 
 * @example
 * ```tsx
 * const { wallets, loading, loadWallets, getWallet } = useStreamingWallets();
 * 
 * useEffect(() => {
 *   if (userId) {
 *     loadWallets(userId);
 *   }
 * }, [userId, loadWallets]);
 * 
 * const ethereum = getWallet('ethereumErc4337');
 * ```
 */
export function useStreamingWallets(): UseStreamingWalletsReturn {
  const [wallets, setWallets] = useState<Record<string, WalletStreamState>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const hasLoadedRef = useRef<Record<string, boolean>>({});
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

  // Move loadWalletsBatch outside to fix scope and make it a useCallback
  const loadWalletsBatch = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/wallet/addresses?userId=${encodeURIComponent(userId)}`);
      
      if (!response.ok) {
        throw new ApiError(response.status, 'Failed to load wallets');
      }
      
      const data: UiWalletPayload = await response.json();
      const processedStates = processWalletPayload(data);
      
      setWallets(processedStates);
      setTotalCount(Object.keys(processedStates).length);
      setLoading(false);
      hasLoadedRef.current[userId] = true;
      isLoadingRef.current[userId] = false;
    } catch (err) {
      const errorMessage = err instanceof ApiError 
        ? err.message
        : 'Failed to load wallets';
      
      console.error('Error loading wallets:', err);
      setError(errorMessage);
      setLoading(false);
      isLoadingRef.current[userId] = false;
    }
  }, []);

  const loadWallets = useCallback(async (userId: string, forceRefresh: boolean = false) => {
    if (!userId) return;
    
    // Prevent duplicate calls for the same userId
    if (isLoadingRef.current[userId] && !forceRefresh) {
      return;
    }
    
    // Don't reload if already loaded and not forcing refresh
    if (hasLoadedRef.current[userId] && !forceRefresh) {
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
    
    setError(null);
    setLoading(true);
    isLoadingRef.current[userId] = true;
    
    // Try SSE streaming first
    const useSSE = typeof EventSource !== 'undefined';
    
    if (useSSE) {
      try {
        const url = `${API_BASE_URL}/wallet/addresses-stream?userId=${encodeURIComponent(userId)}`;
        setIsStreaming(true);
        
        let streamCompleted = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        
        const cleanup = subscribeToSSE<UiWalletPayload>(
          url,
          // On message - update wallets progressively
          (data) => {
            setWallets((prev) => {
              const updated = processWalletPayload(data, prev);
              setTotalCount(Object.keys(updated).length);
              return updated;
            });
          },
          // On error - fall back to batch
          (error) => {
            console.warn('SSE streaming failed, falling back to batch loading:', error);
            if (timeoutId) clearTimeout(timeoutId);
            setIsStreaming(false);
            isLoadingRef.current[userId] = false;
            loadWalletsBatch(userId);
          },
          // On complete
          () => {
            streamCompleted = true;
            if (timeoutId) clearTimeout(timeoutId);
            setIsStreaming(false);
            setLoading(false);
            hasLoadedRef.current[userId] = true;
            isLoadingRef.current[userId] = false;
          }
        );
        
        unsubscribeRef.current = cleanup;
        
        // Timeout after 30 seconds
        timeoutId = setTimeout(() => {
          if (!streamCompleted && cleanup) {
            if (process.env.NODE_ENV === 'development') {
              console.debug('SSE streaming timeout, falling back to batch loading');
            }
            cleanup();
            setIsStreaming(false);
            isLoadingRef.current[userId] = false;
            loadWalletsBatch(userId);
          }
        }, 30000);
        
        return;
      } catch (err) {
        console.warn('Failed to start SSE streaming, falling back to batch:', err);
        setIsStreaming(false);
        isLoadingRef.current[userId] = false;
        await loadWalletsBatch(userId);
        return;
      }
    }
    
    // Fallback to batch loading
    await loadWalletsBatch(userId);
  }, [loadWalletsBatch]);

  const getWallet = useCallback((configId: string): WalletStreamState | undefined => {
    return wallets[configId];
  }, [wallets]);

  const getWalletByType = useCallback((type: ChainType): WalletStreamState | undefined => {
    // Find first wallet matching the chain type
    return Object.values(wallets).find((wallet) => {
      const config = getWalletConfig(wallet.configId);
      return config?.type === type;
    });
  }, [wallets]);

  const loadedCount = Object.keys(wallets).length;
  const isLoading = loading || Object.values(wallets).some((w) => w.loading);

  return {
    wallets,
    loading: isLoading,
    error,
    loadWallets,
    getWallet,
    getWalletByType,
    isStreaming,
    loadedCount,
    totalCount,
  };
}
