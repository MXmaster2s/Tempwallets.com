export type ChainName = 'base' | 'ethereum' | 'polygon' | 'arbitrum' | 'avalanche';

export interface ChainConfig {
  chainId: string;
  name: string;
  bundlerUrl: string;
  paymasterUrl: string;
  paymasterAddress: string;
  entryPointAddress: string;
  rpcUrl: string;
}

