import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Address, Hex } from 'viem';
import {
  getChainConfig,
  getPimlicoBundlerUrl,
} from '../config/eip7702-chain.config.js';
import {
  UserOperation,
  PaymasterSponsorshipResult,
} from '../types/user-operation.types.js';

/**
 * Per-user sponsorship tracking
 */
interface UserSponsorshipStats {
  dailySpent: bigint;
  monthlySpent: bigint;
  lastReset: Date;
  lastMonthReset: Date;
  transactionCount: number;
}

/**
 * Circuit breaker state for paymaster
 */
interface PaymasterCircuitState {
  consecutiveFailures: number;
  lastFailure: number;
  isOpen: boolean;
  lastSuccessfulSponsorship: number;
}

/**
 * Paymaster Service
 *
 * Handles gas sponsorship for UserOperations via Pimlico's verifying paymaster.
 *
 * SECURITY FEATURES:
 * - Per-user daily/monthly sponsorship limits to prevent abuse
 * - Circuit breaker to handle paymaster exhaustion gracefully
 * - Immediate surfacing of sponsorship failures
 * - Transaction count limits per user
 *
 * RELIABILITY:
 * - Circuit breaker pattern for paymaster availability
 * - Clear error messages for debugging
 * - Graceful degradation (user can pay if sponsor fails)
 */
@Injectable()
export class PaymasterService {
  private readonly logger = new Logger(PaymasterService.name);

  // Per-user sponsorship tracking (in-memory, should be moved to Redis/DB for production)
  private readonly userStats: Map<string, UserSponsorshipStats> = new Map();

  // Circuit breaker state per chain
  private readonly circuitState: Map<number, PaymasterCircuitState> = new Map();

  // Sponsorship limits (in wei)
  // SECURITY: These limits prevent a single user from draining paymaster funds
  private readonly DAILY_LIMIT_WEI = BigInt(0.1 * 1e18); // 0.1 ETH per day
  private readonly MONTHLY_LIMIT_WEI = BigInt(1 * 1e18); // 1 ETH per month
  private readonly MAX_DAILY_TRANSACTIONS = 50;

  // Circuit breaker settings
  private readonly FAILURE_THRESHOLD = 5;
  private readonly CIRCUIT_RESET_TIME = 60_000; // 1 minute

  // Request settings
  private readonly REQUEST_TIMEOUT = 15_000; // 15 seconds

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get Pimlico API key
   */
  private getPimlicoApiKey(): string {
    const apiKey = this.configService.get<string>('PIMLICO_API_KEY');
    if (!apiKey) {
      throw new Error('PIMLICO_API_KEY not configured');
    }
    return apiKey;
  }

  /**
   * Check if paymaster is available for chain
   *
   * @param chainId - Chain ID
   * @returns true if paymaster is available and circuit is not open
   */
  isPaymasterAvailable(chainId: number): boolean {
    // Check if chain is supported
    try {
      getChainConfig(chainId);
    } catch {
      return false;
    }

    // Check if API key is configured
    const apiKey = this.configService.get<string>('PIMLICO_API_KEY');
    if (!apiKey) {
      return false;
    }

    // Check circuit breaker
    const circuit = this.circuitState.get(chainId);
    if (circuit?.isOpen) {
      // Check if circuit should be reset
      if (Date.now() - circuit.lastFailure > this.CIRCUIT_RESET_TIME) {
        circuit.isOpen = false;
        circuit.consecutiveFailures = 0;
        this.logger.log(`Paymaster circuit reset for chain ${chainId}`);
      } else {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if user is within sponsorship limits
   *
   * SECURITY: Prevents abuse by limiting per-user sponsorship
   *
   * @param userId - User ID
   * @param estimatedCost - Estimated gas cost in wei
   * @returns true if within limits
   */
  isWithinLimits(userId: string, estimatedCost: bigint): boolean {
    const stats = this.getOrCreateUserStats(userId);

    // Check daily transaction count
    if (stats.transactionCount >= this.MAX_DAILY_TRANSACTIONS) {
      this.logger.warn(
        `User ${userId} exceeded daily transaction limit (${this.MAX_DAILY_TRANSACTIONS})`,
      );
      return false;
    }

    // Check daily spending limit
    if (stats.dailySpent + estimatedCost > this.DAILY_LIMIT_WEI) {
      this.logger.warn(`User ${userId} would exceed daily spending limit`);
      return false;
    }

    // Check monthly spending limit
    if (stats.monthlySpent + estimatedCost > this.MONTHLY_LIMIT_WEI) {
      this.logger.warn(`User ${userId} would exceed monthly spending limit`);
      return false;
    }

    return true;
  }

  /**
   * Get or create user sponsorship stats
   */
  private getOrCreateUserStats(userId: string): UserSponsorshipStats {
    let stats = this.userStats.get(userId);

    if (!stats) {
      stats = {
        dailySpent: 0n,
        monthlySpent: 0n,
        lastReset: new Date(),
        lastMonthReset: new Date(),
        transactionCount: 0,
      };
      this.userStats.set(userId, stats);
    }

    // Check if daily reset is needed
    const now = new Date();
    const daysSinceReset = Math.floor(
      (now.getTime() - stats.lastReset.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (daysSinceReset >= 1) {
      stats.dailySpent = 0n;
      stats.transactionCount = 0;
      stats.lastReset = now;
    }

    // Check if monthly reset is needed
    const monthsSinceReset =
      (now.getFullYear() - stats.lastMonthReset.getFullYear()) * 12 +
      (now.getMonth() - stats.lastMonthReset.getMonth());
    if (monthsSinceReset >= 1) {
      stats.monthlySpent = 0n;
      stats.lastMonthReset = now;
    }

    return stats;
  }

  /**
   * Record sponsored transaction
   *
   * @param userId - User ID
   * @param actualCost - Actual gas cost in wei
   */
  recordSponsorship(userId: string, actualCost: bigint): void {
    const stats = this.getOrCreateUserStats(userId);
    stats.dailySpent += actualCost;
    stats.monthlySpent += actualCost;
    stats.transactionCount++;

    this.logger.debug(
      `Recorded sponsorship for ${userId}: ${actualCost} wei (daily: ${stats.dailySpent}, monthly: ${stats.monthlySpent})`,
    );
  }

  /**
   * Get sponsorship for UserOperation
   *
   * SECURITY: Validates limits before requesting sponsorship
   *
   * @param chainId - Chain ID
   * @param userOp - Partial UserOperation
   * @param userId - User ID for limit tracking
   * @returns Paymaster data or null if not available
   */
  async sponsorUserOperation(
    chainId: number,
    userOp: Partial<UserOperation>,
    userId: string,
  ): Promise<PaymasterSponsorshipResult | null> {
    // Check if paymaster is available
    if (!this.isPaymasterAvailable(chainId)) {
      this.logger.debug(`Paymaster not available for chain ${chainId}`);
      return null;
    }

    // Estimate cost for limit check (rough estimate)
    const estimatedGas =
      (userOp.callGasLimit || 100_000n) +
      (userOp.verificationGasLimit || 100_000n) +
      (userOp.preVerificationGas || 50_000n);
    const estimatedCost = estimatedGas * (userOp.maxFeePerGas || 50_000_000_000n);

    // Check user limits
    if (!this.isWithinLimits(userId, estimatedCost)) {
      this.logger.warn(
        `Sponsorship denied for ${userId}: limit exceeded`,
      );
      return null;
    }

    try {
      const apiKey = this.getPimlicoApiKey();
      const paymasterUrl = getPimlicoBundlerUrl(chainId, apiKey);
      const config = getChainConfig(chainId);

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.REQUEST_TIMEOUT,
      );

      const response = await fetch(paymasterUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'pm_sponsorUserOperation',
          params: [
            this.formatUserOpForPaymaster(userOp),
            config.entryPointAddress,
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = (await response.json()) as {
        result?: {
          paymaster: Address;
          paymasterData: Hex;
          paymasterVerificationGasLimit: string;
          paymasterPostOpGasLimit: string;
        };
        error?: { code: number; message: string };
      };

      if (data.error) {
        this.handlePaymasterError(chainId, data.error.message);
        return null;
      }

      if (!data.result) {
        this.handlePaymasterError(chainId, 'Empty response from paymaster');
        return null;
      }

      // Record success
      this.recordPaymasterSuccess(chainId);

      this.logger.log(`Gas sponsorship approved for chain ${chainId}`);

      return {
        paymaster: data.result.paymaster,
        paymasterData: data.result.paymasterData,
        paymasterVerificationGasLimit: BigInt(
          data.result.paymasterVerificationGasLimit,
        ),
        paymasterPostOpGasLimit: BigInt(data.result.paymasterPostOpGasLimit),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.handlePaymasterError(chainId, message);
      return null;
    }
  }

  /**
   * Handle paymaster error - update circuit breaker
   */
  private handlePaymasterError(chainId: number, message: string): void {
    this.logger.error(`Paymaster error on chain ${chainId}: ${message}`);

    let circuit = this.circuitState.get(chainId);
    if (!circuit) {
      circuit = {
        consecutiveFailures: 0,
        lastFailure: 0,
        isOpen: false,
        lastSuccessfulSponsorship: Date.now(),
      };
      this.circuitState.set(chainId, circuit);
    }

    circuit.consecutiveFailures++;
    circuit.lastFailure = Date.now();

    if (circuit.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      circuit.isOpen = true;
      this.logger.error(
        `Paymaster circuit OPENED for chain ${chainId} after ${this.FAILURE_THRESHOLD} failures`,
      );
    }
  }

  /**
   * Record paymaster success - reset circuit breaker
   */
  private recordPaymasterSuccess(chainId: number): void {
    const circuit = this.circuitState.get(chainId);
    if (circuit) {
      circuit.consecutiveFailures = 0;
      circuit.isOpen = false;
      circuit.lastSuccessfulSponsorship = Date.now();
    }
  }

  /**
   * Format UserOperation for paymaster request
   */
  private formatUserOpForPaymaster(
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
      signature:
        userOp.signature ||
        '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c',
    };
  }

  /**
   * Get user's remaining sponsorship allowance
   *
   * @param userId - User ID
   * @returns Remaining daily and monthly allowance in wei
   */
  getRemainingAllowance(userId: string): {
    dailyRemaining: bigint;
    monthlyRemaining: bigint;
    transactionsRemaining: number;
  } {
    const stats = this.getOrCreateUserStats(userId);

    return {
      dailyRemaining:
        this.DAILY_LIMIT_WEI > stats.dailySpent
          ? this.DAILY_LIMIT_WEI - stats.dailySpent
          : 0n,
      monthlyRemaining:
        this.MONTHLY_LIMIT_WEI > stats.monthlySpent
          ? this.MONTHLY_LIMIT_WEI - stats.monthlySpent
          : 0n,
      transactionsRemaining: Math.max(
        0,
        this.MAX_DAILY_TRANSACTIONS - stats.transactionCount,
      ),
    };
  }

  /**
   * Get paymaster health status for monitoring
   */
  getHealthStatus(): {
    circuitStates: Record<number, { isOpen: boolean; failures: number }>;
    totalUsers: number;
  } {
    const circuitStates: Record<number, { isOpen: boolean; failures: number }> =
      {};

    for (const [chainId, state] of this.circuitState.entries()) {
      circuitStates[chainId] = {
        isOpen: state.isOpen,
        failures: state.consecutiveFailures,
      };
    }

    return {
      circuitStates,
      totalUsers: this.userStats.size,
    };
  }
}

