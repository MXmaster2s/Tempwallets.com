'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useLightningNodes as useLightningNodesImpl } from './useLightningNodes';

type LightningNodesContextValue = ReturnType<typeof useLightningNodesImpl>;

const LightningNodesContext = createContext<LightningNodesContextValue | null>(null);

export function LightningNodesProvider({ children }: { children: React.ReactNode }) {
  const value = useLightningNodesImpl();
  // Stable identity to avoid needless rerenders
  // Include authentication state in dependencies to ensure UI updates
  const memoValue = useMemo(() => value, [
    value.authenticated,
    value.authenticating,
    value.walletAddress,
    value.unifiedBalance,
    value.balanceLoading,
    value.nodes,
    value.allSessions,
    value.activeSessions,
    value.invitations,
    value.loading,
    value.error,
    value.lastFetched,
  ]);

  return (
    <LightningNodesContext.Provider value={memoValue}>
      {children}
    </LightningNodesContext.Provider>
  );
}

export function useLightningNodes() {
  const ctx = useContext(LightningNodesContext);
  if (!ctx) {
    throw new Error('useLightningNodes must be used within a LightningNodesProvider');
  }
  return ctx;
}
