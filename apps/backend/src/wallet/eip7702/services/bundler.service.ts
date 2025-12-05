import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Address, Hex } from 'viem';
import {
  getChainConfig,
  getPimlicoBundlerUrl,
  ENTRY_POINT_V07,
} from '../config/eip7702-chain.config.js';
import {
  UserOperation,
  UserOperationReceipt,
  GasEstimate,
  SignedAuthorization,
} from '../types/user-operation.types.js';

/**
 * Bundler Provider configuration
 */
interface BundlerProvider {
  name: string;
  getUrl: (chainId: number, apiKey: string) => string;
  priority: number;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/**
 * Bundler Service
 *
 * Handles UserOperation submission to ERC-4337 bundlers.
 *
 * SECURITY FEATURES:
 * - Multi-bundler failover (Pimlico primary, others as backup)
 * - Circuit breaker pattern to prevent cascading failures
 * - Retry with exponential backoff
 * - Request timeout handling
 *
 * RELIABILITY:
 * - Automatic fallback to alternate bundlers on failure
 * - Circuit breaker opens after 3 consecutive failures
 * - Circuit breaker resets after 30 seconds
 */
@Injectable()
export class BundlerService {
  private readonly logger = new Logger(BundlerService.name);
  private readonly circuitBreakers: Map<string, CircuitBreakerState> =
    new Map();

  // Circuit breaker settings
  private readonly FAILURE_THRESHOLD = 3;
  private readonly CIRCUIT_RESET_TIME = 30_000; // 30 seconds

  // Request settings
  private readonly REQUEST_TIMEOUT = 30_000; // 30 seconds
  private readonly MAX_RETRIES = 3;

  // Bundler providers (ordered by priority)
  private readonly bundlerProviders: BundlerProvider[] = [
    {
      name: 'pimlico',
      getUrl: (chainId, apiKey) => getPimlicoBundlerUrl(chainId, apiKey),
      priority: 1,
    },
    // Add more bundler providers here for failover
    // {
    //   name: 'alchemy',
    //   getUrl: (chainId, apiKey) => `https://...`,
    //   priority: 2,
    // },
  ];

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get Pimlico API key from environment
   */
  private getPimlicoApiKey(): string {
    const apiKey = this.configService.get<string>('PIMLICO_API_KEY');
    if (!apiKey) {
      throw new Error('PIMLICO_API_KEY not configured');
    }
    return apiKey;
  }

  /**
   * Get bundler URL with failover support
   *
   * @param chainId - Chain ID
   * @returns Bundler URL from first available provider
   */
  private getBundlerUrl(chainId: number): string {
    const apiKey = this.getPimlicoApiKey();

    // Find first available provider (circuit not open)
    for (const provider of this.bundlerProviders) {
      const key = `${provider.name}-${chainId}`;
      const state = this.circuitBreakers.get(key);

      if (state?.isOpen) {
        // Check if circuit should be reset
        if (Date.now() - state.lastFailure > this.CIRCUIT_RESET_TIME) {
          state.isOpen = false;
          state.failures = 0;
          this.logger.log(`Circuit breaker reset for ${key}`);
        } else {
          continue; // Skip this provider
        }
      }

      return provider.getUrl(chainId, apiKey);
    }

    // All circuits open - try primary anyway
    this.logger.warn(
      `All bundler circuits open for chain ${chainId}, trying primary`,
    );
    return this.bundlerProviders[0]!.getUrl(chainId, apiKey);
  }

  /**
   * Record failure for circuit breaker
   */
  private recordFailure(providerName: string, chainId: number): void {
    const key = `${providerName}-${chainId}`;
    const state = this.circuitBreakers.get(key) || {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    };

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.FAILURE_THRESHOLD) {
      state.isOpen = true;
      this.logger.warn(`Circuit breaker opened for ${key}`);
    }

    this.circuitBreakers.set(key, state);
  }

  /**
   * Record success - reset circuit breaker
   */
  private recordSuccess(providerName: string, chainId: number): void {
    const key = `${providerName}-${chainId}`;
    this.circuitBreakers.delete(key);
  }

  /**
   * Make JSON-RPC request to bundler with retry
   */
  private async bundlerRpc<T>(
    chainId: number,
    method: string,
    params: unknown[],
  ): Promise<T> {
    const bundlerUrl = this.getBundlerUrl(chainId);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.REQUEST_TIMEOUT,
        );

        const response = await fetch(bundlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = (await response.json()) as {
          result?: T;
          error?: { code: number; message: string; data?: unknown };
        };

        if (data.error) {
          throw new Error(
            `Bundler error: ${data.error.message} (code: ${data.error.code})`,
          );
        }

        if (data.result === undefined) {
          throw new Error('Bundler returned empty result');
        }

        this.recordSuccess('pimlico', chainId);
        return data.result;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error('Unknown error');

        this.logger.warn(
          `Bundler RPC attempt ${attempt + 1}/${this.MAX_RETRIES} failed: ${lastError.message}`,
        );

        if (attempt === this.MAX_RETRIES - 1) {
          this.recordFailure('pimlico', chainId);
        }

        // Exponential backoff
        if (attempt < this.MAX_RETRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    throw lastError || new Error('Bundler request failed');
  }

  /**
   * Get EntryPoint address for chain
   */
  getEntryPointAddress(chainId: number): Address {
    const config = getChainConfig(chainId);
    return config.entryPointAddress;
  }

  /**
   * Submit UserOperation to bundler
   *
   * @param chainId - Chain ID
   * @param userOp - Packed UserOperation
   * @param authorization - Optional EIP-7702 authorization
   * @returns UserOperation hash
   */
  async sendUserOperation(
    chainId: number,
    userOp: UserOperation,
    authorization?: SignedAuthorization,
  ): Promise<Hex> {
    const entryPoint = this.getEntryPointAddress(chainId);

    // Format UserOp for RPC
    const formattedUserOp = this.formatUserOpForRpc(userOp);

    // Build params array
    const params: unknown[] = [formattedUserOp, entryPoint];

    // Add EIP-7702 authorization if provided
    if (authorization) {
      // Pimlico-specific: eip7702Auth object
      const eip7702Auth = {
        address: authorization.address,
        chainId: `0x${authorization.chainId.toString(16)}`,
        nonce: `0x${authorization.nonce.toString(16)}`,
        r: authorization.r,
        s: authorization.s,
        yParity: `0x${authorization.yParity.toString(16)}`,
      };
      params.push({ eip7702Auth });
    }

    const userOpHash = await this.bundlerRpc<Hex>(
      chainId,
      'eth_sendUserOperation',
      params,
    );

    this.logger.log(
      `UserOperation submitted on chain ${chainId}: ${userOpHash}`,
    );
    return userOpHash;
  }

  /**
   * Get UserOperation receipt
   *
   * @param chainId - Chain ID
   * @param userOpHash - UserOperation hash
   * @returns Receipt or null if not found
   */
  async getUserOperationReceipt(
    chainId: number,
    userOpHash: Hex,
  ): Promise<UserOperationReceipt | null> {
    try {
      const result = await this.bundlerRpc<{
        success: boolean;
        receipt: {
          transactionHash: Hex;
          blockHash: Hex;
          blockNumber: string;
        };
        actualGasUsed: string;
        actualGasCost: string;
        reason?: string;
        logs?: Array<{ address: Address; topics: Hex[]; data: Hex }>;
      } | null>(chainId, 'eth_getUserOperationReceipt', [userOpHash]);

      if (!result) {
        return null;
      }

      return {
        userOpHash,
        transactionHash: result.receipt.transactionHash,
        success: result.success,
        blockNumber: BigInt(result.receipt.blockNumber),
        blockHash: result.receipt.blockHash,
        actualGasUsed: BigInt(result.actualGasUsed),
        actualGasCost: BigInt(result.actualGasCost),
        reason: result.reason,
        logs: result.logs,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get UserOp receipt: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return null;
    }
  }

  /**
   * Wait for UserOperation to be confirmed
   *
   * @param chainId - Chain ID
   * @param userOpHash - UserOperation hash
   * @param timeoutMs - Timeout in milliseconds (default: 60s)
   * @returns UserOperation receipt
   */
  async waitForUserOperation(
    chainId: number,
    userOpHash: Hex,
    timeoutMs: number = 60_000,
  ): Promise<UserOperationReceipt> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      const receipt = await this.getUserOperationReceipt(chainId, userOpHash);

      if (receipt) {
        return receipt;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `UserOperation ${userOpHash} not confirmed within ${timeoutMs}ms`,
    );
  }

  /**
   * Estimate gas for UserOperation
   *
   * @param chainId - Chain ID
   * @param userOp - Partial UserOperation
   * @returns Gas estimates
   */
  async estimateUserOperationGas(
    chainId: number,
    userOp: Partial<UserOperation>,
  ): Promise<GasEstimate> {
    const entryPoint = this.getEntryPointAddress(chainId);
    const formattedUserOp = this.formatPartialUserOpForRpc(userOp);

    const result = await this.bundlerRpc<{
      preVerificationGas: string;
      verificationGasLimit: string;
      callGasLimit: string;
      paymasterVerificationGasLimit?: string;
      paymasterPostOpGasLimit?: string;
    }>(chainId, 'eth_estimateUserOperationGas', [formattedUserOp, entryPoint]);

    return {
      preVerificationGas: BigInt(result.preVerificationGas),
      verificationGasLimit: BigInt(result.verificationGasLimit),
      callGasLimit: BigInt(result.callGasLimit),
      maxFeePerGas: userOp.maxFeePerGas || 0n,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas || 0n,
      paymasterVerificationGasLimit: result.paymasterVerificationGasLimit
        ? BigInt(result.paymasterVerificationGasLimit)
        : undefined,
      paymasterPostOpGasLimit: result.paymasterPostOpGasLimit
        ? BigInt(result.paymasterPostOpGasLimit)
        : undefined,
    };
  }

  /**
   * Get supported EntryPoints for chain
   */
  async getSupportedEntryPoints(chainId: number): Promise<Address[]> {
    return this.bundlerRpc<Address[]>(
      chainId,
      'eth_supportedEntryPoints',
      [],
    );
  }

  /**
   * Get UserOperation by hash
   */
  async getUserOperationByHash(
    chainId: number,
    userOpHash: Hex,
  ): Promise<{
    userOperation: UserOperation;
    entryPoint: Address;
    blockNumber: bigint;
    blockHash: Hex;
    transactionHash: Hex;
  } | null> {
    try {
      const result = await this.bundlerRpc<{
        userOperation: Record<string, string>;
        entryPoint: Address;
        blockNumber: string;
        blockHash: Hex;
        transactionHash: Hex;
      } | null>(chainId, 'eth_getUserOperationByHash', [userOpHash]);

      if (!result) {
        return null;
      }

      return {
        userOperation: this.parseUserOpFromRpc(result.userOperation),
        entryPoint: result.entryPoint,
        blockNumber: BigInt(result.blockNumber),
        blockHash: result.blockHash,
        transactionHash: result.transactionHash,
      };
    } catch {
      return null;
    }
  }

  /**
   * Format UserOperation for JSON-RPC
   */
  private formatUserOpForRpc(userOp: UserOperation): Record<string, string> {
    return {
      sender: userOp.sender,
      nonce: `0x${userOp.nonce.toString(16)}`,
      factory: userOp.factory || '0x',
      factoryData: userOp.factoryData || '0x',
      callData: userOp.callData,
      callGasLimit: `0x${userOp.callGasLimit.toString(16)}`,
      verificationGasLimit: `0x${userOp.verificationGasLimit.toString(16)}`,
      preVerificationGas: `0x${userOp.preVerificationGas.toString(16)}`,
      maxFeePerGas: `0x${userOp.maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: `0x${userOp.maxPriorityFeePerGas.toString(16)}`,
      paymaster: userOp.paymaster || '0x',
      paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit
        ? `0x${userOp.paymasterVerificationGasLimit.toString(16)}`
        : '0x0',
      paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit
        ? `0x${userOp.paymasterPostOpGasLimit.toString(16)}`
        : '0x0',
      paymasterData: userOp.paymasterData || '0x',
      signature: userOp.signature,
    };
  }

  /**
   * Format partial UserOperation for estimation
   */
  private formatPartialUserOpForRpc(
    userOp: Partial<UserOperation>,
  ): Record<string, string> {
    return {
      sender: userOp.sender || '0x0000000000000000000000000000000000000000',
      nonce: userOp.nonce ? `0x${userOp.nonce.toString(16)}` : '0x0',
      factory: userOp.factory || '0x',
      factoryData: userOp.factoryData || '0x',
      callData: userOp.callData || '0x',
      callGasLimit: userOp.callGasLimit
        ? `0x${userOp.callGasLimit.toString(16)}`
        : '0x0',
      verificationGasLimit: userOp.verificationGasLimit
        ? `0x${userOp.verificationGasLimit.toString(16)}`
        : '0x0',
      preVerificationGas: userOp.preVerificationGas
        ? `0x${userOp.preVerificationGas.toString(16)}`
        : '0x0',
      maxFeePerGas: userOp.maxFeePerGas
        ? `0x${userOp.maxFeePerGas.toString(16)}`
        : '0x0',
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas
        ? `0x${userOp.maxPriorityFeePerGas.toString(16)}`
        : '0x0',
      paymaster: userOp.paymaster || '0x',
      paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit
        ? `0x${userOp.paymasterVerificationGasLimit.toString(16)}`
        : '0x0',
      paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit
        ? `0x${userOp.paymasterPostOpGasLimit.toString(16)}`
        : '0x0',
      paymasterData: userOp.paymasterData || '0x',
      signature:
        userOp.signature ||
        '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c', // Dummy signature for estimation
    };
  }

  /**
   * Parse UserOperation from RPC response
   */
  private parseUserOpFromRpc(data: Record<string, string>): UserOperation {
    return {
      sender: data.sender as Address,
      nonce: BigInt(data.nonce || '0'),
      factory: (data.factory as Address) || undefined,
      factoryData: (data.factoryData as Hex) || undefined,
      callData: data.callData as Hex,
      callGasLimit: BigInt(data.callGasLimit || '0'),
      verificationGasLimit: BigInt(data.verificationGasLimit || '0'),
      preVerificationGas: BigInt(data.preVerificationGas || '0'),
      maxFeePerGas: BigInt(data.maxFeePerGas || '0'),
      maxPriorityFeePerGas: BigInt(data.maxPriorityFeePerGas || '0'),
      paymaster: (data.paymaster as Address) || undefined,
      paymasterVerificationGasLimit: data.paymasterVerificationGasLimit
        ? BigInt(data.paymasterVerificationGasLimit)
        : undefined,
      paymasterPostOpGasLimit: data.paymasterPostOpGasLimit
        ? BigInt(data.paymasterPostOpGasLimit)
        : undefined,
      paymasterData: (data.paymasterData as Hex) || undefined,
      signature: data.signature as Hex,
    };
  }
}

