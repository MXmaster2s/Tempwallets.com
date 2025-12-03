// Type alias for supported Aptos networks
export type AptosNetwork = 'mainnet' | 'testnet' | 'devnet';

export interface AptosNetworkConfig {
  name: AptosNetwork;
  rpcUrls: string[]; // ARRAY for failover
  chainId: number;
  faucetUrl?: string;
  explorerUrl: string;
}

/**
 * Parse comma-separated URLs from environment variable
 * CRITICAL: Returns array for failover support
 */
function parseRpcUrls(
  envVar: string | undefined,
  fallback: string[],
): string[] {
  if (!envVar || envVar.trim() === '') return fallback;
  
  const urls = envVar
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  
  // Validate URLs have basic structure
  const validUrls = urls.filter(url => {
    try {
      new URL(url);
      return true;
    } catch {
      console.warn(`Invalid RPC URL ignored: ${url}`);
      return false;
    }
  });
  
  // Fallback if no valid URLs parsed
  return validUrls.length > 0 ? validUrls : fallback;
}

export const APTOS_NETWORKS: Record<AptosNetwork, AptosNetworkConfig> = {
  mainnet: {
    name: 'mainnet',
    rpcUrls: parseRpcUrls(process.env.APTOS_MAINNET_RPC_URLS, [
      'https://fullnode.mainnet.aptoslabs.com/v1', // Official public endpoint
      'https://aptos.blockpi.network/aptos/v1/public/v1',
    ]),
    chainId: 1,
    explorerUrl: 'https://explorer.aptoslabs.com',
  },
  testnet: {
    name: 'testnet',
    rpcUrls: parseRpcUrls(process.env.APTOS_TESTNET_RPC_URLS, [
      'https://fullnode.testnet.aptoslabs.com/v1',
    ]),
    chainId: 2,
    faucetUrl:
      process.env.APTOS_TESTNET_FAUCET_URL ||
      'https://faucet.testnet.aptoslabs.com',
    explorerUrl: 'https://explorer.aptoslabs.com/?network=testnet',
  },
  devnet: {
    name: 'devnet',
    rpcUrls: parseRpcUrls(process.env.APTOS_DEVNET_RPC_URLS, [
      'https://fullnode.devnet.aptoslabs.com/v1',
    ]),
    chainId: 0,
    faucetUrl:
      process.env.APTOS_DEVNET_FAUCET_URL ||
      'https://faucet.devnet.aptoslabs.com',
    explorerUrl: 'https://explorer.aptoslabs.com/?network=devnet',
  },
};

/**
 * Get network configuration safely
 * @throws Error if network is invalid or no RPC URLs configured
 */
export function getNetworkConfig(network: AptosNetwork): AptosNetworkConfig {
  const config = APTOS_NETWORKS[network];
  if (!config) {
    throw new Error(
      `Unknown network: ${network}. Use: mainnet, testnet, or devnet`,
    );
  }
  
  // Validate config has at least one RPC URL
  if (!config.rpcUrls || config.rpcUrls.length === 0) {
    throw new Error(
      `No RPC URLs configured for network: ${network}. Check environment variables.`,
    );
  }
  
  return config;
}

// Log loaded configuration on module import (helps debugging)
if (process.env.NODE_ENV !== 'production') {
  console.log('Loaded Aptos Network Configurations:', {
    mainnet: `${APTOS_NETWORKS.mainnet.rpcUrls.length} RPC(s)`,
    testnet: `${APTOS_NETWORKS.testnet.rpcUrls.length} RPC(s)`,
    devnet: `${APTOS_NETWORKS.devnet.rpcUrls.length} RPC(s)`,
  });
}
