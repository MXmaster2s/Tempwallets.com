import { ComponentType, SVGProps } from 'react';
import Ethereum from '@thirdweb-dev/chain-icons/dist/ethereum';
import Bitcoin from '@thirdweb-dev/chain-icons/dist/bitcoin';
import Solana from '@thirdweb-dev/chain-icons/dist/solana';
import Polkadot from '@thirdweb-dev/chain-icons/dist/polkadot-new';
import Polygon from '@thirdweb-dev/chain-icons/dist/polygon';
import Avalanche from '@thirdweb-dev/chain-icons/dist/avalanche';
import Tron from '@thirdweb-dev/chain-icons/dist/tron';
import Arbitrum from '@thirdweb-dev/chain-icons/dist/arbitrum';
import Optimism from '@thirdweb-dev/chain-icons/dist/optimism';
// Base uses Ethereum icon as fallback since Base icon is not available in the package
const Base = Ethereum;

/**
 * Chain types that determine wallet compatibility and functionality
 */
export type ChainType = 'evm' | 'bitcoin' | 'substrate' | 'solana' | 'tron' | 'aptos';

/**
 * Chain category for organizing chains
 */
export type ChainCategory = 'layer1' | 'layer2' | 'sidechain' | 'parachain';

/**
 * Chain configuration interface
 */
export interface Chain {
  /** Unique identifier for the chain */
  id: string;
  /** Display name */
  name: string;
  /** Short symbol/ticker */
  symbol: string;
  /** React component for the chain icon */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Chain type determines wallet compatibility */
  type: ChainType;
  /** Whether this chain supports WalletConnect */
  hasWalletConnect: boolean;
  /** Whether this is a testnet */
  isTestnet: boolean;
  /** Chain category */
  category: ChainCategory;
  /** Chain ID for EVM chains (optional) */
  chainId?: number;
  /** Whether this chain is featured (shown first) */
  featured?: boolean;
}

/**
 * All supported chains configuration
 */
export const chains: Chain[] = [
  // Featured chains (shown first)
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    icon: Ethereum,
    type: 'evm',
    hasWalletConnect: true,
    isTestnet: false,
    category: 'layer1',
    chainId: 1,
    featured: true,
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    icon: Bitcoin,
    type: 'bitcoin',
    hasWalletConnect: false,
    isTestnet: false,
    category: 'layer1',
    featured: true,
  },
  {
    id: 'polkadot',
    name: 'Polkadot',
    symbol: 'DOT',
    icon: Polkadot,
    type: 'substrate',
    hasWalletConnect: true, // Polkadot has WalletConnect support
    isTestnet: false,
    category: 'layer1',
    featured: true,
  },
  {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    icon: Solana,
    type: 'solana',
    hasWalletConnect: false,
    isTestnet: false,
    category: 'layer1',
    featured: true,
  },
  {
    id: 'tron',
    name: 'Tron',
    symbol: 'TRX',
    icon: Tron,
    type: 'solana', // Using 'solana' as generic non-EVM type for now
    hasWalletConnect: false,
    isTestnet: false,
    category: 'layer1',
    featured: true,
  },

  // Other EVM chains
  {
    id: 'polygon',
    name: 'Polygon',
    symbol: 'MATIC',
    icon: Polygon,
    type: 'evm',
    hasWalletConnect: true,
    isTestnet: false,
    category: 'sidechain',
    chainId: 137,
  },
  {
    id: 'avalanche',
    name: 'Avalanche',
    symbol: 'AVAX',
    icon: Avalanche,
    type: 'evm',
    hasWalletConnect: true,
    isTestnet: false,
    category: 'layer1',
    chainId: 43114,
  },
  {
    id: 'base',
    name: 'Base',
    symbol: 'ETH',
    icon: Base,
    type: 'evm',
    hasWalletConnect: true,
    isTestnet: false,
    category: 'layer2',
    chainId: 8453,
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum',
    symbol: 'ETH',
    icon: Arbitrum,
    type: 'evm',
    hasWalletConnect: true,
    isTestnet: false,
    category: 'layer2',
    chainId: 42161,
  },
  {
    id: 'optimism',
    name: 'Optimism',
    symbol: 'ETH',
    icon: Optimism,
    type: 'evm',
    hasWalletConnect: true,
    isTestnet: false,
    category: 'layer2',
    chainId: 10,
  },

  // EIP-7702 Gasless chains (Mainnet)
  {
    id: 'ethereumGasless',
    name: 'Ethereum (Gasless)',
    symbol: 'ETH',
    icon: Ethereum,
    type: 'evm',
    hasWalletConnect: false, // Gasless wallets are custodial-like
    isTestnet: false,
    category: 'layer1',
    chainId: 1,
    featured: true,
  },
  {
    id: 'baseGasless',
    name: 'Base (Gasless)',
    symbol: 'ETH',
    icon: Base,
    type: 'evm',
    hasWalletConnect: false,
    isTestnet: false,
    category: 'layer2',
    chainId: 8453,
  },
  {
    id: 'arbitrumGasless',
    name: 'Arbitrum (Gasless)',
    symbol: 'ETH',
    icon: Arbitrum,
    type: 'evm',
    hasWalletConnect: false,
    isTestnet: false,
    category: 'layer2',
    chainId: 42161,
  },
  {
    id: 'optimismGasless',
    name: 'Optimism (Gasless)',
    symbol: 'ETH',
    icon: Optimism,
    type: 'evm',
    hasWalletConnect: false,
    isTestnet: false,
    category: 'layer2',
    chainId: 10,
  },
  {
    id: 'polygonGasless',
    name: 'Polygon (Gasless)',
    symbol: 'MATIC',
    icon: Polygon,
    type: 'evm',
    hasWalletConnect: false,
    isTestnet: false,
    category: 'sidechain',
    chainId: 137,
  },
];

/**
 * Get only mainnet chains (filter out testnets)
 */
export const mainnetChains = chains.filter((chain) => !chain.isTestnet);

/**
 * Get featured chains (Ethereum, Bitcoin, Polkadot, Solana)
 */
export const featuredChains = mainnetChains.filter((chain) => chain.featured);

/**
 * Get EVM chains that support WalletConnect
 */
export const evmChains = mainnetChains.filter(
  (chain) => chain.type === 'evm' && chain.hasWalletConnect
);

/**
 * Get a chain by its ID
 */
export const getChainById = (id: string): Chain | undefined => {
  return chains.find((chain) => chain.id === id);
};

/**
 * Get a chain by its type
 */
export const getChainsByType = (type: ChainType): Chain[] => {
  return mainnetChains.filter((chain) => chain.type === type);
};

/**
 * Map wallet category to chain type
 * This is used to match wallet data from the backend
 */
export const mapWalletCategoryToChainType = (category?: string): ChainType | null => {
  if (!category) return 'evm'; // Default to EVM for backward compatibility

  switch (category.toLowerCase()) {
    case 'evm':
    case 'ethereum':
      return 'evm';
    case 'bitcoin':
    case 'btc':
      return 'bitcoin';
    case 'substrate':
    case 'polkadot':
    case 'dot':
      return 'substrate';
    case 'solana':
    case 'sol':
    case 'tron':
    case 'trx':
      return 'solana'; // Using 'solana' as generic non-EVM type
    case 'aptos':
      return 'aptos';
    default:
      return null;
  }
};

/**
 * Default chain (Ethereum Smart Account ERC-4337) - guaranteed to exist
 * This should match the first wallet in the selector (highest priority smart account)
 */
export const DEFAULT_CHAIN: Chain = {
  id: 'ethereumErc4337',
  name: 'Ethereum Gasless',
  symbol: 'ETH',
  icon: Ethereum,
  type: 'evm',
  hasWalletConnect: true,
  isTestnet: false,
  category: 'layer1',
  chainId: 1,
  featured: true,
};

/**
 * Get EIP-7702 gasless chains
 */
export const gaslessChains = chains.filter((chain) => chain.id.endsWith('Gasless'));

/**
 * Get mainnet gasless chains only
 */
export const mainnetGaslessChains = gaslessChains.filter((chain) => !chain.isTestnet);

/**
 * Get testnet gasless chains only
 */
export const testnetGaslessChains = gaslessChains.filter((chain) => chain.isTestnet);

/**
 * Check if a chain supports EIP-7702 gasless transactions
 */
export const isGaslessChain = (chainId: string): boolean => {
  return chainId.endsWith('Gasless');
};

/**
 * Map gasless chain ID to EVM chain ID
 */
export const gaslessChainIdMap: Record<string, number> = {
  ethereumGasless: 1,
  baseGasless: 8453,
  arbitrumGasless: 42161,
  optimismGasless: 10,
  polygonGasless: 137,
};

/**
 * Get EVM chain ID for a gasless chain
 */
export const getGaslessChainId = (chainId: string): number | undefined => {
  return gaslessChainIdMap[chainId];
};
