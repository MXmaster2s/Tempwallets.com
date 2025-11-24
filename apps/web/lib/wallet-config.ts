import { ComponentType, SVGProps } from 'react';
import Ethereum from '@thirdweb-dev/chain-icons/dist/ethereum';
import Bitcoin from '@thirdweb-dev/chain-icons/dist/bitcoin';
import Solana from '@thirdweb-dev/chain-icons/dist/solana';
import Polkadot from '@thirdweb-dev/chain-icons/dist/polkadot-new';
import Polygon from '@thirdweb-dev/chain-icons/dist/polygon';
import Avalanche from '@thirdweb-dev/chain-icons/dist/avalanche';
import Tron from '@thirdweb-dev/chain-icons/dist/tron';
import Arbitrum from '@thirdweb-dev/chain-icons/dist/arbitrum';
import Base from '../components/icons/BaseIcon';

import {
  WalletConfig,
  WalletConfigFilter,
  ChainType,
  ChainGroup,
} from '@/types/wallet.types';

// Fallback icon for chains without specific icons (using Polkadot as generic Substrate icon)
const SubstrateFallback = Polkadot;

/**
 * Master wallet configuration registry
 * Single source of truth for all 26+ wallet/chain configurations
 */
export const WALLET_CONFIGS: WalletConfig[] = [
  // ========================================
  // EVM SMART ACCOUNTS (ERC-4337) - PRIMARY
  // These are shown as the main wallets
  // ========================================
  {
    id: 'ethereumErc4337',
    name: 'Ethereum',
    symbol: 'ETH',
    description: 'Ethereum Smart Account (ERC-4337)',
    type: 'evm',
    chainId: 1,
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Ethereum,
    priority: 2,
    color: '#627EEA',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-smart-account',
    isSmartAccount: true,
    eoaVariant: 'ethereum',
  },
  {
    id: 'baseErc4337',
    name: 'Base',
    symbol: 'ETH',
    description: 'Base Smart Account (ERC-4337)',
    type: 'evm',
    chainId: 8453,
    isTestnet: false,
    category: 'layer2',
    visible: true,
    icon: Base,
    priority: 5,
    color: '#0052FF',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-smart-account',
    parentChain: 'ethereum',
    isSmartAccount: true,
    eoaVariant: 'base',
  },
  {
    id: 'arbitrumErc4337',
    name: 'Arbitrum',
    symbol: 'ARB',
    description: 'Arbitrum Smart Account (ERC-4337)',
    type: 'evm',
    chainId: 42161,
    isTestnet: false,
    category: 'layer2',
    visible: true,
    icon: Arbitrum,
    priority: 6,
    color: '#28A0F0',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-smart-account',
    parentChain: 'ethereum',
    isSmartAccount: true,
    eoaVariant: 'arbitrum',
  },
  {
    id: 'polygonErc4337',
    name: 'Polygon',
    symbol: 'MATIC',
    description: 'Polygon Smart Account (ERC-4337)',
    type: 'evm',
    chainId: 137,
    isTestnet: false,
    category: 'sidechain',
    visible: true,
    icon: Polygon,
    priority: 7,
    color: '#8247E5',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-smart-account',
    isSmartAccount: true,
    eoaVariant: 'polygon',
  },
  {
    id: 'avalancheErc4337',
    name: 'Avalanche',
    symbol: 'AVAX',
    description: 'Avalanche Smart Account (ERC-4337)',
    type: 'evm',
    chainId: 43114,
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Avalanche,
    priority: 8,
    color: '#E84142',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-smart-account',
    isSmartAccount: true,
    eoaVariant: 'avalanche',
  },

  // ========================================
  // NON-EVM CHAINS
  // ========================================
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    description: 'Bitcoin Mainnet',
    type: 'bitcoin',
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Bitcoin,
    priority: 1,
    color: '#F7931A',
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: false,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'bitcoin',
  },
  {
    id: 'polkadot',
    name: 'Polkadot',
    symbol: 'DOT',
    description: 'Polkadot Relay Chain',
    type: 'substrate',
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Polkadot,
    priority: 4,
    color: '#E6007A',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'substrate-mainnet',
  },
  {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    description: 'Solana Mainnet',
    type: 'solana',
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Solana,
    priority: 3,
    color: '#14F195',
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'solana',
  },
  {
    id: 'tron',
    name: 'Tron',
    symbol: 'TRX',
    description: 'Tron Mainnet',
    type: 'tron',
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Tron,
    priority: 9,
    color: '#FF0013',
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'tron',
  },

  // ========================================
  // SUBSTRATE PARACHAINS (MAINNET)
  // ========================================
  {
    id: 'hydrationSubstrate',
    name: 'Hydration',
    symbol: 'HDX',
    description: 'Hydration Parachain',
    type: 'substrate',
    isTestnet: false,
    category: 'parachain',
    visible: false, // Hidden by default, show in advanced
    icon: SubstrateFallback,
    priority: 50,
    color: '#FF0084',
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: false, // Not currently supported
      transactionHistory: false,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: false,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: true,
    },
    group: 'substrate-mainnet',
    parentChain: 'polkadot',
  },
  {
    id: 'bifrostSubstrate',
    name: 'Bifrost',
    symbol: 'BNC',
    description: 'Bifrost Parachain',
    type: 'substrate',
    isTestnet: false,
    category: 'parachain',
    visible: false,
    icon: SubstrateFallback,
    priority: 51,
    color: '#5A25F0',
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: false,
      transactionHistory: false,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: false,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: true,
    },
    group: 'substrate-mainnet',
    parentChain: 'polkadot',
  },
  {
    id: 'uniqueSubstrate',
    name: 'Unique Network',
    symbol: 'UNQ',
    description: 'Unique Network Parachain',
    type: 'substrate',
    isTestnet: false,
    category: 'parachain',
    visible: false,
    icon: SubstrateFallback,
    priority: 52,
    color: '#FF6B00',
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: false,
      transactionHistory: false,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: false,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: true,
    },
    group: 'substrate-mainnet',
    parentChain: 'polkadot',
  },

  // ========================================
  // EVM STANDARD (EOA) - NOW VISIBLE
  // These share the same address as smart accounts
  // ========================================
  {
    id: 'ethereumEoa',
    name: 'Ethereum',
    symbol: 'ETH',
    description: 'Ethereum EOA Wallet',
    type: 'evm',
    chainId: 1,
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Ethereum,
    priority: 100,
    color: '#627EEA',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-standard',
    isSmartAccount: false,
    smartAccountVariant: 'ethereumErc4337',
  },
  {
    id: 'baseEoa',
    name: 'Base',
    symbol: 'ETH',
    description: 'Base EOA Wallet',
    type: 'evm',
    chainId: 8453,
    isTestnet: false,
    category: 'layer2',
    visible: true,
    icon: Base,
    priority: 101,
    color: '#0052FF',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-standard',
    parentChain: 'ethereum',
    isSmartAccount: false,
    smartAccountVariant: 'baseErc4337',
  },
  {
    id: 'arbitrumEoa',
    name: 'Arbitrum',
    symbol: 'ARB',
    description: 'Arbitrum EOA Wallet',
    type: 'evm',
    chainId: 42161,
    isTestnet: false,
    category: 'layer2',
    visible: true,
    icon: Arbitrum,
    priority: 102,
    color: '#28A0F0',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-standard',
    parentChain: 'ethereum',
    isSmartAccount: false,
    smartAccountVariant: 'arbitrumErc4337',
  },
  {
    id: 'polygonEoa',
    name: 'Polygon',
    symbol: 'MATIC',
    description: 'Polygon EOA Wallet',
    type: 'evm',
    chainId: 137,
    isTestnet: false,
    category: 'sidechain',
    visible: true,
    icon: Polygon,
    priority: 103,
    color: '#8247E5',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-standard',
    isSmartAccount: false,
    smartAccountVariant: 'polygonErc4337',
  },
  {
    id: 'avalancheEoa',
    name: 'Avalanche',
    symbol: 'AVAX',
    description: 'Avalanche EOA Wallet',
    type: 'evm',
    chainId: 43114,
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Avalanche,
    priority: 104,
    color: '#E84142',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: true,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: true,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'evm-standard',
    isSmartAccount: false,
    smartAccountVariant: 'avalancheErc4337',
  },

  // ========================================
  // TESTNETS
  // ========================================
  {
    id: 'moonbeamTestnet',
    name: 'Moonbeam Testnet',
    symbol: 'DEV',
    description: 'Moonbase Alpha Testnet',
    type: 'evm',
    chainId: 1287,
    isTestnet: true,
    category: 'parachain',
    visible: false,
    icon: SubstrateFallback,
    priority: 200,
    color: '#53CBC9',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: false, // RPC timeout issues
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: false,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: true,
    },
    group: 'evm-testnet',
    parentChain: 'moonbeam',
  },
  {
    id: 'astarShibuya',
    name: 'Astar Shibuya',
    symbol: 'SBY',
    description: 'Astar Shibuya Testnet',
    type: 'evm',
    chainId: 81,
    isTestnet: true,
    category: 'parachain',
    visible: false,
    icon: SubstrateFallback,
    priority: 201,
    color: '#0AE2FF',
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: false,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: false,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: true,
    },
    group: 'evm-testnet',
    parentChain: 'astar',
  },
  {
    id: 'paseoPassetHub',
    name: 'Paseo Asset Hub',
    symbol: 'PAS',
    description: 'Paseo Asset Hub Testnet (EVM)',
    type: 'evm',
    isTestnet: true,
    category: 'parachain',
    visible: false,
    icon: SubstrateFallback,
    priority: 202,
    capabilities: {
      walletConnect: true,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: false, // RPC timeout issues
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: false,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: true,
    },
    group: 'evm-testnet',
    parentChain: 'paseo',
  },
  {
    id: 'paseo',
    name: 'Paseo',
    symbol: 'PAS',
    description: 'Paseo Testnet (Substrate)',
    type: 'substrate',
    isTestnet: true,
    category: 'layer1',
    visible: false,
    icon: SubstrateFallback,
    priority: 203,
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: false,
      transactionHistory: false,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: false,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: true,
    },
    group: 'substrate-testnet',
  },
  {
    id: 'paseoAssethub',
    name: 'Paseo Asset Hub',
    symbol: 'PAS',
    description: 'Paseo Asset Hub (Substrate)',
    type: 'substrate',
    isTestnet: true,
    category: 'parachain',
    visible: false,
    icon: SubstrateFallback,
    priority: 204,
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: false,
      transactionHistory: false,
      nativeToken: true,
      tokenTransfers: true,
    },
    features: {
      showInSelector: false,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: true,
    },
    group: 'substrate-testnet',
    parentChain: 'paseo',
  },
];

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get wallet configuration by ID
 */
export const getWalletConfig = (id: string): WalletConfig | undefined => {
  return WALLET_CONFIGS.find((config) => config.id === id);
};

/**
 * Get all wallet configurations matching filter criteria
 */
export const getWalletConfigs = (filter?: WalletConfigFilter): WalletConfig[] => {
  let configs = [...WALLET_CONFIGS];

  if (!filter) return configs;

  // Filter by type
  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    configs = configs.filter((c) => types.includes(c.type));
  }

  // Filter by testnet status
  if (filter.isTestnet !== undefined) {
    configs = configs.filter((c) => c.isTestnet === filter.isTestnet);
  }

  // Filter by visibility
  if (filter.visible !== undefined) {
    configs = configs.filter((c) => c.visible === filter.visible);
  }

  // Filter by group
  if (filter.group) {
    const groups = Array.isArray(filter.group) ? filter.group : [filter.group];
    configs = configs.filter((c) => groups.includes(c.group));
  }

  // Filter by capabilities
  if (filter.capabilities) {
    configs = configs.filter((c) => {
      return Object.entries(filter.capabilities!).every(
        ([key, value]) => c.capabilities[key as keyof typeof c.capabilities] === value
      );
    });
  }

  // Filter by features
  if (filter.features) {
    configs = configs.filter((c) => {
      return Object.entries(filter.features!).every(
        ([key, value]) => c.features[key as keyof typeof c.features] === value
      );
    });
  }

  // Filter by parent chain
  if (filter.parentChain) {
    configs = configs.filter((c) => c.parentChain === filter.parentChain);
  }

  // Include testnets filter
  if (filter.includeTestnets === false) {
    configs = configs.filter((c) => !c.isTestnet);
  }

  // Include advanced filter
  if (filter.includeAdvanced === false) {
    configs = configs.filter((c) => !c.features.advancedOnly);
  }

  // Include smart accounts filter
  if (filter.includeSmartAccounts === false) {
    configs = configs.filter((c) => !c.isSmartAccount);
  }

  // Sort by priority
  configs.sort((a, b) => a.priority - b.priority);

  return configs;
};

/**
 * Get visible wallet configurations for the selector
 */
export const getVisibleWalletConfigs = (environment: 'development' | 'production' = 'production'): WalletConfig[] => {
  const isDev = environment === 'development';
  
  // Filter configs manually for more control
  return WALLET_CONFIGS.filter((config) => {
    // Must be enabled in selector
    if (!config.features.showInSelector) {
      return false;
    }
    
    // Environment check
    if (isDev) {
      // In dev, show everything that's enabled in dev
      if (!config.features.enabledInDev) {
        return false;
      }
    } else {
      // In prod, only show prod-enabled configs
      if (!config.features.enabledInProd) {
        return false;
      }
      // Hide testnets in production
      if (config.isTestnet) {
        return false;
      }
    }
    
    // Hide advanced-only configs
    if (config.features.advancedOnly) {
      return false;
    }
    
    return true;
  }).sort((a, b) => a.priority - b.priority);
};

/**
 * Get mainnet wallet configurations only
 */
export const getMainnetWalletConfigs = (): WalletConfig[] => {
  return getWalletConfigs({
    isTestnet: false,
  });
};

/**
 * Get wallet configurations by type
 */
export const getWalletConfigsByType = (type: ChainType): WalletConfig[] => {
  return getWalletConfigs({ type });
};

/**
 * Get wallet configurations by group
 */
export const getWalletConfigsByGroup = (group: ChainGroup): WalletConfig[] => {
  return getWalletConfigs({ group });
};

/**
 * Get EVM smart account configurations
 */
export const getSmartAccountConfigs = (): WalletConfig[] => {
  return getWalletConfigs({
    group: 'evm-smart-account',
    isTestnet: false,
  });
};

/**
 * Check if environment is development
 */
export const isDevelopmentEnvironment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};
