import { Address, Chain } from 'viem';
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  avalanche,
  avalancheFuji,
  bsc,
  bscTestnet,
  gnosis,
  celo,
  celoAlfajores,
  scroll,
  scrollSepolia,
  zkSync,
  zkSyncSepoliaTestnet,
  linea,
  lineaSepolia,
  mantle,
  mantleSepoliaTestnet,
  blast,
  blastSepolia,
  zora,
  zoraSepolia,
  mode,
  modeTestnet,
  fraxtal,
  fraxtalTestnet,
} from 'viem/chains';

/**
 * EIP-7702 Chain Configuration
 *
 * SECURITY: Chain configurations for gasless transactions
 * - Each chain has specific EntryPoint addresses
 * - EIP-7702 support flag indicates native EOA delegation support
 * - Fallback RPC URLs for reliability
 */

// Supported network identifiers
export type Eip7702Network =
  // Ethereum
  | 'ethereum'
  | 'sepolia'
  // Base
  | 'base'
  | 'baseSepolia'
  // Arbitrum
  | 'arbitrum'
  | 'arbitrumSepolia'
  // Optimism
  | 'optimism'
  | 'optimismSepolia'
  // Polygon
  | 'polygon'
  | 'polygonAmoy'
  // Avalanche
  | 'avalanche'
  | 'avalancheFuji'
  // BSC
  | 'bsc'
  | 'bscTestnet'
  // Other L1s
  | 'gnosis'
  | 'celo'
  | 'celoAlfajores'
  // L2s
  | 'scroll'
  | 'scrollSepolia'
  | 'zkSync'
  | 'zkSyncSepolia'
  | 'linea'
  | 'lineaSepolia'
  | 'mantle'
  | 'mantleSepolia'
  | 'blast'
  | 'blastSepolia'
  | 'zora'
  | 'zoraSepolia'
  | 'mode'
  | 'modeTestnet'
  | 'fraxtal'
  | 'fraxtalTestnet';

export interface Eip7702ChainConfig {
  /** Network identifier */
  name: Eip7702Network;
  /** Chain ID */
  chainId: number;
  /** Viem chain object */
  viemChain: Chain;
  /** Fallback RPC URLs (first is primary) */
  rpcUrls: string[];
  /** Pimlico API chain identifier */
  pimlicoChainName: string;
  /** Block explorer URL */
  explorerUrl: string;
  /** Whether chain supports EIP-7702 natively */
  supportsEip7702: boolean;
  /** EntryPoint contract address */
  entryPointAddress: Address;
  /** Whether this is a testnet */
  isTestnet: boolean;
  /** Native currency symbol */
  nativeCurrency: string;
  /** Native currency decimals */
  nativeDecimals: number;
  /** Minimum confirmation blocks for finality */
  confirmationBlocks: number;
}

// EntryPoint addresses (ERC-4337 v0.7)
export const ENTRY_POINT_V07: Address =
  '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

// SimpleSmartAccount implementation for EIP-7702
export const SIMPLE_ACCOUNT_7702_IMPLEMENTATION: Address =
  '0xe6Cae83BdE06E4c305530e199D7217f42808555B';

/**
 * Parse RPC URLs from environment variable
 * SECURITY: Validate URL format to prevent injection
 */
function parseRpcUrls(envVar: string | undefined, fallback: string[]): string[] {
  if (!envVar || envVar.trim() === '') return fallback;

  const urls = envVar
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  const validUrls = urls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      console.warn(`[EIP-7702] Invalid RPC URL ignored: ${url}`);
      return false;
    }
  });

  return validUrls.length > 0 ? validUrls : fallback;
}

/**
 * Chain configurations
 * SECURITY: confirmationBlocks set per chain for reorg protection
 */
export const EIP7702_CHAINS: Record<Eip7702Network, Eip7702ChainConfig> = {
  // ============ ETHEREUM ============
  ethereum: {
    name: 'ethereum',
    chainId: 1,
    viemChain: mainnet,
    rpcUrls: parseRpcUrls(process.env.ETHEREUM_RPC_URLS, [
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://ethereum.publicnode.com',
    ]),
    pimlicoChainName: 'ethereum',
    explorerUrl: 'https://etherscan.io',
    supportsEip7702: true, // Pectra hardfork enabled
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 12,
  },
  sepolia: {
    name: 'sepolia',
    chainId: 11155111,
    viemChain: sepolia,
    rpcUrls: parseRpcUrls(process.env.SEPOLIA_RPC_URLS, [
      'https://rpc.sepolia.org',
      'https://sepolia.drpc.org',
    ]),
    pimlicoChainName: 'sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
    supportsEip7702: true,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ BASE ============
  base: {
    name: 'base',
    chainId: 8453,
    viemChain: base,
    rpcUrls: parseRpcUrls(process.env.BASE_RPC_URLS, [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
    ]),
    pimlicoChainName: 'base',
    explorerUrl: 'https://basescan.org',
    supportsEip7702: true,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  baseSepolia: {
    name: 'baseSepolia',
    chainId: 84532,
    viemChain: baseSepolia,
    rpcUrls: parseRpcUrls(process.env.BASE_SEPOLIA_RPC_URLS, [
      'https://sepolia.base.org',
    ]),
    pimlicoChainName: 'base-sepolia',
    explorerUrl: 'https://sepolia.basescan.org',
    supportsEip7702: true,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ ARBITRUM ============
  arbitrum: {
    name: 'arbitrum',
    chainId: 42161,
    viemChain: arbitrum,
    rpcUrls: parseRpcUrls(process.env.ARBITRUM_RPC_URLS, [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
    ]),
    pimlicoChainName: 'arbitrum',
    explorerUrl: 'https://arbiscan.io',
    supportsEip7702: true,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  arbitrumSepolia: {
    name: 'arbitrumSepolia',
    chainId: 421614,
    viemChain: arbitrumSepolia,
    rpcUrls: parseRpcUrls(process.env.ARBITRUM_SEPOLIA_RPC_URLS, [
      'https://sepolia-rollup.arbitrum.io/rpc',
    ]),
    pimlicoChainName: 'arbitrum-sepolia',
    explorerUrl: 'https://sepolia.arbiscan.io',
    supportsEip7702: true,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ OPTIMISM ============
  optimism: {
    name: 'optimism',
    chainId: 10,
    viemChain: optimism,
    rpcUrls: parseRpcUrls(process.env.OPTIMISM_RPC_URLS, [
      'https://mainnet.optimism.io',
      'https://optimism.llamarpc.com',
    ]),
    pimlicoChainName: 'optimism',
    explorerUrl: 'https://optimistic.etherscan.io',
    supportsEip7702: true,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  optimismSepolia: {
    name: 'optimismSepolia',
    chainId: 11155420,
    viemChain: optimismSepolia,
    rpcUrls: parseRpcUrls(process.env.OPTIMISM_SEPOLIA_RPC_URLS, [
      'https://sepolia.optimism.io',
    ]),
    pimlicoChainName: 'optimism-sepolia',
    explorerUrl: 'https://sepolia-optimism.etherscan.io',
    supportsEip7702: true,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ POLYGON ============
  polygon: {
    name: 'polygon',
    chainId: 137,
    viemChain: polygon,
    rpcUrls: parseRpcUrls(process.env.POLYGON_RPC_URLS, [
      'https://polygon-rpc.com',
      'https://polygon.llamarpc.com',
    ]),
    pimlicoChainName: 'polygon',
    explorerUrl: 'https://polygonscan.com',
    supportsEip7702: false, // ERC-4337 only for now
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'MATIC',
    nativeDecimals: 18,
    confirmationBlocks: 128,
  },
  polygonAmoy: {
    name: 'polygonAmoy',
    chainId: 80002,
    viemChain: polygonAmoy,
    rpcUrls: parseRpcUrls(process.env.POLYGON_AMOY_RPC_URLS, [
      'https://rpc-amoy.polygon.technology',
    ]),
    pimlicoChainName: 'polygon-amoy',
    explorerUrl: 'https://amoy.polygonscan.com',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'MATIC',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ AVALANCHE ============
  avalanche: {
    name: 'avalanche',
    chainId: 43114,
    viemChain: avalanche,
    rpcUrls: parseRpcUrls(process.env.AVALANCHE_RPC_URLS, [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche.llamarpc.com',
    ]),
    pimlicoChainName: 'avalanche',
    explorerUrl: 'https://snowtrace.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'AVAX',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  avalancheFuji: {
    name: 'avalancheFuji',
    chainId: 43113,
    viemChain: avalancheFuji,
    rpcUrls: parseRpcUrls(process.env.AVALANCHE_FUJI_RPC_URLS, [
      'https://api.avax-test.network/ext/bc/C/rpc',
    ]),
    pimlicoChainName: 'avalanche-fuji',
    explorerUrl: 'https://testnet.snowtrace.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'AVAX',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ BSC ============
  bsc: {
    name: 'bsc',
    chainId: 56,
    viemChain: bsc,
    rpcUrls: parseRpcUrls(process.env.BSC_RPC_URLS, [
      'https://bsc-dataseed.binance.org',
      'https://bsc.llamarpc.com',
    ]),
    pimlicoChainName: 'binance',
    explorerUrl: 'https://bscscan.com',
    supportsEip7702: true, // BSC has EIP-7702
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'BNB',
    nativeDecimals: 18,
    confirmationBlocks: 15,
  },
  bscTestnet: {
    name: 'bscTestnet',
    chainId: 97,
    viemChain: bscTestnet,
    rpcUrls: parseRpcUrls(process.env.BSC_TESTNET_RPC_URLS, [
      'https://data-seed-prebsc-1-s1.binance.org:8545',
    ]),
    pimlicoChainName: 'binance-testnet',
    explorerUrl: 'https://testnet.bscscan.com',
    supportsEip7702: true,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'BNB',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ GNOSIS ============
  gnosis: {
    name: 'gnosis',
    chainId: 100,
    viemChain: gnosis,
    rpcUrls: parseRpcUrls(process.env.GNOSIS_RPC_URLS, [
      'https://rpc.gnosischain.com',
    ]),
    pimlicoChainName: 'gnosis',
    explorerUrl: 'https://gnosisscan.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'xDAI',
    nativeDecimals: 18,
    confirmationBlocks: 12,
  },

  // ============ CELO ============
  celo: {
    name: 'celo',
    chainId: 42220,
    viemChain: celo,
    rpcUrls: parseRpcUrls(process.env.CELO_RPC_URLS, [
      'https://forno.celo.org',
    ]),
    pimlicoChainName: 'celo',
    explorerUrl: 'https://celoscan.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'CELO',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  celoAlfajores: {
    name: 'celoAlfajores',
    chainId: 44787,
    viemChain: celoAlfajores,
    rpcUrls: parseRpcUrls(process.env.CELO_ALFAJORES_RPC_URLS, [
      'https://alfajores-forno.celo-testnet.org',
    ]),
    pimlicoChainName: 'celo-alfajores',
    explorerUrl: 'https://alfajores.celoscan.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'CELO',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ SCROLL ============
  scroll: {
    name: 'scroll',
    chainId: 534352,
    viemChain: scroll,
    rpcUrls: parseRpcUrls(process.env.SCROLL_RPC_URLS, [
      'https://rpc.scroll.io',
    ]),
    pimlicoChainName: 'scroll',
    explorerUrl: 'https://scrollscan.com',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  scrollSepolia: {
    name: 'scrollSepolia',
    chainId: 534351,
    viemChain: scrollSepolia,
    rpcUrls: parseRpcUrls(process.env.SCROLL_SEPOLIA_RPC_URLS, [
      'https://sepolia-rpc.scroll.io',
    ]),
    pimlicoChainName: 'scroll-sepolia',
    explorerUrl: 'https://sepolia.scrollscan.com',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ ZKSYNC ============
  zkSync: {
    name: 'zkSync',
    chainId: 324,
    viemChain: zkSync,
    rpcUrls: parseRpcUrls(process.env.ZKSYNC_RPC_URLS, [
      'https://mainnet.era.zksync.io',
    ]),
    pimlicoChainName: 'zksync-era',
    explorerUrl: 'https://explorer.zksync.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  zkSyncSepolia: {
    name: 'zkSyncSepolia',
    chainId: 300,
    viemChain: zkSyncSepoliaTestnet,
    rpcUrls: parseRpcUrls(process.env.ZKSYNC_SEPOLIA_RPC_URLS, [
      'https://sepolia.era.zksync.dev',
    ]),
    pimlicoChainName: 'zksync-era-sepolia',
    explorerUrl: 'https://sepolia.explorer.zksync.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ LINEA ============
  linea: {
    name: 'linea',
    chainId: 59144,
    viemChain: linea,
    rpcUrls: parseRpcUrls(process.env.LINEA_RPC_URLS, [
      'https://rpc.linea.build',
    ]),
    pimlicoChainName: 'linea',
    explorerUrl: 'https://lineascan.build',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  lineaSepolia: {
    name: 'lineaSepolia',
    chainId: 59141,
    viemChain: lineaSepolia,
    rpcUrls: parseRpcUrls(process.env.LINEA_SEPOLIA_RPC_URLS, [
      'https://rpc.sepolia.linea.build',
    ]),
    pimlicoChainName: 'linea-sepolia',
    explorerUrl: 'https://sepolia.lineascan.build',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ MANTLE ============
  mantle: {
    name: 'mantle',
    chainId: 5000,
    viemChain: mantle,
    rpcUrls: parseRpcUrls(process.env.MANTLE_RPC_URLS, [
      'https://rpc.mantle.xyz',
    ]),
    pimlicoChainName: 'mantle',
    explorerUrl: 'https://explorer.mantle.xyz',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'MNT',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  mantleSepolia: {
    name: 'mantleSepolia',
    chainId: 5003,
    viemChain: mantleSepoliaTestnet,
    rpcUrls: parseRpcUrls(process.env.MANTLE_SEPOLIA_RPC_URLS, [
      'https://rpc.sepolia.mantle.xyz',
    ]),
    pimlicoChainName: 'mantle-sepolia',
    explorerUrl: 'https://explorer.sepolia.mantle.xyz',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'MNT',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ BLAST ============
  blast: {
    name: 'blast',
    chainId: 81457,
    viemChain: blast,
    rpcUrls: parseRpcUrls(process.env.BLAST_RPC_URLS, [
      'https://rpc.blast.io',
    ]),
    pimlicoChainName: 'blast',
    explorerUrl: 'https://blastscan.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  blastSepolia: {
    name: 'blastSepolia',
    chainId: 168587773,
    viemChain: blastSepolia,
    rpcUrls: parseRpcUrls(process.env.BLAST_SEPOLIA_RPC_URLS, [
      'https://sepolia.blast.io',
    ]),
    pimlicoChainName: 'blast-sepolia',
    explorerUrl: 'https://sepolia.blastscan.io',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ ZORA ============
  zora: {
    name: 'zora',
    chainId: 7777777,
    viemChain: zora,
    rpcUrls: parseRpcUrls(process.env.ZORA_RPC_URLS, [
      'https://rpc.zora.energy',
    ]),
    pimlicoChainName: 'zora',
    explorerUrl: 'https://explorer.zora.energy',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  zoraSepolia: {
    name: 'zoraSepolia',
    chainId: 999999999,
    viemChain: zoraSepolia,
    rpcUrls: parseRpcUrls(process.env.ZORA_SEPOLIA_RPC_URLS, [
      'https://sepolia.rpc.zora.energy',
    ]),
    pimlicoChainName: 'zora-sepolia',
    explorerUrl: 'https://sepolia.explorer.zora.energy',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ MODE ============
  mode: {
    name: 'mode',
    chainId: 34443,
    viemChain: mode,
    rpcUrls: parseRpcUrls(process.env.MODE_RPC_URLS, [
      'https://mainnet.mode.network',
    ]),
    pimlicoChainName: 'mode',
    explorerUrl: 'https://explorer.mode.network',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  modeTestnet: {
    name: 'modeTestnet',
    chainId: 919,
    viemChain: modeTestnet,
    rpcUrls: parseRpcUrls(process.env.MODE_TESTNET_RPC_URLS, [
      'https://sepolia.mode.network',
    ]),
    pimlicoChainName: 'mode-sepolia',
    explorerUrl: 'https://sepolia.explorer.mode.network',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'ETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },

  // ============ FRAXTAL ============
  fraxtal: {
    name: 'fraxtal',
    chainId: 252,
    viemChain: fraxtal,
    rpcUrls: parseRpcUrls(process.env.FRAXTAL_RPC_URLS, [
      'https://rpc.frax.com',
    ]),
    pimlicoChainName: 'fraxtal',
    explorerUrl: 'https://fraxscan.com',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: false,
    nativeCurrency: 'frxETH',
    nativeDecimals: 18,
    confirmationBlocks: 6,
  },
  fraxtalTestnet: {
    name: 'fraxtalTestnet',
    chainId: 2522,
    viemChain: fraxtalTestnet,
    rpcUrls: parseRpcUrls(process.env.FRAXTAL_TESTNET_RPC_URLS, [
      'https://rpc.testnet.frax.com',
    ]),
    pimlicoChainName: 'fraxtal-testnet',
    explorerUrl: 'https://holesky.fraxscan.com',
    supportsEip7702: false,
    entryPointAddress: ENTRY_POINT_V07,
    isTestnet: true,
    nativeCurrency: 'frxETH',
    nativeDecimals: 18,
    confirmationBlocks: 3,
  },
};

// ============ HELPER FUNCTIONS ============

/**
 * Get chain config by chain ID
 * @throws Error if chain not supported
 */
export function getChainConfig(chainId: number): Eip7702ChainConfig {
  const config = Object.values(EIP7702_CHAINS).find(
    (c) => c.chainId === chainId,
  );
  if (!config) {
    throw new Error(
      `Chain ID ${chainId} not supported for gasless transactions`,
    );
  }
  return config;
}

/**
 * Get chain config by network name
 */
export function getChainConfigByName(
  name: Eip7702Network,
): Eip7702ChainConfig {
  const config = EIP7702_CHAINS[name];
  if (!config) {
    throw new Error(`Network ${name} not supported`);
  }
  return config;
}

/**
 * Check if chain supports gasless transactions
 */
export function isGaslessSupported(chainId: number): boolean {
  try {
    getChainConfig(chainId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if chain supports EIP-7702 (native EOA delegation)
 */
export function supportsEip7702(chainId: number): boolean {
  try {
    const config = getChainConfig(chainId);
    return config.supportsEip7702;
  } catch {
    return false;
  }
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.values(EIP7702_CHAINS).map((c) => c.chainId);
}

/**
 * Get mainnet chains only
 */
export function getMainnetChains(): Eip7702ChainConfig[] {
  return Object.values(EIP7702_CHAINS).filter((c) => !c.isTestnet);
}

/**
 * Get testnet chains only
 */
export function getTestnetChains(): Eip7702ChainConfig[] {
  return Object.values(EIP7702_CHAINS).filter((c) => c.isTestnet);
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const config = getChainConfig(chainId);
  return `${config.explorerUrl}/tx/${txHash}`;
}

/**
 * Get Pimlico bundler URL for chain
 */
export function getPimlicoBundlerUrl(
  chainId: number,
  apiKey: string,
): string {
  const config = getChainConfig(chainId);
  return `https://api.pimlico.io/v2/${config.pimlicoChainName}/rpc?apikey=${apiKey}`;
}

// Log loaded configuration in non-production
if (process.env.NODE_ENV !== 'production') {
  const mainnetCount = getMainnetChains().length;
  const testnetCount = getTestnetChains().length;
  console.log(
    `[EIP-7702] Loaded ${mainnetCount} mainnet + ${testnetCount} testnet chains`,
  );
}

