'use client';

import { useState, useEffect } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

export function useBrowserFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getFingerprint = async () => {
      try {
        // Check if we already have a wallet ID stored
        const stored = localStorage.getItem('temp_wallet_id');
        if (stored) {
          console.log('📱 Found existing wallet ID:', stored.slice(0, 20) + '...');
          setFingerprint(stored);
          setLoading(false);
          return;
        }

        console.log('🔍 Generating browser fingerprint...');
        
        // Generate new fingerprint using FingerprintJS
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const walletId = `temp-${result.visitorId}`;

        console.log('✅ Fingerprint generated:', walletId.slice(0, 20) + '...');

        // Store it in localStorage for persistence
        localStorage.setItem('temp_wallet_id', walletId);
        setFingerprint(walletId);
      } catch (err) {
        console.error('❌ Error generating fingerprint:', err);
        
        // Fallback: generate random ID if fingerprinting fails
        const fallbackId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log('⚠️ Using fallback ID:', fallbackId);
        
        localStorage.setItem('temp_wallet_id', fallbackId);
        setFingerprint(fallbackId);
      } finally {
        setLoading(false);
      }
    };

    getFingerprint();
  }, []);

  // Function to generate a completely new wallet ID (for "Change Wallet" button)
  const generateNewWallet = () => {
    const newWalletId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('🔄 Generating new wallet ID:', newWalletId);
    
    // Update localStorage
    localStorage.setItem('temp_wallet_id', newWalletId);
    
    // Update state - this will trigger re-render
    setFingerprint(newWalletId);
    
    return newWalletId;
  };

  return { 
    fingerprint,      // The unique wallet ID
    loading,          // True while generating fingerprint
    generateNewWallet // Function to create new wallet ID
  };
}
