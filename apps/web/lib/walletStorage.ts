import { WalletAddresses } from './api';

const STORAGE_KEYS = {
  WALLET_ADDRESSES: 'tempwallets_addresses',
  WALLET_CACHE_TIMESTAMP: 'tempwallets_cache_timestamp',
  USER_ID: 'tempwallets_user_id',
} as const;

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export interface CachedWalletAddresses {
  userId: string;
  addresses: WalletAddresses;
  timestamp: number;
}

export const walletStorage = {
  /**
   * Store wallet addresses in local storage
   */
  setAddresses(userId: string, addresses: WalletAddresses): void {
    if (typeof window === 'undefined') return;
    
    const cacheData: CachedWalletAddresses = {
      userId,
      addresses,
      timestamp: Date.now(),
    };
    
    try {
      localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESSES, JSON.stringify(cacheData));
      localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    } catch (error) {
      console.warn('Failed to store wallet addresses in localStorage:', error);
    }
  },

  /**
   * Get cached wallet addresses from local storage
   */
  getAddresses(userId: string): WalletAddresses | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESSES);
      if (!cached) return null;
      
      const cacheData: CachedWalletAddresses = JSON.parse(cached);
      
      // Check if cache is for the same user and not expired
      if (cacheData.userId !== userId) return null;
      if (Date.now() - cacheData.timestamp > CACHE_DURATION) return null;
      
      return cacheData.addresses;
    } catch (error) {
      console.warn('Failed to retrieve wallet addresses from localStorage:', error);
      return null;
    }
  },

  /**
   * Clear cached wallet addresses
   */
  clearAddresses(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESSES);
      localStorage.removeItem(STORAGE_KEYS.WALLET_CACHE_TIMESTAMP);
    } catch (error) {
      console.warn('Failed to clear wallet addresses from localStorage:', error);
    }
  },

  /**
   * Check if addresses are cached and valid
   */
  hasValidCache(userId: string): boolean {
    return this.getAddresses(userId) !== null;
  },

  /**
   * Get cache age in hours
   */
  getCacheAge(): number {
    if (typeof window === 'undefined') return 0;
    
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESSES);
      if (!cached) return 0;
      
      const cacheData: CachedWalletAddresses = JSON.parse(cached);
      return (Date.now() - cacheData.timestamp) / (1000 * 60 * 60); // hours
    } catch (error) {
      return 0;
    }
  },
};
