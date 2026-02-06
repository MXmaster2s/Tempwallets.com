import { AnyChainAsset } from '@/lib/api';

/**
 * Normalized balance type for consistent data shape across all chains
 */
export interface NormalizedBalance {
  chain: string;
  symbol: string;
  balance: string; // smallest units (wei, satoshi, lamports, etc.)
  decimals: number;
  balanceHuman?: string; // human-readable balance
  isNative: boolean; // true for native tokens, false for ERC-20/SPL/etc.
  address?: string | null; // token contract address (null for native)
  valueUsd?: number; // USD value
}

/**
 * Normalized transaction type (matches existing Transaction interface from api.ts)
 * Re-exported here for consistency
 */
export type { Transaction } from '@/lib/api';

/**
 * Substrate balance data from API
 */
export interface SubstrateBalanceData {
  balance: string;
  address: string | null;
  token: string;
  decimals: number;
}

/**
 * Map backend chain keys to frontend chain keys for Substrate chains
 */
const SUBSTRATE_CHAIN_KEY_MAP: Record<string, string> = {
  polkadot: 'polkadot',
  hydration: 'hydrationSubstrate',
  bifrost: 'bifrostSubstrate',
  unique: 'uniqueSubstrate',
  paseo: 'paseo',
  paseoAssethub: 'paseoAssethub',
};

/**
 * Default decimals for Substrate chains (used when creating zero balances)
 */
const SUBSTRATE_DEFAULT_DECIMALS: Record<string, number> = {
  polkadot: 10,
  hydrationSubstrate: 12,
  bifrostSubstrate: 12,
  uniqueSubstrate: 18,
  paseo: 10,
  paseoAssethub: 10,
};

/**
 * Native token symbols for all chains
 */
const NATIVE_TOKEN_SYMBOLS: Record<string, string> = {
  // Zerion canonical chains
  ethereum: 'ETH',
  base: 'ETH',
  arbitrum: 'ETH',
  polygon: 'MATIC',
  solana: 'SOL',
  avalanche: 'AVAX',
  // Legacy/internal fallbacks
  tron: 'TRX',
  bitcoin: 'BTC',
  // Polkadot EVM Compatible chains
  moonbeamTestnet: 'DEV',
  astarShibuya: 'SBY',
  paseoPassetHub: 'PAS',
  // Substrate/Polkadot chains
  polkadot: 'DOT',
  hydrationSubstrate: 'HDX',
  bifrostSubstrate: 'BFC',
  uniqueSubstrate: 'UNQ',
  paseo: 'PAS',
  paseoAssethub: 'PAS',
};

/**
 * Featured chains that should always show in balance view (even with zero balance)
 */
export const FEATURED_CHAINS = [
  // EVM EOAs
  'ethereum',
  'base',
  'arbitrum',
  'polygon',
  'avalanche',
  // Non-EVM
  'bitcoin',
  'solana',
  'tron',
  'polkadot',
  // Substrate parachains
  'hydrationSubstrate',
  'bifrostSubstrate',
  'uniqueSubstrate',
  'paseo',
  'paseoAssethub',
  // Polkadot EVM compatible
  'moonbeamTestnet',
  'astarShibuya',
  'paseoPassetHub',
] as const;

/**
 * Normalize AnyChainAsset[] to NormalizedBalance[]
 */
export function normalizeAssets(assets: AnyChainAsset[]): NormalizedBalance[] {
  return assets.map((asset) => ({
    chain: asset.chain,
    symbol: asset.symbol,
    balance: asset.balance,
    decimals: asset.decimals,
    balanceHuman: asset.balanceHuman,
    isNative: asset.address === null,
    address: asset.address,
    valueUsd: asset.valueUsd,
  }));
}

/**
 * Normalize SubstrateBalances to NormalizedBalance[]
 */
export function normalizeSubstrateBalances(
  substrateBalances: Record<string, SubstrateBalanceData>
): NormalizedBalance[] {
  const normalized: NormalizedBalance[] = [];

  for (const [backendChain, balanceData] of Object.entries(substrateBalances)) {
    if (!balanceData.address) {
      continue; // Skip if no address
    }

    // Map backend chain key to frontend chain key
    const frontendChain = SUBSTRATE_CHAIN_KEY_MAP[backendChain] || backendChain;

    normalized.push({
      chain: frontendChain,
      symbol: balanceData.token || NATIVE_TOKEN_SYMBOLS[frontendChain] || 'TOKEN',
      balance: balanceData.balance,
      decimals: balanceData.decimals,
      balanceHuman: parseFloat(balanceData.balance) > 0
        ? formatBalance(balanceData.balance, balanceData.decimals)
        : undefined,
      isNative: true,
      address: null,
    });
  }

  return normalized;
}

/**
 * Format balance from smallest units to human-readable
 */
function formatBalance(balance: string, decimals: number): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return '0';
  const humanReadable = num / Math.pow(10, decimals);
  return humanReadable.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Create zero balance entries for featured chains that don't have data yet
 * This ensures UI shows all chains immediately, even before data loads
 */
export function createZeroBalancesForFeaturedChains(
  existingChains: Set<string>
): NormalizedBalance[] {
  const zeroBalances: NormalizedBalance[] = [];

  for (const chain of FEATURED_CHAINS) {
    if (!existingChains.has(chain)) {
      const symbol = NATIVE_TOKEN_SYMBOLS[chain] || 'TOKEN';
      const decimals =
        chain in SUBSTRATE_DEFAULT_DECIMALS
          ? (SUBSTRATE_DEFAULT_DECIMALS[chain as keyof typeof SUBSTRATE_DEFAULT_DECIMALS] ?? 18)
          : 18;

      zeroBalances.push({
        chain,
        symbol,
        balance: '0',
        decimals,
        balanceHuman: undefined,
        isNative: true,
        address: null,
      });
    }
  }

  return zeroBalances;
}

/**
 * Merge and normalize all balances (EVM + Substrate + zero entries)
 */
export function mergeAndNormalizeBalances(
  assets: AnyChainAsset[],
  substrateBalances: Record<string, SubstrateBalanceData>
): NormalizedBalance[] {
  // Normalize EVM/other chain assets
  const normalizedAssets = normalizeAssets(assets);

  // Normalize Substrate balances
  const normalizedSubstrate = normalizeSubstrateBalances(substrateBalances);

  // Combine all balances
  const allBalances = [...normalizedAssets, ...normalizedSubstrate];

  // Track which chains we have data for
  const existingChains = new Set(allBalances.map((b) => b.chain));

  // Add zero balances for featured chains without data
  const zeroBalances = createZeroBalancesForFeaturedChains(existingChains);

  // Merge and return
  return [...allBalances, ...zeroBalances];
}

