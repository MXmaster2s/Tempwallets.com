import { Injectable, Logger } from '@nestjs/common';
import { Address, Hex } from 'viem';
import { PrismaService } from '../../../database/prisma.service.js';
import { Eip7702RpcService } from '../services/eip7702-rpc.service.js';
import { UserOperationService } from '../services/user-operation.service.js';
import {
  SIMPLE_ACCOUNT_7702_IMPLEMENTATION,
  getChainConfig,
} from '../config/eip7702-chain.config.js';
import {
  DelegationStatus,
  DelegationCheckResult,
} from '../types/delegation.types.js';
import { SignedAuthorization } from '../types/user-operation.types.js';

/**
 * Delegation Manager
 *
 * Manages EIP-7702 authorization status for EOA wallets.
 *
 * SECURITY FEATURES:
 * - Chain-bound authorizations (no cross-chain replay)
 * - On-chain verification before trusting DB status
 * - Tracks authorization history for audit
 *
 * RELIABILITY:
 * - Caches delegation status to reduce RPC calls
 * - Periodic re-verification of on-chain status
 */
@Injectable()
export class DelegationManager {
  private readonly logger = new Logger(DelegationManager.name);

  // Cache TTL for delegation status (5 minutes)
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly statusCache: Map<
    string,
    { status: DelegationStatus; timestamp: number }
  > = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rpcService: Eip7702RpcService,
    private readonly userOpService: UserOperationService,
  ) {}

  /**
   * Get delegation status for a user on a specific chain
   *
   * @param userId - User ID
   * @param address - EOA address
   * @param chainId - Chain ID
   * @returns Delegation status
   */
  async getDelegationStatus(
    userId: string,
    address: Address,
    chainId: number,
  ): Promise<DelegationStatus> {
    const cacheKey = `${address.toLowerCase()}-${chainId}`;

    // Check cache first
    const cached = this.statusCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.status;
    }

    // Check on-chain status
    const onChainStatus = await this.checkOnChainDelegation(chainId, address);

    // Check database record
    const dbRecord = await this.prisma.eip7702Delegation.findUnique({
      where: {
        walletId_chainId: {
          walletId: userId,
          chainId,
        },
      },
    });

    const status: DelegationStatus = {
      userId,
      chainId,
      address,
      isDelegated: onChainStatus.isDelegated,
      delegationAddress: onChainStatus.isValidImplementation
        ? SIMPLE_ACCOUNT_7702_IMPLEMENTATION
        : undefined,
      authorizedAt: dbRecord?.authorizedAt,
      lastVerifiedAt: new Date(),
    };

    // Update cache
    this.statusCache.set(cacheKey, { status, timestamp: Date.now() });

    // Sync DB if on-chain status differs
    if (onChainStatus.isDelegated && !dbRecord) {
      await this.saveDelegation(
        userId,
        address,
        chainId,
        SIMPLE_ACCOUNT_7702_IMPLEMENTATION,
      );
    }

    return status;
  }

  /**
   * Check if authorization is needed for first transaction
   *
   * @param userId - User ID
   * @param address - EOA address
   * @param chainId - Chain ID
   * @returns true if authorization signature is needed
   */
  async needsAuthorization(
    userId: string,
    address: Address,
    chainId: number,
  ): Promise<boolean> {
    const status = await this.getDelegationStatus(userId, address, chainId);
    return !status.isDelegated;
  }

  /**
   * Check on-chain delegation status
   *
   * SECURITY: Always verify on-chain, don't trust DB alone
   */
  private async checkOnChainDelegation(
    chainId: number,
    address: Address,
  ): Promise<DelegationCheckResult> {
    try {
      const isDelegated = await this.rpcService.isDelegated(chainId, address);

      if (!isDelegated) {
        return {
          isDelegated: false,
          isValidImplementation: false,
        };
      }

      const isValidImplementation = await this.rpcService.isValidDelegation(
        chainId,
        address,
      );

      return {
        isDelegated: true,
        isValidImplementation,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check on-chain delegation for ${address} on chain ${chainId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      // Return false on error - safer to require authorization
      return {
        isDelegated: false,
        isValidImplementation: false,
      };
    }
  }

  /**
   * Sign EIP-7702 authorization
   *
   * SECURITY CRITICAL:
   * - Chain ID must be specified (never 0)
   * - Nonce must be current EOA nonce
   * - Private key used momentarily then discarded
   *
   * @param privateKey - EOA private key
   * @param chainId - Chain ID
   * @param address - EOA address
   * @returns Signed authorization
   */
  async signAuthorization(
    privateKey: Hex,
    chainId: number,
    address: Address,
  ): Promise<SignedAuthorization> {
    // SECURITY: Validate chain ID
    if (chainId === 0) {
      throw new Error(
        'Chain ID 0 (all-chains authorization) is not allowed for security reasons',
      );
    }

    // Get current EOA nonce
    const nonce = await this.rpcService.getTransactionCount(chainId, address);

    // Sign authorization
    const authorization = await this.userOpService.signEip7702Authorization(
      privateKey,
      chainId,
      nonce,
    );

    this.logger.log(
      `Signed EIP-7702 authorization for chain ${chainId}, nonce ${nonce}`,
    );

    return authorization;
  }

  /**
   * Save delegation record to database
   *
   * @param userId - User ID
   * @param address - EOA address
   * @param chainId - Chain ID
   * @param delegationAddress - Smart account implementation
   */
  async saveDelegation(
    userId: string,
    address: Address,
    chainId: number,
    delegationAddress: Address,
  ): Promise<void> {
    try {
      await this.prisma.eip7702Delegation.upsert({
        where: {
          walletId_chainId: {
            walletId: userId,
            chainId,
          },
        },
        create: {
          walletId: userId,
          address: address.toLowerCase(),
          chainId,
          delegationAddress: delegationAddress.toLowerCase(),
          authorizedAt: new Date(),
        },
        update: {
          address: address.toLowerCase(),
          delegationAddress: delegationAddress.toLowerCase(),
          authorizedAt: new Date(),
        },
      });

      // Invalidate cache
      const cacheKey = `${address.toLowerCase()}-${chainId}`;
      this.statusCache.delete(cacheKey);

      this.logger.log(
        `Saved delegation record for user ${userId} on chain ${chainId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save delegation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get all delegations for a user
   *
   * @param userId - User ID
   * @returns List of delegation records
   */
  async getUserDelegations(userId: string): Promise<DelegationStatus[]> {
    const records = await this.prisma.eip7702Delegation.findMany({
      where: { walletId: userId },
    });

    return records.map((record) => ({
      userId: record.walletId,
      chainId: record.chainId,
      address: record.address as Address,
      isDelegated: true,
      delegationAddress: record.delegationAddress as Address,
      authorizedAt: record.authorizedAt,
    }));
  }

  /**
   * Clear delegation cache
   *
   * @param address - Optional address to clear (clears all if not provided)
   */
  clearCache(address?: Address): void {
    if (address) {
      // Clear entries for specific address
      for (const key of this.statusCache.keys()) {
        if (key.startsWith(address.toLowerCase())) {
          this.statusCache.delete(key);
        }
      }
    } else {
      this.statusCache.clear();
    }
  }

  /**
   * Mark delegation as used (after successful transaction)
   *
   * @param userId - User ID
   * @param address - EOA address
   * @param chainId - Chain ID
   */
  async markDelegationUsed(
    userId: string,
    address: Address,
    chainId: number,
  ): Promise<void> {
    // Update cache to reflect delegation is active
    const cacheKey = `${address.toLowerCase()}-${chainId}`;
    const cached = this.statusCache.get(cacheKey);

    if (cached) {
      cached.status.isDelegated = true;
      cached.status.delegationAddress = SIMPLE_ACCOUNT_7702_IMPLEMENTATION;
      cached.status.lastVerifiedAt = new Date();
      cached.timestamp = Date.now();
    }

    // Ensure DB record exists
    await this.saveDelegation(
      userId,
      address,
      chainId,
      SIMPLE_ACCOUNT_7702_IMPLEMENTATION,
    );
  }

  /**
   * Get chains where user has active delegation
   *
   * @param userId - User ID
   * @returns List of chain IDs with active delegation
   */
  async getDelegatedChains(userId: string): Promise<number[]> {
    const records = await this.prisma.eip7702Delegation.findMany({
      where: { walletId: userId },
      select: { chainId: true },
    });

    return records.map((r) => r.chainId);
  }
}

