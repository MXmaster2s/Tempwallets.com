/**
 * COMMENTED OUT - REDUNDANT CODE
 * XP system is currently disabled (see wallet-info.tsx line 47).
 * Keeping this commented out for reference in case it's needed later.
 * Date: 2025-12-08
 */

/*
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { userApi } from '@/lib/api';

const XP_STORAGE_KEY = 'temp_wallet_xp';
const XP_PER_WALLET = 10; // XP awarded per wallet creation

export interface UseXPReturn {
  xp: number;
  loading: boolean;
  error: string | null;
  awardXP: (amount?: number, reason?: string) => Promise<void>;
  awardXPOptimistic: (amount?: number) => void;
  refreshXP: () => Promise<void>;
}

/**
 * Hook to manage user XP (experience points)
 * 
 * - If user is authenticated: XP is stored in backend and synced
 * - If user is not authenticated: XP is stored in localStorage
 * - Awards XP when user creates a new wallet
 *\/
export function useXP(): UseXPReturn {
  const { isAuthenticated, userId } = useAuth();
  const [xp, setXp] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load XP from backend (if authenticated) or localStorage (if not)
  const loadXP = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isAuthenticated && userId) {
        // Load from backend
        const response = await userApi.getXP();
        setXp(response.xp || 0);
      } else {
        // Load from localStorage
        const storedXP = localStorage.getItem(XP_STORAGE_KEY);
        setXp(storedXP ? parseInt(storedXP, 10) : 0);
      }
    } catch (err) {
      console.error('Failed to load XP:', err);
      // Fallback to localStorage if backend fails
      if (isAuthenticated) {
        try {
          const storedXP = localStorage.getItem(XP_STORAGE_KEY);
          setXp(storedXP ? parseInt(storedXP, 10) : 0);
        } catch {
          setXp(0);
        }
      } else {
        setXp(0);
      }
      // Don't set error for XP loading failures - it's not critical
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, userId]);

  // Optimistically award XP immediately (for instant UI feedback)
  const awardXPOptimistic = useCallback((amount: number = XP_PER_WALLET) => {
    // Immediately update state for instant casino feel
    setXp((prev) => {
      const newXP = prev + amount;
      // Also update localStorage immediately for non-authenticated users
      if (!isAuthenticated) {
        try {
          localStorage.setItem(XP_STORAGE_KEY, newXP.toString());
        } catch (err) {
          console.error('Failed to save XP to localStorage:', err);
        }
      }
      return newXP;
    });
  }, [isAuthenticated]);

  // Award XP to user (syncs with backend)
  const awardXP = useCallback(async (amount: number = XP_PER_WALLET, reason: string = 'wallet_created') => {
    try {
      if (isAuthenticated && userId) {
        // Award via backend
        const response = await userApi.awardXP(amount, reason);
        setXp(response.totalXP);
      } else {
        // Award to localStorage (already done optimistically, but sync here too)
        const currentXP = parseInt(localStorage.getItem(XP_STORAGE_KEY) || '0', 10);
        const newXP = currentXP + amount;
        localStorage.setItem(XP_STORAGE_KEY, newXP.toString());
        setXp(newXP);
      }
    } catch (err) {
      console.error('Failed to award XP:', err);
      // Fallback to localStorage if backend fails
      try {
        const currentXP = parseInt(localStorage.getItem(XP_STORAGE_KEY) || '0', 10);
        const newXP = currentXP + amount;
        localStorage.setItem(XP_STORAGE_KEY, newXP.toString());
        setXp(newXP);
      } catch (storageErr) {
        console.error('Failed to save XP to localStorage:', storageErr);
        // Still update state even if localStorage fails
        setXp((prev) => prev + amount);
      }
    }
  }, [isAuthenticated, userId]);

  // Refresh XP from source
  const refreshXP = useCallback(async () => {
    await loadXP();
  }, [loadXP]);

  // Load XP ONLY on mount - don't reload on every render
  useEffect(() => {
    loadXP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount

  return {
    xp,
    loading,
    error,
    awardXP,
    awardXPOptimistic,
    refreshXP,
  };
}
*/

