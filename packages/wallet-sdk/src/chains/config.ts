import type { ChainConfig, ChainName } from './types.js';

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: {
    chainId: '1',
    name: 'Ethereum Mainnet',
    bundlerUrl: '',
    paymasterUrl: '',
    paymasterAddress: '',
    entryPointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', // ERC-4337 standard
    rpcUrl: '',
  },
  base: {
    chainId: '8453',
    name: 'Base Mainnet',
    bundlerUrl: '',
    paymasterUrl: '',
    paymasterAddress: '',
    entryPointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    rpcUrl: '',
  },
  arbitrum: {
    chainId: '42161',
    name: 'Arbitrum One',
    bundlerUrl: '',
    paymasterUrl: '',
    paymasterAddress: '',
    entryPointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    rpcUrl: '',
  },
  avalanche: {
    chainId: '43114',
    name: 'Avalanche C-Chain',
    bundlerUrl: '',
    paymasterUrl: '',
    paymasterAddress: '',
    entryPointAddress: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    rpcUrl: '',
  },
} as const;

/**
 * Get chain configuration with runtime URLs
 * This should be called with environment-specific URLs from the app
 */
export function getChainConfig(chain: string, config: { 
  bundlerUrl: string; 
  paymasterUrl: string; 
  paymasterAddress: string;
  rpcUrl: string;
}): ChainConfig {
  const baseConfig = CHAIN_CONFIGS[chain];
  if (!baseConfig) {
    throw new Error(`Unknown chain: ${chain}`);
  }
  return {
    ...baseConfig,
    bundlerUrl: config.bundlerUrl,
    paymasterUrl: config.paymasterUrl,
    paymasterAddress: config.paymasterAddress,
    rpcUrl: config.rpcUrl,
  };
}

