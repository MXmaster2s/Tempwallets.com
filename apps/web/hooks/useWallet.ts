import { useState, useEffect, useCallback } from 'react';
import { walletApi, WalletAddresses, WalletBalance, ApiError } from '@/lib/api';
import { walletStorage } from '@/lib/walletStorage';

export interface WalletData {
  name: string;
  address: string;
  chain: string;
}

export interface UseWalletReturn {
  wallets: WalletData[];
  loading: boolean;
  error: string | null;
  loadWallets: (userId: string) => Promise<void>;
  changeWallets: (userId: string) => Promise<void>;
}

const CHAIN_NAMES: Record<string, string> = {
  ethereum: 'Ethereum',
  tron: 'Tron',
  bitcoin: 'Bitcoin',
  solana: 'Solana',
  erc4337: 'ERC-4337',
};

// ERC-4337 chains that share the same address
const ERC4337_CHAINS = ['ethereumErc4337', 'baseErc4337', 'arbitrumErc4337', 'polygonErc4337'];

export function useWallet(): UseWalletReturn {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processWallets = useCallback((addresses: WalletAddresses) => {
    const walletData: WalletData[] = [];
    const erc4337Addresses: string[] = [];
    
    // Process ERC-4337 addresses first to check for duplicates
    ERC4337_CHAINS.forEach(chain => {
      const address = addresses[chain as keyof WalletAddresses];
      if (address && !erc4337Addresses.includes(address)) {
        erc4337Addresses.push(address);
      }
    });
    
    // Add ERC-4337 wallet if we have any addresses
    if (erc4337Addresses.length > 0) {
      const firstAddress = erc4337Addresses[0];
      if (firstAddress) {
        walletData.push({
          name: CHAIN_NAMES.erc4337 || 'ERC-4337',
          address: firstAddress,
          chain: 'erc4337',
        });
      }
    }
    
    // Process other chains
    Object.entries(addresses).forEach(([chain, address]) => {
      if (address && !ERC4337_CHAINS.includes(chain)) {
        walletData.push({
          name: CHAIN_NAMES[chain] || chain,
          address: address,
          chain,
        });
      }
    });

    setWallets(walletData);
  }, []);

  const loadWallets = useCallback(async (userId: string) => {
    if (!userId) {
      console.warn('⚠️ loadWallets called without userId');
      return;
    }

    setLoading(true);
    setError(null);
    console.log('🔍 Loading wallet for user:', userId);
    
    try {
      // Try to get addresses from API
      const addresses = await walletApi.getAddresses(userId);
      
      // Check if user has any wallets
      const hasWallets = Object.values(addresses).some(address => address && address.length > 0);
      
      if (!hasWallets) {
        console.log('🆕 No wallet found. Creating new wallet...');
        
        // Auto-create wallet if none exists
        await walletApi.createOrImportSeed({
          userId,
          mode: 'random',
        });
        
        // Wait a moment for backend to process
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch addresses again after creation
        const newAddresses = await walletApi.getAddresses(userId);
        console.log('✅ New wallet created successfully');
        
        // Cache the new addresses
        walletStorage.setAddresses(userId, newAddresses);
        processWallets(newAddresses);
      } else {
        console.log('✅ Existing wallet loaded');
        
        // Cache the addresses
        walletStorage.setAddresses(userId, addresses);
        processWallets(addresses);
      }
    } catch (err) {
      const errorMessage = err instanceof ApiError 
        ? err.message
        : 'Failed to load wallet';
      setError(errorMessage);
      console.error('❌ Error loading wallet:', err);
    } finally {
      setLoading(false);
    }
  }, [processWallets]);

  const changeWallets = useCallback(async (userId: string) => {
    // Note: This function is no longer needed since we handle wallet changes
    // by generating a new fingerprint ID. Keeping it for backwards compatibility.
    console.warn('⚠️ changeWallets called but wallet changes are handled via fingerprint');
  }, []);

  return {
    wallets,
    loading,
    error,
    loadWallets,
    changeWallets,
  };
}