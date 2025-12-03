/**
 * Substrate Chain Configuration
 *
 * Issue #5: Chain Configuration Lacks Testnet RPC Endpoints
 * - Structure with separate mainnet/testnet configurations
 * - Environment-based chain selection (feature flags)
 * - Support for Polkadot, Hydration, Bifrost, Unique, Paseo testnet
 */

import { checkAddress } from '@polkadot/util-crypto';

export interface TokenConfig {
  symbol: string;
  decimals: number;
}

export interface ChainNetworkConfig {
  genesisHash: string;
  rpc: string;
  ss58Prefix: number;
  token: TokenConfig;
  name: string;
  paraId?: number; // Parachain ID (if applicable)
  walletConnectId: string; // CAIP-2 format: polkadot:<genesis_hash>
  isTestnet: boolean;
}

export interface ChainConfig {
  mainnet: ChainNetworkConfig;
  testnet: ChainNetworkConfig;
}

export type SubstrateChainKey =
  | 'polkadot'
  | 'hydration'
  | 'bifrost'
  | 'unique'
  | 'paseo'
  | 'paseoAssethub';

/**
 * Substrate Chain Configurations
 * Separate mainnet and testnet configs for each chain
 */
export const SUBSTRATE_CHAINS: Record<SubstrateChainKey, ChainConfig> = {
  polkadot: {
    mainnet: {
      genesisHash: '0x91b171bb158e2d3848fa23a9f1c25182',
      rpc: 'wss://rpc.polkadot.io',
      ss58Prefix: 0,
      token: { symbol: 'DOT', decimals: 10 },
      name: 'Polkadot',
      walletConnectId: 'polkadot:91b171bb158e2d3848fa23a9f1c25182',
      isTestnet: false,
    },
    testnet: {
      // Paseo PassetHub (Polkadot Testnet)
      genesisHash:
        '0xd5d32db5e6c12cdc1a94a4b58a19c59aaab54dfcc6d11ad26dc9db8d5c858ad2',
      rpc: 'wss://rpc.ibp.network/paseo',
      ss58Prefix: 42,
      token: { symbol: 'PAS', decimals: 18 },
      name: 'Paseo PassetHub',
      walletConnectId:
        'polkadot:d5d32db5e6c12cdc1a94a4b58a19c59aaab54dfcc6d11ad26dc9db8d5c858ad2',
      isTestnet: true,
    },
  },
  hydration: {
    mainnet: {
      genesisHash:
        '0xaf9326e6615b9c21ef01ba1763c475c04057270bf6b6aeb1dd1bd0f3722ab861',
      rpc: 'wss://rpc.hydradx.cloud',
      ss58Prefix: 63,
      token: { symbol: 'HDX', decimals: 12 },
      name: 'Hydration (HydraDX)',
      paraId: 2034,
      walletConnectId:
        'polkadot:af9326e6615b9c21ef01ba1763c475c04057270bf6b6aeb1dd1bd0f3722ab861',
      isTestnet: false,
    },
    testnet: {
      // Hydration testnet on Paseo
      genesisHash:
        '0x0000000000000000000000000000000000000000000000000000000000000000', // TODO: Update with actual testnet genesis hash
      rpc: 'wss://paseo-rpc.play.hydration.cloud',
      ss58Prefix: 63,
      token: { symbol: 'HDX', decimals: 12 },
      name: 'Hydration Testnet',
      paraId: 2034,
      walletConnectId:
        'polkadot:0000000000000000000000000000000000000000000000000000000000000000',
      isTestnet: true,
    },
  },
  bifrost: {
    mainnet: {
      genesisHash:
        '0x262e1b2ad728475fd6fe88e62fb47b7f6c73d6e2a6fc3389a95ff8e6e3de7e89',
      rpc: 'wss://rpc.bifrost.finance',
      ss58Prefix: 6,
      token: { symbol: 'BNC', decimals: 12 },
      name: 'Bifrost',
      paraId: 2031,
      walletConnectId:
        'polkadot:262e1b2ad728475fd6fe88e62fb47b7f6c73d6e2a6fc3389a95ff8e6e3de7e89',
      isTestnet: false,
    },
    testnet: {
      // Bifrost testnet (if available - using placeholder for now)
      genesisHash:
        '0x0000000000000000000000000000000000000000000000000000000000000000', // TODO: Update with actual testnet genesis hash
      rpc: 'wss://public-02.testnet.bifrostnetwork.com/wss', // TODO: Update with actual testnet RPC
      ss58Prefix: 6,
      token: { symbol: 'BNC', decimals: 12 },
      name: 'Bifrost Testnet',
      paraId: 2031,
      walletConnectId:
        'polkadot:0000000000000000000000000000000000000000000000000000000000000000',
      isTestnet: true,
    },
  },
  unique: {
    mainnet: {
      genesisHash:
        '0x84322d9cddbf35c713341e2c3fb0a0da20d2bbb28221c6521d1bd7fc85949971',
      rpc: 'wss://rpc.unique.network',
      ss58Prefix: 7,
      token: { symbol: 'UNQ', decimals: 18 },
      name: 'Unique Marketplace',
      paraId: 8880,
      walletConnectId:
        'polkadot:84322d9cddbf35c713341e2c3fb0a0da20d2bbb28221c6521d1bd7fc85949971',
      isTestnet: false,
    },
    testnet: {
      // Unique testnet (if available - using placeholder for now)
      genesisHash:
        '0x0000000000000000000000000000000000000000000000000000000000000000', // TODO: Update with actual testnet genesis hash
      rpc: 'wss://ws-opal.unique.network', // TODO: Update with actual testnet RPC
      ss58Prefix: 7,
      token: { symbol: 'UNQ', decimals: 18 },
      name: 'Unique Testnet',
      paraId: 8880,
      walletConnectId:
        'polkadot:0000000000000000000000000000000000000000000000000000000000000000',
      isTestnet: true,
    },
  },
  paseo: {
    // Paseo PassetHub - EVM-compatible testnet parachain
    // Note: EVM RPC is configured separately in chain.config.ts as 'paseoPassetHub'
    mainnet: {
      genesisHash: '0x91b171bb158e2d3848fa23a9f1c25182',
      rpc: 'wss://rpc.polkadot.io',
      ss58Prefix: 0,
      token: { symbol: 'DOT', decimals: 10 },
      name: 'Polkadot',
      walletConnectId: 'polkadot:91b171bb158e2d3848fa23a9f1c25182',
      isTestnet: false,
    },
    testnet: {
      genesisHash:
        '0xd5d32db5e6c12cdc1a94a4b58a19c59aaab54dfcc6d11ad26dc9db8d5c858ad2',
      rpc: 'wss://rpc.ibp.network/paseo',
      ss58Prefix: 42,
      token: { symbol: 'PAS', decimals: 18 },
      name: 'Paseo PassetHub',
      walletConnectId:
        'polkadot:d5d32db5e6c12cdc1a94a4b58a19c59aaab54dfcc6d11ad26dc9db8d5c858ad2',
      isTestnet: true,
    },
  },
  paseoAssethub: {
    // Paseo AssetHub - Asset-bearing testnet parachain for transaction testing
    // Note: Regular Paseo is NOT asset-bearing, use AssetHub for transactions
    mainnet: {
      // AssetHub mainnet would go here if needed
      genesisHash:
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      rpc: 'wss://asset-hub-polkadot.dotters.network',
      ss58Prefix: 0,
      token: { symbol: 'DOT', decimals: 10 },
      name: 'Polkadot AssetHub',
      paraId: 1000,
      walletConnectId:
        'polkadot:0000000000000000000000000000000000000000000000000000000000000000',
      isTestnet: false,
    },
    testnet: {
      // Paseo AssetHub (Testnet) - Asset-bearing chain for transaction testing
      // Note: SS58 prefix is 0 (same as Polkadot) - verified at runtime via api.registry.chainSS58
      genesisHash:
        '0xb2bd50b6b5e8cd4996fa87e17dcb9fbc3ce3e4e47d0c114b92111decc032d0e9',
      rpc: 'wss://asset-hub-paseo.dotters.network',
      ss58Prefix: 0, // Changed from 47 to 0 - prefix 47 is not supported by Keyring
      token: { symbol: 'PAS', decimals: 10 },
      name: 'Paseo AssetHub',
      paraId: 1000,
      walletConnectId:
        'polkadot:b2bd50b6b5e8cd4996fa87e17dcb9fbc3ce3e4e47d0c114b92111decc032d0e9',
      isTestnet: true,
    },
  },
};

/**
 * Feature flags for environment-based chain selection
 */
export const SUBSTRATE_FEATURES = {
  TESTNET_ENABLED: process.env.ENABLE_SUBSTRATE_TESTNET === 'true',
  WALLETCONNECT_ENABLED: process.env.ENABLE_SUBSTRATE_WC === 'true',
  MAINNET_ENABLED: process.env.ENABLE_SUBSTRATE_MAINNET !== 'false', // Default to true
} as const;

/**
 * Get chain configuration based on environment
 *
 * @param chain - Chain key
 * @param useTestnet - Whether to use testnet (overrides feature flag)
 * @returns Chain network configuration
 */
export function getChainConfig(
  chain: SubstrateChainKey,
  useTestnet?: boolean,
): ChainNetworkConfig {
  const chainConfig = SUBSTRATE_CHAINS[chain];

  // Paseo and Paseo AssetHub are testnet-only chains, always use testnet config
  if (chain === 'paseo' || chain === 'paseoAssethub') {
    return chainConfig.testnet;
  }

  // Determine which network to use for other chains
  const shouldUseTestnet =
    useTestnet !== undefined
      ? useTestnet
      : SUBSTRATE_FEATURES.TESTNET_ENABLED &&
        !SUBSTRATE_FEATURES.MAINNET_ENABLED;

  return shouldUseTestnet ? chainConfig.testnet : chainConfig.mainnet;
}

/**
 * Get all enabled chains based on feature flags
 *
 * @returns Array of chain keys that are enabled
 */
export function getEnabledChains(): SubstrateChainKey[] {
  const chains: SubstrateChainKey[] = [
    'polkadot',
    'hydration',
    'bifrost',
    'unique',
    'paseo',
    'paseoAssethub',
  ];

  // Filter based on feature flags
  if (
    !SUBSTRATE_FEATURES.MAINNET_ENABLED &&
    !SUBSTRATE_FEATURES.TESTNET_ENABLED
  ) {
    return [];
  }

  return chains;
}

/**
 * Check if a chain is enabled
 *
 * @param chain - Chain key
 * @returns true if enabled
 */
export function isChainEnabled(chain: SubstrateChainKey): boolean {
  return getEnabledChains().includes(chain);
}

/**
 * Find chain configuration from SS58 address by detecting prefix
 * (Inspired by Edgeware example - prefix-agnostic address handling)
 *
 * @param address - SS58 encoded address
 * @returns Chain key and network config, or null if not found
 */
export function findChainFromAddress(address: string): {
  chain: SubstrateChainKey;
  config: ChainNetworkConfig;
  isTestnet: boolean;
} | null {
  // Try each chain configuration to find matching prefix
  const chains: SubstrateChainKey[] = [
    'polkadot',
    'hydration',
    'bifrost',
    'unique',
    'paseo',
    'paseoAssethub',
  ];

  // First try testnet configs, then mainnet
  for (const chain of chains) {
    const chainConfig = SUBSTRATE_CHAINS[chain];

    // Try testnet first
    const testnetResult = checkAddress(address, chainConfig.testnet.ss58Prefix);
    if (testnetResult[0] === true) {
      return {
        chain,
        config: chainConfig.testnet,
        isTestnet: true,
      };
    }

    // Try mainnet
    const mainnetResult = checkAddress(address, chainConfig.mainnet.ss58Prefix);
    if (mainnetResult[0] === true) {
      return {
        chain,
        config: chainConfig.mainnet,
        isTestnet: false,
      };
    }
  }

  return null;
}

/**
 * Get chain configuration from address (auto-detect prefix)
 * Falls back to testnet if prefix matches testnet, mainnet otherwise
 *
 * @param address - SS58 encoded address
 * @param preferTestnet - If true and both match, prefer testnet
 * @returns Chain key and network config
 * @throws Error if address doesn't match any known chain
 */
export function getChainConfigFromAddress(
  address: string,
  preferTestnet: boolean = false,
): {
  chain: SubstrateChainKey;
  config: ChainNetworkConfig;
  isTestnet: boolean;
} {
  const result = findChainFromAddress(address);

  if (!result) {
    throw new Error(
      `Address ${address} does not match any known Substrate chain configuration`,
    );
  }

  return result;
}
