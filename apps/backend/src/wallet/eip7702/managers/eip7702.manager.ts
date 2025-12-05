import { Injectable, Logger } from '@nestjs/common';
import { Address, Hex, parseEther, parseUnits } from 'viem';
import { SeedManager } from '../../managers/seed.manager.js';
import { SmartAccountFactory } from '../factories/smart-account.factory.js';
import { DelegationManager } from './delegation.manager.js';
import { NonceManager } from './nonce.manager.js';
import { UserOperationService } from '../services/user-operation.service.js';
import { BundlerService } from '../services/bundler.service.js';
import { PaymasterService } from '../services/paymaster.service.js';
import { Eip7702RpcService } from '../services/eip7702-rpc.service.js';
import {
  getChainConfig,
  isGaslessSupported,
  getSupportedChainIds,
  getExplorerTxUrl,
  Eip7702ChainConfig,
} from '../config/eip7702-chain.config.js';
import { DelegationStatus } from '../types/delegation.types.js';
import {
  UserOperationReceipt,
  UserOpCall,
} from '../types/user-operation.types.js';

/**
 * Send gasless transfer result
 */
export interface GaslessTransferResult {
  /** UserOperation hash */
  userOpHash: Hex;
  /** Transaction hash (available after confirmation) */
  transactionHash?: Hex;
  /** Whether this was the first transaction (included authorization) */
  isFirstTransaction: boolean;
  /** Block explorer URL */
  explorerUrl?: string;
}

/**
 * EIP-7702 Manager
 *
 * Main facade for all EIP-7702 gasless wallet operations.
 *
 * INTEGRATES WITH:
 * - SeedManager for secure seed phrase retrieval (same as Aptos/Substrate)
 * - SmartAccountFactory for account derivation
 * - DelegationManager for EIP-7702 authorization tracking
 * - NonceManager for nonce collision prevention
 * - BundlerService for UserOp submission
 * - PaymasterService for gas sponsorship
 *
 * SECURITY:
 * - Private keys derived on-demand, never stored
 * - Chain-bound authorizations
 * - Per-user sponsorship limits
 * - Nonce locking to prevent collisions
 */
@Injectable()
export class Eip7702Manager {
  private readonly logger = new Logger(Eip7702Manager.name);

  constructor(
    private readonly seedManager: SeedManager,
    private readonly smartAccountFactory: SmartAccountFactory,
    private readonly delegationManager: DelegationManager,
    private readonly nonceManager: NonceManager,
    private readonly userOpService: UserOperationService,
    private readonly bundlerService: BundlerService,
    private readonly paymasterService: PaymasterService,
    private readonly rpcService: Eip7702RpcService,
  ) {}

  /**
   * Get EOA address for user
   *
   * Uses SAME seed phrase as Aptos/Substrate wallets
   * Standard EVM derivation: m/44'/60'/0'/0/{index}
   *
   * @param userId - User ID
   * @param accountIndex - Account index (default: 0)
   * @returns EOA address
   */
  async getAddress(userId: string, accountIndex: number = 0): Promise<Address> {
    const seedPhrase = await this.seedManager.getSeed(userId);
    return this.smartAccountFactory.getAddress(seedPhrase, accountIndex);
  }

  /**
   * Check if gasless transactions are supported on a chain
   *
   * @param chainId - Chain ID
   * @returns true if supported
   */
  isGaslessSupported(chainId: number): boolean {
    return isGaslessSupported(chainId);
  }

  /**
   * Get delegation status for user on a specific chain
   *
   * @param userId - User ID
   * @param chainId - Chain ID
   * @returns Delegation status
   */
  async getDelegationStatus(
    userId: string,
    chainId: number,
  ): Promise<DelegationStatus> {
    const address = await this.getAddress(userId);
    return this.delegationManager.getDelegationStatus(userId, address, chainId);
  }

  /**
   * Get all supported chains
   *
   * @returns List of supported chains with metadata
   */
  getSupportedChains(): Array<{
    chainId: number;
    name: string;
    supportsEip7702: boolean;
    isTestnet: boolean;
  }> {
    const chainIds = getSupportedChainIds();
    return chainIds.map((chainId) => {
      const config = getChainConfig(chainId);
      return {
        chainId: config.chainId,
        name: config.name,
        supportsEip7702: config.supportsEip7702,
        isTestnet: config.isTestnet,
      };
    });
  }

  /**
   * Send gasless native token transfer
   *
   * @param params - Transfer parameters
   * @returns Transfer result
   */
  async sendGaslessTransfer(params: {
    userId: string;
    chainId: number;
    to: Address;
    amount: string; // Human-readable (e.g., "0.1")
  }): Promise<GaslessTransferResult> {
    const { userId, chainId, to, amount } = params;

    // Validate chain support
    if (!this.isGaslessSupported(chainId)) {
      throw new Error(`Chain ${chainId} does not support gasless transactions`);
    }

    const config = getChainConfig(chainId);

    // Get seed and create account with private key
    const seedPhrase = await this.seedManager.getSeed(userId);
    const accountData = await this.smartAccountFactory.createWithKey(
      seedPhrase,
      chainId,
    );

    const { address, privateKey } = accountData;

    try {
      // Check if this is first transaction (needs authorization)
      const needsAuth = await this.delegationManager.needsAuthorization(
        userId,
        address,
        chainId,
      );

      // Build call
      const amountWei = parseEther(amount);
      const call = this.userOpService.buildNativeTransferCall(to, amountWei);

      // Execute with nonce locking
      const result = await this.nonceManager.withLock(
        address,
        chainId,
        config.entryPointAddress,
        async (nonce) => {
          // Build UserOperation
          const userOp = await this.userOpService.buildUserOperation(
            {
              chainId,
              sender: address,
              calls: [call],
              sponsored: true, // Request gas sponsorship
            },
            privateKey,
            userId,
          );

          // Set nonce
          userOp.nonce = nonce;

          // Sign authorization if needed
          let authorization;
          if (needsAuth) {
            authorization = await this.delegationManager.signAuthorization(
              privateKey,
              chainId,
              address,
            );
          }

          // Sign UserOperation
          const signedUserOp = await this.userOpService.signUserOperation(
            userOp,
            privateKey,
            chainId,
          );

          // Submit to bundler
          const userOpHash = await this.bundlerService.sendUserOperation(
            chainId,
            signedUserOp,
            authorization,
          );

          return { userOpHash, isFirstTransaction: needsAuth };
        },
      );

      // Mark delegation as used after successful submission
      if (result.isFirstTransaction) {
        await this.delegationManager.markDelegationUsed(userId, address, chainId);
      }

      this.logger.log(
        `Gasless transfer submitted: ${result.userOpHash} on chain ${chainId}`,
      );

      return {
        userOpHash: result.userOpHash,
        isFirstTransaction: result.isFirstTransaction,
      };
    } finally {
      // SECURITY: Clear private key from memory
      // Note: In JS, we can't truly zero memory, but we can dereference
      // The variable will be garbage collected
    }
  }

  /**
   * Send gasless ERC-20 token transfer
   *
   * @param params - Transfer parameters
   * @returns Transfer result
   */
  async sendGaslessTokenTransfer(params: {
    userId: string;
    chainId: number;
    tokenAddress: Address;
    tokenDecimals: number;
    to: Address;
    amount: string; // Human-readable
  }): Promise<GaslessTransferResult> {
    const { userId, chainId, tokenAddress, tokenDecimals, to, amount } = params;

    // Validate chain support
    if (!this.isGaslessSupported(chainId)) {
      throw new Error(`Chain ${chainId} does not support gasless transactions`);
    }

    const config = getChainConfig(chainId);

    // Get seed and create account with private key
    const seedPhrase = await this.seedManager.getSeed(userId);
    const accountData = await this.smartAccountFactory.createWithKey(
      seedPhrase,
      chainId,
    );

    const { address, privateKey } = accountData;

    try {
      // Check if this is first transaction
      const needsAuth = await this.delegationManager.needsAuthorization(
        userId,
        address,
        chainId,
      );

      // Build call
      const amountUnits = parseUnits(amount, tokenDecimals);
      const call = this.userOpService.buildErc20TransferCall(
        tokenAddress,
        to,
        amountUnits,
      );

      // Execute with nonce locking
      const result = await this.nonceManager.withLock(
        address,
        chainId,
        config.entryPointAddress,
        async (nonce) => {
          // Build UserOperation
          const userOp = await this.userOpService.buildUserOperation(
            {
              chainId,
              sender: address,
              calls: [call],
              sponsored: true,
            },
            privateKey,
            userId,
          );

          // Set nonce
          userOp.nonce = nonce;

          // Sign authorization if needed
          let authorization;
          if (needsAuth) {
            authorization = await this.delegationManager.signAuthorization(
              privateKey,
              chainId,
              address,
            );
          }

          // Sign UserOperation
          const signedUserOp = await this.userOpService.signUserOperation(
            userOp,
            privateKey,
            chainId,
          );

          // Submit to bundler
          const userOpHash = await this.bundlerService.sendUserOperation(
            chainId,
            signedUserOp,
            authorization,
          );

          return { userOpHash, isFirstTransaction: needsAuth };
        },
      );

      // Mark delegation as used
      if (result.isFirstTransaction) {
        await this.delegationManager.markDelegationUsed(userId, address, chainId);
      }

      this.logger.log(
        `Gasless token transfer submitted: ${result.userOpHash} on chain ${chainId}`,
      );

      return {
        userOpHash: result.userOpHash,
        isFirstTransaction: result.isFirstTransaction,
      };
    } finally {
      // Private key goes out of scope
    }
  }

  /**
   * Send batch of gasless transactions
   *
   * SECURITY: Useful for atomic approve+transfer to prevent race conditions
   *
   * @param params - Batch parameters
   * @returns Batch result
   */
  async sendGaslessBatch(params: {
    userId: string;
    chainId: number;
    calls: Array<{
      to: Address;
      value?: string; // ETH amount in human-readable
      data?: Hex;
    }>;
  }): Promise<GaslessTransferResult> {
    const { userId, chainId, calls } = params;

    if (!calls || calls.length === 0) {
      throw new Error('At least one call is required');
    }

    if (!this.isGaslessSupported(chainId)) {
      throw new Error(`Chain ${chainId} does not support gasless transactions`);
    }

    const config = getChainConfig(chainId);

    // Get seed and create account with private key
    const seedPhrase = await this.seedManager.getSeed(userId);
    const accountData = await this.smartAccountFactory.createWithKey(
      seedPhrase,
      chainId,
    );

    const { address, privateKey } = accountData;

    try {
      const needsAuth = await this.delegationManager.needsAuthorization(
        userId,
        address,
        chainId,
      );

      // Convert calls to UserOpCall format
      const userOpCalls: UserOpCall[] = calls.map((c) => ({
        to: c.to,
        value: c.value ? parseEther(c.value) : 0n,
        data: c.data || '0x',
      }));

      // Execute with nonce locking
      const result = await this.nonceManager.withLock(
        address,
        chainId,
        config.entryPointAddress,
        async (nonce) => {
          const userOp = await this.userOpService.buildUserOperation(
            {
              chainId,
              sender: address,
              calls: userOpCalls,
              sponsored: true,
            },
            privateKey,
            userId,
          );

          userOp.nonce = nonce;

          let authorization;
          if (needsAuth) {
            authorization = await this.delegationManager.signAuthorization(
              privateKey,
              chainId,
              address,
            );
          }

          const signedUserOp = await this.userOpService.signUserOperation(
            userOp,
            privateKey,
            chainId,
          );

          const userOpHash = await this.bundlerService.sendUserOperation(
            chainId,
            signedUserOp,
            authorization,
          );

          return { userOpHash, isFirstTransaction: needsAuth };
        },
      );

      if (result.isFirstTransaction) {
        await this.delegationManager.markDelegationUsed(userId, address, chainId);
      }

      this.logger.log(
        `Gasless batch submitted: ${result.userOpHash} (${calls.length} calls) on chain ${chainId}`,
      );

      return {
        userOpHash: result.userOpHash,
        isFirstTransaction: result.isFirstTransaction,
      };
    } finally {
      // Private key cleanup
    }
  }

  /**
   * Wait for UserOperation confirmation
   *
   * @param chainId - Chain ID
   * @param userOpHash - UserOperation hash
   * @param timeoutMs - Timeout in milliseconds
   * @returns UserOperation receipt
   */
  async waitForConfirmation(
    chainId: number,
    userOpHash: Hex,
    timeoutMs: number = 60_000,
  ): Promise<UserOperationReceipt> {
    const receipt = await this.bundlerService.waitForUserOperation(
      chainId,
      userOpHash,
      timeoutMs,
    );

    // Mark nonce as confirmed
    // Note: We need the sender address to mark, which we don't have here
    // In a real implementation, we'd track this

    return receipt;
  }

  /**
   * Get UserOperation receipt
   *
   * @param chainId - Chain ID
   * @param userOpHash - UserOperation hash
   * @returns Receipt or null
   */
  async getReceipt(
    chainId: number,
    userOpHash: Hex,
  ): Promise<UserOperationReceipt | null> {
    return this.bundlerService.getUserOperationReceipt(chainId, userOpHash);
  }

  /**
   * Get block explorer URL for transaction
   *
   * @param chainId - Chain ID
   * @param txHash - Transaction hash
   * @returns Explorer URL
   */
  getExplorerUrl(chainId: number, txHash: string): string {
    return getExplorerTxUrl(chainId, txHash);
  }

  /**
   * Get user's remaining sponsorship allowance
   *
   * @param userId - User ID
   * @returns Remaining allowance
   */
  getRemainingAllowance(userId: string): {
    dailyRemaining: bigint;
    monthlyRemaining: bigint;
    transactionsRemaining: number;
  } {
    return this.paymasterService.getRemainingAllowance(userId);
  }

  /**
   * Check if paymaster is available for chain
   *
   * @param chainId - Chain ID
   * @returns true if available
   */
  isPaymasterAvailable(chainId: number): boolean {
    return this.paymasterService.isPaymasterAvailable(chainId);
  }

  /**
   * Get native token balance
   *
   * @param userId - User ID
   * @param chainId - Chain ID
   * @returns Balance in wei
   */
  async getBalance(userId: string, chainId: number): Promise<bigint> {
    const address = await this.getAddress(userId);
    return this.rpcService.getBalance(chainId, address);
  }
}

