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
import AptosIcon from '../components/icons/AptosIcon';

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
const RAW_WALLET_CONFIGS: WalletConfig[] = [
  // ========================================
  // EVM SMART ACCOUNTS (ERC-4337) - PRIMARY
  // These are shown as the main wallets
  // ========================================
  {
    id: 'ethereumErc4337',
    name: 'Ethereum',
    symbol: 'ETH',
    description: 'Ethereum Smart Account',
    type: 'evm',
    chainId: 1,
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Ethereum,
    priority: 1,
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
      lightningNodes: true,
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
    symbol: 'BASE',
    description: 'Base Smart Account',
    type: 'evm',
    chainId: 8453,
    isTestnet: false,
    category: 'layer2',
    visible: true,
    icon: Base,
    priority: 2,
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
      lightningNodes: true,
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
    description: 'Arbitrum Smart Account',
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
      lightningNodes: true,
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
    description: 'Polygon Smart Account',
    type: 'evm',
    chainId: 137,
    isTestnet: false,
    category: 'sidechain',
    visible: true,
    icon: Polygon,
    priority: 4,
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
      lightningNodes: true,
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
    description: 'Avalanche Smart Account',
    type: 'evm',
    chainId: 43114,
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: Avalanche,
    priority: 5,
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
      lightningNodes: false,
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
    priority: 21,
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
      lightningNodes: false,
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
    priority: 3,
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
      lightningNodes: false,
    },
    features: {
      showInSelector: true,
      showInWalletList: false,
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
    priority: 22,
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
      lightningNodes: false,
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
    priority: 23,
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
      lightningNodes: false,
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
  {
    id: 'aptos',
    name: 'Aptos',
    symbol: 'APT',
    description: 'Aptos Mainnet',
    type: 'aptos',
    isTestnet: false,
    category: 'layer1',
    visible: true,
    icon: AptosIcon,
    priority: 24,
    color: '#00D4FF',
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: false, // TODO: Add transaction history support
      nativeToken: true,
      tokenTransfers: false, // TODO: Add token transfer support
      lightningNodes: false,
    },
    features: {
      showInSelector: true,
      showInWalletList: false,
      enabledInProd: true, // Enabled for MVP
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'aptos',
  },
  {
    id: 'aptosTestnet',
    name: 'Aptos Testnet',
    symbol: 'APT',
    description: 'Aptos Testnet',
    type: 'aptos',
    isTestnet: true,
    category: 'layer1',
    visible: true,
    icon: AptosIcon,
    priority: 205,
    color: '#00D4FF',
    capabilities: {
      walletConnect: false,
      send: true,
      receive: true,
      copy: true,
      balanceFetch: true,
      transactionHistory: false,
      nativeToken: true,
      tokenTransfers: false,
      lightningNodes: false,
    },
    features: {
      showInSelector: true,
      showInWalletList: true,
      enabledInProd: false,
      enabledInDev: true,
      advancedOnly: false,
    },
    group: 'aptos',
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
      lightningNodes: false,
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
      lightningNodes: false,
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
      lightningNodes: false,
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
    priority: 11,
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
      lightningNodes: false,
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
    symbol: 'BASE',
    description: 'Base EOA Wallet',
    type: 'evm',
    chainId: 8453,
    isTestnet: false,
    category: 'layer2',
    visible: true,
    icon: Base,
    priority: 12,
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
      lightningNodes: false,
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
    priority: 13,
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
      lightningNodes: false,
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
    priority: 14,
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
      lightningNodes: false,
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
    priority: 15,
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
      lightningNodes: false,
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
      lightningNodes: false,
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
      lightningNodes: false,
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
      lightningNodes: false,
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
      lightningNodes: false,
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
      lightningNodes: false,
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
// EIP-7702 FEATURE FLAGS (frontend mirrors backend env)
// ========================================
const ENABLE_EIP7702 = process.env.NEXT_PUBLIC_ENABLE_EIP7702 === 'true';

const parseChainIdList = (value?: string): number[] =>
  (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

// Prefer chain IDs; fallback to chain names mapped to IDs if provided
const EIP7702_CHAIN_IDS = new Set<number>(
  parseChainIdList(process.env.NEXT_PUBLIC_EIP7702_CHAIN_IDS || process.env.NEXT_PUBLIC_EIP7702_ENABLED_CHAINS),
);

const chainNameToId: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  bnb: 56,
  avalanche: 43114,
  sepolia: 11155111,
};

if (EIP7702_CHAIN_IDS.size === 0 && process.env.NEXT_PUBLIC_EIP7702_CHAINS) {
  process.env.NEXT_PUBLIC_EIP7702_CHAINS.split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .forEach((name) => {
      const id = chainNameToId[name];
      if (id) EIP7702_CHAIN_IDS.add(id);
    });
}

const isEip7702EnabledForConfig = (config: WalletConfig): boolean => {
  if (!ENABLE_EIP7702) return false;
  if (!config.chainId) return false;
  return EIP7702_CHAIN_IDS.has(config.chainId);
};

// Apply EIP-7702 naming and hide EOAs when smart-account variant is enabled
export const WALLET_CONFIGS: WalletConfig[] = RAW_WALLET_CONFIGS.map((config) => {
  const smartVariant = config.smartAccountVariant
    ? RAW_WALLET_CONFIGS.find((c) => c.id === config.smartAccountVariant)
    : undefined;

  const smartVariantEnabled = smartVariant ? isEip7702EnabledForConfig(smartVariant) : false;
  const hideEoa = !config.isSmartAccount && smartVariantEnabled;

  const description =
    config.isSmartAccount && config.description
      ? config.description.replace('ERC-4337', 'EIP-7702')
      : config.description;

  return {
    ...config,
    description,
    features: {
      ...config.features,
      // Keep EOAs visible in the list even if a smart-account variant is enabled;
      // still hide them from selector to reduce clutter.
      showInSelector: hideEoa ? false : config.features.showInSelector,
      showInWalletList: config.features.showInWalletList,
    },
  } as WalletConfig;
});

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

  // Sort by enabled status first, then priority, then name
  // Note: This assumes we're in production context. For dev, use getVisibleWalletConfigs
  configs.sort((a, b) => {
    // First, sort by enabled status (enabled chains first)
    // Default to production environment for this generic function
    const aEnabled = a.features.enabledInProd;
    const bEnabled = b.features.enabledInProd;

    if (aEnabled !== bEnabled) {
      return aEnabled ? -1 : 1; // enabled (true) comes before disabled (false)
    }

    // Then by priority
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // Finally by name
    return a.name.localeCompare(b.name);
  });

  return configs;
};

/**
 * Get visible wallet configurations for the selector
 * MVP: Only show Ethereum, Base, Polkadot, and Aptos in the horizontal selector
 * Full list (all gasless EVMs + Polkadot + Aptos) is available in the modal
 */
export const getVisibleWalletConfigs = (environment: 'development' | 'production' = 'production'): WalletConfig[] => {
  const isDev = environment === 'development';

  const mvpChainIds = ['ethereumErc4337', 'baseErc4337', 'arbitrumErc4337'];

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

    // MVP: Only show the 4 specific chains in horizontal selector
    if (!mvpChainIds.includes(config.id)) {
      return false;
    }

    return true;
  }).sort((a, b) => {
    // Sort by the order in mvpChainIds array
    const aIndex = mvpChainIds.indexOf(a.id);
    const bIndex = mvpChainIds.indexOf(b.id);

    // If both are in the list, sort by their position
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // Fallback: sort by enabled status, then priority, then name
    const aEnabled = isDev ? a.features.enabledInDev : a.features.enabledInProd;
    const bEnabled = isDev ? b.features.enabledInDev : b.features.enabledInProd;

    if (aEnabled !== bEnabled) {
      return aEnabled ? -1 : 1;
    }

    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    return a.name.localeCompare(b.name);
  });
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
