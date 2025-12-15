'use client';

import { ReactNode } from 'react';
import { WalletDataProvider } from '@/contexts/wallet-data-context';
import { useBrowserFingerprint } from '@/hooks/useBrowserFingerprint';
import { MixpanelProvider } from '@/components/analytics/mixpanel-provider';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root providers component that wraps the app with all necessary context providers
 * Ensures providers are mounted only once for the entire application
 */
export function Providers({ children }: ProvidersProps) {
  const { fingerprint } = useBrowserFingerprint();

  return (
    <MixpanelProvider>
      <WalletDataProvider fingerprint={fingerprint}>
        {children}
      </WalletDataProvider>
    </MixpanelProvider>
  );
}

