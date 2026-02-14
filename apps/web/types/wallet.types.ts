import { ComponentType, SVGProps } from 'react';

/**
 * Chain types that determine wallet compatibility and functionality
 */
export type ChainType = 'evm' | 'substrate' | 'bitcoin' | 'solana' | 'tron' | 'aptos';

/**
 * Chain category for organizing chains
 */
export type ChainCategory = 'layer1' | 'layer2' | 'sidechain' | 'parachain';

/**
 * Chain group for grouping related chains
 */
export type ChainGroup = 
  | 'evm-standard'        // Standard EVM EOA wallets
  | 'evm-smart-account'   // ERC-4337 smart accounts
  | 'evm-testnet'         // EVM testnet chains
  | 'substrate-mainnet'   // Substrate/Polkadot mainnet parachains
  | 'substrate-testnet'   // Substrate testnet chains
  | 'bitcoin'             // Bitcoin chain
  | 'solana'              // Solana chain
  | 'tron'                // Tron chain
  | 'aptos';              // Aptos chain

/**
 * Wallet capabilities - what actions can be performed
 */
export interface WalletCapabilities {
  /** Supports WalletConnect protocol */
  walletConnect: boolean;
  
  /** Can send transactions */
  send: boolean;
  
  /** Can receive transactions (show QR code) */
  receive: boolean;
  
  /** Can copy address to clipboard */
  copy: boolean;
  
  /** Can fetch balance from API/RPC */
  balanceFetch: boolean;
  
  /** Can fetch transaction history */
  transactionHistory: boolean;
  
  /** Has native token balance to display */
  nativeToken: boolean;
  
  /** Supports token transfers (ERC-20, etc.) */
  tokenTransfers: boolean;
}

/**
 * Feature flags for wallet display and functionality
 */
export interface WalletFeatures {
  /** Show in main chain selector UI */
  showInSelector: boolean;
  
  /** Show in full wallet list */
  showInWalletList: boolean;
  
  /** Enabled in production environment */
  enabledInProd: boolean;
  
  /** Enabled in development environment */
  enabledInDev: boolean;
  
  /** Show in advanced/developer mode only */
  advancedOnly: boolean;
}

/**
 * Wallet configuration interface
 * This is the single source of truth for all wallet/chain configurations
 */
export interface WalletConfig {
  // ===== Identity =====
  /** Unique identifier matching backend key (e.g., 'ethereum', 'polkadot') */
  id: string;
  
  /** Display name for UI (e.g., 'Ethereum', 'Polkadot') */
  name: string;
  
  /** Token symbol (e.g., 'ETH', 'DOT', 'BTC') */
  symbol: string;
  
  /** Short description for tooltips */
  description?: string;
  
  // ===== Chain Properties =====
  /** Chain type determines wallet compatibility */
  type: ChainType;
  
  /** EVM chain ID (only for EVM chains) */
  chainId?: number;
  
  /** Whether this is a testnet or mainnet */
  isTestnet: boolean;
  
  /** Chain category for organization */
  category: ChainCategory;
  
  // ===== UI Configuration =====
  /** Show in UI by default (can be toggled by user) */
  visible: boolean;
  
  /** React component for the chain icon */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  
  /** Display priority (lower number = shown first) */
  priority: number;
  
  /** Color theme for this chain (hex color) */
  color?: string;
  
  // ===== Capabilities =====
  /** What actions can be performed with this wallet */
  capabilities: WalletCapabilities;
  
  // ===== Feature Flags =====
  /** Feature flags for display and functionality */
  features: WalletFeatures;
  
  // ===== Grouping =====
  /** Group this chain belongs to */
  group: ChainGroup;
  
  /** Parent chain if this is L2/parachain (e.g., 'ethereum' for Base) */
  parentChain?: string;
  
  /** Whether this is a smart account variant */
  isSmartAccount?: boolean;
  
  /** If this is EOA variant, link to smart account version */
  smartAccountVariant?: string;
  
  /** If this is smart account, link to EOA version */
  eoaVariant?: string;
}

/**
 * Wallet configuration filter options
 */
export interface WalletConfigFilter {
  /** Filter by chain type */
  type?: ChainType | ChainType[];
  
  /** Filter by testnet status */
  isTestnet?: boolean;
  
  /** Filter by visibility */
  visible?: boolean;
  
  /** Filter by group */
  group?: ChainGroup | ChainGroup[];
  
  /** Filter by capabilities */
  capabilities?: Partial<WalletCapabilities>;
  
  /** Filter by features */
  features?: Partial<WalletFeatures>;
  
  /** Include testnets (default: false in prod, true in dev) */
  includeTestnets?: boolean;
  
  /** Include advanced/hidden wallets */
  includeAdvanced?: boolean;
  
  /** Include smart accounts */
  includeSmartAccounts?: boolean;
  
  /** Filter by parent chain */
  parentChain?: string;
}

/**
 * Wallet runtime data (fetched from backend)
 */
export interface WalletData {
  /** Wallet configuration ID */
  configId: string;
  
  /** Wallet address */
  address: string | null;
  
  /** Wallet label/name from backend */
  label?: string;
  
  /** Loading state */
  loading: boolean;
  
  /** Error if failed to fetch */
  error?: string | null;
  
  /** Balance (if fetched) */
  balance?: {
    value: string;
    formatted: string;
    usdValue?: number;
    lastUpdated: Date;
  };
  
  /** Transaction count (if available) */
  transactionCount?: number;
}

/**
 * Wallet manager state
 */
export interface WalletManagerState {
  /** All wallet configurations */
  configs: WalletConfig[];
  
  /** Runtime wallet data indexed by config ID */
  wallets: Record<string, WalletData>;
  
  /** Currently selected wallet ID */
  selectedWalletId: string | null;
  
  /** User preferences */
  preferences: {
    showTestnets: boolean;
    showAdvanced: boolean;
    showSmartAccounts: boolean;
  };
  
  /** Environment */
  environment: 'development' | 'production';
}

/**
 * Token balance information
 */
export interface TokenBalance {
  /** Token contract address (null for native token) */
  address: string | null;
  
  /** Token symbol (ETH, USDC, etc.) */
  symbol: string;
  
  /** Raw balance string (in smallest units: wei, satoshi, etc.) */
  balance: string;
  
  /** Token decimals */
  decimals: number;
  
  /** Human-readable formatted balance */
  balanceHuman?: string;
  
  /** USD value (if available) */
  usdValue?: number;
  
  /** Token name (optional) */
  name?: string;
  
  /** Token logo URL (optional) */
  logoUrl?: string;
}

/**
 * Native balance information (simplified)
 */
export interface NativeBalance {
  /** Raw balance string (in smallest units) */
  balance: string;
  
  /** Human-readable formatted balance */
  formatted: string;
  
  /** Token symbol */
  symbol: string;
  
  /** Token decimals */
  decimals: number;
  
  /** USD value (if available) */
  usdValue?: number;
}

/**
 * Complete balance data for a wallet
 */
export interface BalanceData {
  /** Wallet config ID */
  configId: string;
  
  /** Native token balance */
  native: NativeBalance | null;
  
  /** Token balances (ERC-20, SPL, etc.) */
  tokens: TokenBalance[];
  
  /** Total USD value across all assets */
  totalUsdValue?: number;
  
  /** Last updated timestamp */
  lastUpdated: Date;
  
  /** Balance fetch error (if any) */
  error?: string | null;
}

/**
 * Balance streaming state (per wallet)
 */
export interface BalanceStreamState {
  /** Wallet config ID */
  configId: string;
  
  /** Loading state for this wallet's balance */
  loading: boolean;
  
  /** Balance data (null if not yet loaded) */
  balanceData: BalanceData | null;
  
  /** Error message (if balance fetch failed) */
  error?: string | null;
  
  /** Last updated timestamp */
  lastUpdated?: Date;
  
  /** Cache TTL in milliseconds (default: 60000 = 1 minute) */
  cacheTTL?: number;
}

/**
 * Balance manager state
 */
export interface BalanceManagerState {
  /** Balance states indexed by wallet config ID */
  balances: Record<string, BalanceStreamState>;
  
  /** Global loading state (true if any balance is loading) */
  loading: boolean;
  
  /** Global error state */
  error: string | null;
  
  /** Number of balances loaded */
  loadedCount: number;
  
  /** Total number of wallets */
  totalCount: number;
  
  /** Whether streaming is active */
  isStreaming: boolean;
}
