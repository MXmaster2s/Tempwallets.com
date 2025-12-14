/**
 * Balance V2 Hook - Unified Interface
 * 
 * Drop-in replacement for existing balance hooks with backward compatibility.
 * Provides a clean interface for accessing balance data from streaming or batch sources.
 * 
 * Features:
 * - Backward compatible with existing balance interfaces
 * - Aggregates balance data from streaming states
 * - Provides convenient access methods
 * - Optional streaming indicators for UI
 */

import { useMemo } from 'react';
import { useStreamingBalances, type UseStreamingBalancesReturn } from './useStreamingBalances';
import type { BalanceData, NativeBalance, TokenBalance } from '@/types/wallet.types';
import { formatBalance, formatUSD, formatTokenAmount } from '@/lib/balance-utils';

/**
 * Legacy balance interface for backward compatibility
 */
export interface LegacyBalance {
  /** Wallet config ID */
  walletId: string;
  
  /** Native token balance (formatted) */
  balance: string;
  
  /** Native token symbol */
  symbol: string;
  
  /** USD value (formatted) */
  usdValue?: string;
  
  /** Loading state */
  loading: boolean;
  
  /** Error message */
  error?: string | null;
  
  /** Last updated */
  lastUpdated?: Date;
}

/**
 * Return type for useBalanceV2 hook
 */
export interface UseBalanceV2Return {
  /** All balances in legacy format */
  balances: LegacyBalance[];
  
  /** Balances indexed by wallet config ID */
  balancesByWallet: Record<string, LegacyBalance>;
  
  /** Global loading state */
  loading: boolean;
  
  /** Global error state */
  error: string | null;
  
  /** Load balances */
  loadBalances: (userId: string, forceRefresh?: boolean) => Promise<void>;
  
  /** Refresh specific balance */
  refreshBalance: (userId: string, configId: string) => Promise<void>;
  
  /** Get balance for specific wallet */
  getBalance: (configId: string) => LegacyBalance | undefined;
  
  /** Get total portfolio value in USD */
  getTotalUSD: () => number;
  
  /** Optional: streaming indicators */
  isStreaming?: boolean;
  loadedCount?: number;
  totalCount?: number;
}

/**
 * Convert BalanceData to LegacyBalance format
 */
function convertToLegacyBalance(
  configId: string,
  balanceData: BalanceData | null,
  loading: boolean,
  error?: string | null,
  lastUpdated?: Date,
): LegacyBalance {
  if (!balanceData || !balanceData.native) {
    return {
      walletId: configId,
      balance: '0',
      symbol: '',
      usdValue: undefined,
      loading,
      error,
      lastUpdated,
    };
  }

  const native = balanceData.native;
  const formattedBalance = formatBalance(native.balance, native.decimals);
  const usdValue = native.usdValue ? formatUSD(native.usdValue) : undefined;

  return {
    walletId: configId,
    balance: formattedBalance,
    symbol: native.symbol,
    usdValue,
    loading,
    error: error || balanceData.error,
    lastUpdated,
  };
}

/**
 * Hook for accessing balance data with backward compatibility
 */
export function useBalanceV2(): UseBalanceV2Return {
  // Use the streaming balances hook
  const streamingBalances = useStreamingBalances();

  /**
   * Convert streaming balances to legacy format
   */
  const balances = useMemo(() => {
    return Object.values(streamingBalances.balances).map((state) =>
      convertToLegacyBalance(
        state.configId,
        state.balanceData,
        state.loading,
        state.error,
        state.lastUpdated,
      ),
    );
  }, [streamingBalances.balances]);

  /**
   * Index balances by wallet ID
   */
  const balancesByWallet = useMemo(() => {
    const indexed: Record<string, LegacyBalance> = {};
    balances.forEach((balance) => {
      indexed[balance.walletId] = balance;
    });
    return indexed;
  }, [balances]);

  /**
   * Get balance for specific wallet
   */
  const getBalance = (configId: string): LegacyBalance | undefined => {
    return balancesByWallet[configId];
  };

  /**
   * Calculate total portfolio value in USD
   */
  const getTotalUSD = (): number => {
    let total = 0;
    
    Object.values(streamingBalances.balances).forEach((state) => {
      if (state.balanceData?.totalUsdValue) {
        total += state.balanceData.totalUsdValue;
      } else if (state.balanceData?.native?.usdValue) {
        total += state.balanceData.native.usdValue;
      }
    });
    
    return total;
  };

  return {
    balances,
    balancesByWallet,
    loading: streamingBalances.loading,
    error: streamingBalances.error,
    loadBalances: streamingBalances.loadBalances,
    refreshBalance: streamingBalances.refreshBalance,
    getBalance,
    getTotalUSD,
    // Optional streaming indicators
    isStreaming: streamingBalances.isStreaming,
    loadedCount: streamingBalances.loadedCount,
    totalCount: streamingBalances.totalCount,
  };
}

/**
 * Extended return type with raw balance data access
 */
export interface UseBalanceV2ExtendedReturn extends UseBalanceV2Return {
  /** Get raw balance data (BalanceData format) */
  getRawBalance: (configId: string) => BalanceData | null;
  
  /** Get all token balances for a wallet */
  getTokenBalances: (configId: string) => TokenBalance[];
  
  /** Get native balance for a wallet */
  getNativeBalance: (configId: string) => NativeBalance | null;
  
  /** Get balances by chain type */
  getBalancesByType: (chainType: string) => LegacyBalance[];
}

/**
 * Extended hook with raw data access
 */
export function useBalanceV2Extended(): UseBalanceV2ExtendedReturn {
  const base = useBalanceV2();
  const streamingBalances = useStreamingBalances();

  /**
   * Get raw balance data
   */
  const getRawBalance = (configId: string): BalanceData | null => {
    const state = streamingBalances.balances[configId];
    return state?.balanceData || null;
  };

  /**
   * Get token balances for a wallet
   */
  const getTokenBalances = (configId: string): TokenBalance[] => {
    const balanceData = getRawBalance(configId);
    return balanceData?.tokens || [];
  };

  /**
   * Get native balance for a wallet
   */
  const getNativeBalance = (configId: string): NativeBalance | null => {
    const balanceData = getRawBalance(configId);
    return balanceData?.native || null;
  };

  /**
   * Get balances by chain type
   */
  const getBalancesByType = (chainType: string): LegacyBalance[] => {
    const streamingBalancesByType = streamingBalances.getBalancesByType(chainType);
    return streamingBalancesByType.map((state) =>
      convertToLegacyBalance(
        state.configId,
        state.balanceData,
        state.loading,
        state.error,
        state.lastUpdated,
      ),
    );
  };

  return {
    ...base,
    getRawBalance,
    getTokenBalances,
    getNativeBalance,
    getBalancesByType,
  };
}
