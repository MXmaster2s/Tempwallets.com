import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { entryPoint08Address } from 'viem/account-abstraction';
import { Erc4337Config } from '../types/chain.types.js';

/**
 * Pimlico configuration service
 * Provides Pimlico-specific configuration for ERC-4337 smart accounts
 * Removes dependency on Tether WDK ERC-4337 configuration
 */
@Injectable()
export class PimlicoConfigService {
  private readonly logger = new Logger(PimlicoConfigService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Get Pimlico API key from environment
   */
  getPimlicoApiKey(): string {
    return this.configService.get<string>('PIMLICO_API_KEY') || '';
  }

  /**
   * Get ERC-4337 configuration for a specific chain
   */
  getErc4337Config(
    chain: 'ethereum' | 'base' | 'arbitrum' | 'polygon' | 'avalanche',
  ): Erc4337Config {
    const apiKey = this.getPimlicoApiKey();

    const configs: Record<string, Erc4337Config> = {
      ethereum: {
        chainId: 1,
        rpcUrl: this.resolveRpcUrl(
          'ETH_RPC_URL',
          'https://eth.llamarpc.com',
          'ethereum',
        ),
        bundlerUrl: apiKey
          ? `https://api.pimlico.io/v2/1/rpc?apikey=${apiKey}`
          : 'https://api.pimlico.io/v2/1/rpc',
        paymasterUrl: apiKey
          ? `https://api.pimlico.io/v2/1/rpc?apikey=${apiKey}`
          : undefined,
        entryPointAddress: entryPoint08Address, // v0.8 for EIP-7702
        factoryAddress: '0x0000000000FFe8B47B3e2130213B802212439497', // Pimlico Safe factory
      },
      base: {
        chainId: 8453,
        rpcUrl: this.resolveRpcUrl(
          'BASE_RPC_URL',
          'https://mainnet.base.org',
          'base',
        ),
        bundlerUrl: apiKey
          ? `https://api.pimlico.io/v2/8453/rpc?apikey=${apiKey}`
          : 'https://api.pimlico.io/v2/8453/rpc',
        paymasterUrl: apiKey
          ? `https://api.pimlico.io/v2/8453/rpc?apikey=${apiKey}`
          : undefined,
        entryPointAddress: entryPoint08Address,
        factoryAddress: '0x0000000000FFe8B47B3e2130213B802212439497',
      },
      arbitrum: {
        chainId: 42161,
        rpcUrl: this.resolveRpcUrl(
          'ARB_RPC_URL',
          'https://arb1.arbitrum.io/rpc',
          'arbitrum',
        ),
        bundlerUrl: apiKey
          ? `https://api.pimlico.io/v2/42161/rpc?apikey=${apiKey}`
          : 'https://api.pimlico.io/v2/42161/rpc',
        paymasterUrl: apiKey
          ? `https://api.pimlico.io/v2/42161/rpc?apikey=${apiKey}`
          : undefined,
        entryPointAddress: entryPoint08Address,
        factoryAddress: '0x0000000000FFe8B47B3e2130213B802212439497',
      },
      polygon: {
        chainId: 137,
        rpcUrl: this.resolveRpcUrl(
          'POLYGON_RPC_URL',
          'https://polygon-rpc.com',
          'polygon',
        ),
        bundlerUrl: apiKey
          ? `https://api.pimlico.io/v2/137/rpc?apikey=${apiKey}`
          : 'https://api.pimlico.io/v2/137/rpc',
        paymasterUrl: apiKey
          ? `https://api.pimlico.io/v2/137/rpc?apikey=${apiKey}`
          : undefined,
        entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        factoryAddress: '0x0000000000FFe8B47B3e2130213B802212439497',
      },
      avalanche: {
        chainId: 43114,
        rpcUrl: this.resolveRpcUrl(
          'AVAX_RPC_URL',
          'https://api.avax.network/ext/bc/C/rpc',
          'avalanche',
        ),
        bundlerUrl: apiKey
          ? `https://api.pimlico.io/v2/43114/rpc?apikey=${apiKey}`
          : 'https://api.pimlico.io/v2/43114/rpc',
        paymasterUrl: apiKey
          ? `https://api.pimlico.io/v2/43114/rpc?apikey=${apiKey}`
          : undefined,
        entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        factoryAddress: '0x0000000000FFe8B47B3e2130213B802212439497',
      },
    };

    const config = configs[chain];
    if (!config) {
      throw new Error(`Unsupported ERC-4337 chain: ${chain}`);
    }
    return config;
  }

  /**
   * Get all ERC-4337 configurations
   */
  getAllErc4337Configs(): Record<string, Erc4337Config> {
    return {
      ethereum: this.getErc4337Config('ethereum'),
      base: this.getErc4337Config('base'),
      arbitrum: this.getErc4337Config('arbitrum'),
      polygon: this.getErc4337Config('polygon'),
      avalanche: this.getErc4337Config('avalanche'),
    };
  }

  /**
   * Check if Pimlico API key is configured
   */
  hasPimlicoApiKey(): boolean {
    const apiKey = this.getPimlicoApiKey();
    return apiKey.length > 0;
  }

  /**
   * EIP-7702 enablement guard per chain name (AllChainTypes string)
   */
  isEip7702Enabled(chain: string): boolean {
    const enabled = this.configService.get<string>('ENABLE_EIP7702') === 'true';
    if (!enabled) return false;
    const supportedChains =
      this.configService.get<string>('EIP7702_CHAINS')?.split(',') || [];
    return supportedChains.includes(chain);
  }

  getEip7702DelegationAddress(): string {
    return (
      this.configService.get<string>('EIP7702_DELEGATION_ADDRESS') ||
      '0xe6Cae83BdE06E4c305530e199D7217f42808555B'
    );
  }

  getEip7702Config(
    chain:
      | 'ethereum'
      | 'base'
      | 'arbitrum'
      | 'optimism'
      | 'polygon'
      | 'bnb'
      | 'avalanche',
  ) {
    const chainIds: Record<string, number> = {
      ethereum: 1,
      base: 8453,
      arbitrum: 42161,
      optimism: 10,
      polygon: 137,
      bnb: 56,
      avalanche: 43114,
    };

    const chainId = chainIds[chain];
    if (!chainId) {
      throw new Error(`Unsupported EIP-7702 chain: ${chain}`);
    }

    const apiKey = this.getPimlicoApiKey();
    const bundlerBase = `https://api.pimlico.io/v2/${chainId}/rpc`;

    // ✅ FIX: Always provide paymaster URL for sponsored transactions
    // If no API key, still provide URL (may work for some networks)
    const paymasterUrl = apiKey
      ? `${bundlerBase}?apikey=${apiKey}`
      : bundlerBase;

    this.logger.log(`[Pimlico Config] EIP-7702 config for ${chain}:`, {
      chainId,
      bundlerUrl: apiKey ? `${bundlerBase}?apikey=${apiKey}` : bundlerBase,
      paymasterUrl,
      delegationAddress: this.getEip7702DelegationAddress(),
      hasApiKey: !!apiKey,
    });

    return {
      chainId,
      bundlerUrl: apiKey ? `${bundlerBase}?apikey=${apiKey}` : bundlerBase,
      paymasterUrl, // ✅ Always provide paymaster URL for sponsorship
      delegationAddress: this.getEip7702DelegationAddress(),
      // Use entry point 0.8 for EIP-7702 (required by to7702SimpleSmartAccount)
      // Paymaster works via direct pimlico client integration
      entryPointAddress: entryPoint08Address, // Entry Point v0.8
    };
  }

  /**
   * Validate EIP-7702 support for a specific chain
   * Checks if delegation contract exists and bundler is accessible
   */
  async validateEip7702Support(
    chain:
      | 'ethereum'
      | 'base'
      | 'arbitrum'
      | 'optimism'
      | 'polygon'
      | 'bnb'
      | 'avalanche',
  ): Promise<{
    supported: boolean;
    errors: string[];
    config?: ReturnType<PimlicoConfigService['getEip7702Config']>;
  }> {
    const errors: string[] = [];

    try {
      const config = this.getEip7702Config(chain);

      // Check if API key is configured (recommended but not always required)
      if (!this.hasPimlicoApiKey()) {
        errors.push(
          'PIMLICO_API_KEY not configured. Sponsored transactions may not work.',
        );
      }

      // Note: We can't check delegation contract or bundler here without
      // creating clients, which would require chain config. This validation
      // is done in the factory's createAccount method instead.

      return {
        supported: errors.length === 0,
        errors,
        config,
      };
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Unknown validation error',
      );
      return {
        supported: false,
        errors,
      };
    }
  }

  /**
   * Ensure RPC URL points to a standard node (not Pimlico bundler)
   */
  private resolveRpcUrl(
    envKey: string,
    fallback: string,
    chainLabel: string,
  ): string {
    const raw = (this.configService.get<string>(envKey) || '').trim();
    if (!raw) {
      return fallback;
    }

    if (raw.toLowerCase().includes('api.pimlico.io')) {
      this.logger.warn(
        `Detected ${envKey} pointing to Pimlico bundler for ${chainLabel}. Falling back to ${fallback}. ` +
          `Please set ${envKey} to a standard RPC (Infura, Alchemy, Ankr, etc.).`,
      );
      return fallback;
    }

    return raw;
  }
}
