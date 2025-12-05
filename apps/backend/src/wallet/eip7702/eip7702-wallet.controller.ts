import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { Address, Hex } from 'viem';
import { Eip7702Manager } from './managers/eip7702.manager.js';
import {
  SendGaslessDto,
  SendBatchDto,
  GetReceiptDto,
} from './dto/send-gasless.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator.js';
import { UserId } from '../../auth/decorators/user-id.decorator.js';
import { DelegationStatus } from './types/delegation.types.js';

/**
 * EIP-7702 Wallet Controller
 *
 * Exposes endpoints for gasless EVM transactions using EIP-7702 and ERC-4337.
 *
 * SECURITY:
 * - All endpoints require authentication (JWT)
 * - User ID from token is used for all operations
 * - Rate limiting should be applied at gateway level
 */
@Controller('wallet/eip7702')
@UseGuards(JwtAuthGuard)
@OptionalAuth()
export class Eip7702WalletController {
  private readonly logger = new Logger(Eip7702WalletController.name);

  constructor(private readonly eip7702Manager: Eip7702Manager) {}

  /**
   * Get EOA address for a user
   * GET /wallet/eip7702/address
   *
   * @param userId - User ID from JWT or query
   * @param chainId - Optional chain ID (doesn't affect address, but validates chain support)
   * @returns EOA address
   */
  @Get('address')
  async getAddress(
    @UserId() userId?: string,
    @Query('userId') queryUserId?: string,
    @Query('chainId') chainId?: string,
  ) {
    const finalUserId = userId || queryUserId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    // Optionally validate chain ID
    const parsedChainId = chainId ? parseInt(chainId, 10) : undefined;
    if (parsedChainId && !this.eip7702Manager.isGaslessSupported(parsedChainId)) {
      throw new BadRequestException(`Chain ID ${chainId} is not supported`);
    }

    try {
      const address = await this.eip7702Manager.getAddress(finalUserId);

      return {
        address,
        chainId: parsedChainId,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get EIP-7702 address: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Get delegation status for a user on a specific chain
   * GET /wallet/eip7702/delegation-status
   *
   * @param userId - User ID
   * @param chainId - Chain ID
   * @returns Delegation status
   */
  @Get('delegation-status')
  async getDelegationStatus(
    @UserId() userId?: string,
    @Query('userId') queryUserId?: string,
    @Query('chainId') chainId?: string,
  ): Promise<DelegationStatus> {
    const finalUserId = userId || queryUserId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    if (!chainId) {
      throw new BadRequestException('chainId is required');
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId) || parsedChainId < 1) {
      throw new BadRequestException('chainId must be a positive integer');
    }

    if (!this.eip7702Manager.isGaslessSupported(parsedChainId)) {
      throw new BadRequestException(`Chain ID ${chainId} is not supported`);
    }

    try {
      return await this.eip7702Manager.getDelegationStatus(
        finalUserId,
        parsedChainId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to get delegation status: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Get all supported chains for gasless transactions
   * GET /wallet/eip7702/supported-chains
   *
   * @returns List of supported chains
   */
  @Get('supported-chains')
  getSupportedChains(): Array<{
    chainId: number;
    name: string;
    supportsEip7702: boolean;
    isTestnet: boolean;
  }> {
    return this.eip7702Manager.getSupportedChains();
  }

  /**
   * Check if paymaster is available for a chain
   * GET /wallet/eip7702/paymaster-status
   *
   * @param chainId - Chain ID
   * @returns Paymaster availability
   */
  @Get('paymaster-status')
  getPaymasterStatus(@Query('chainId') chainId?: string): {
    chainId: number;
    isAvailable: boolean;
  } {
    if (!chainId) {
      throw new BadRequestException('chainId is required');
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId) || parsedChainId < 1) {
      throw new BadRequestException('chainId must be a positive integer');
    }

    return {
      chainId: parsedChainId,
      isAvailable: this.eip7702Manager.isPaymasterAvailable(parsedChainId),
    };
  }

  /**
   * Get remaining sponsorship allowance for user
   * GET /wallet/eip7702/allowance
   *
   * @param userId - User ID
   * @returns Remaining sponsorship allowance
   */
  @Get('allowance')
  getAllowance(
    @UserId() userId?: string,
    @Query('userId') queryUserId?: string,
  ): {
    dailyRemaining: string;
    monthlyRemaining: string;
    transactionsRemaining: number;
  } {
    const finalUserId = userId || queryUserId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    const allowance = this.eip7702Manager.getRemainingAllowance(finalUserId);

    return {
      dailyRemaining: allowance.dailyRemaining.toString(),
      monthlyRemaining: allowance.monthlyRemaining.toString(),
      transactionsRemaining: allowance.transactionsRemaining,
    };
  }

  /**
   * Send gasless transaction (native or ERC-20)
   * POST /wallet/eip7702/send
   *
   * @param dto - Send parameters
   * @returns Transaction result
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendGasless(@Body() dto: SendGaslessDto, @UserId() userId?: string) {
    const finalUserId = userId || dto.userId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    // Validate chain support
    if (!this.eip7702Manager.isGaslessSupported(dto.chainId)) {
      throw new BadRequestException(
        `Chain ID ${dto.chainId} is not supported for gasless transactions`,
      );
    }

    // If tokenAddress is provided, tokenDecimals is required
    if (dto.tokenAddress && dto.tokenDecimals === undefined) {
      throw new BadRequestException(
        'tokenDecimals is required when tokenAddress is provided',
      );
    }

    this.logger.log(
      `Sending gasless ${dto.tokenAddress ? 'token' : 'native'} transfer on chain ${dto.chainId}`,
    );

    try {
      let result;

      if (dto.tokenAddress) {
        // ERC-20 token transfer
        result = await this.eip7702Manager.sendGaslessTokenTransfer({
          userId: finalUserId,
          chainId: dto.chainId,
          tokenAddress: dto.tokenAddress as Address,
          tokenDecimals: dto.tokenDecimals!,
          to: dto.recipientAddress as Address,
          amount: dto.amount,
        });
      } else {
        // Native token transfer
        result = await this.eip7702Manager.sendGaslessTransfer({
          userId: finalUserId,
          chainId: dto.chainId,
          to: dto.recipientAddress as Address,
          amount: dto.amount,
        });
      }

      // Get explorer URL if we have transaction hash
      let explorerUrl: string | undefined;
      if (result.transactionHash) {
        explorerUrl = this.eip7702Manager.getExplorerUrl(
          dto.chainId,
          result.transactionHash,
        );
      }

      return {
        success: true,
        userOpHash: result.userOpHash,
        transactionHash: result.transactionHash,
        isFirstTransaction: result.isFirstTransaction,
        explorerUrl,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send gasless transaction: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Send batch of gasless transactions
   * POST /wallet/eip7702/send-batch
   *
   * @param dto - Batch parameters
   * @returns Batch result
   */
  @Post('send-batch')
  @HttpCode(HttpStatus.OK)
  async sendBatch(@Body() dto: SendBatchDto, @UserId() userId?: string) {
    const finalUserId = userId || dto.userId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    if (!dto.calls || dto.calls.length === 0) {
      throw new BadRequestException('At least one call is required');
    }

    if (!this.eip7702Manager.isGaslessSupported(dto.chainId)) {
      throw new BadRequestException(
        `Chain ID ${dto.chainId} is not supported for gasless transactions`,
      );
    }

    this.logger.log(
      `Sending gasless batch (${dto.calls.length} calls) on chain ${dto.chainId}`,
    );

    try {
      const result = await this.eip7702Manager.sendGaslessBatch({
        userId: finalUserId,
        chainId: dto.chainId,
        calls: dto.calls.map((c) => ({
          to: c.to as Address,
          value: c.value,
          data: c.data as Hex | undefined,
        })),
      });

      let explorerUrl: string | undefined;
      if (result.transactionHash) {
        explorerUrl = this.eip7702Manager.getExplorerUrl(
          dto.chainId,
          result.transactionHash,
        );
      }

      return {
        success: true,
        userOpHash: result.userOpHash,
        transactionHash: result.transactionHash,
        isFirstTransaction: result.isFirstTransaction,
        explorerUrl,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send gasless batch: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Get UserOperation receipt
   * GET /wallet/eip7702/receipt
   *
   * @param chainId - Chain ID
   * @param userOpHash - UserOperation hash
   * @returns Receipt or null
   */
  @Get('receipt')
  async getReceipt(
    @Query('chainId') chainId?: string,
    @Query('userOpHash') userOpHash?: string,
  ) {
    if (!chainId) {
      throw new BadRequestException('chainId is required');
    }

    if (!userOpHash) {
      throw new BadRequestException('userOpHash is required');
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId) || parsedChainId < 1) {
      throw new BadRequestException('chainId must be a positive integer');
    }

    // Validate userOpHash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(userOpHash)) {
      throw new BadRequestException(
        'userOpHash must be a valid 32-byte hex string',
      );
    }

    try {
      const receipt = await this.eip7702Manager.getReceipt(
        parsedChainId,
        userOpHash as Hex,
      );

      if (!receipt) {
        return {
          found: false,
          message: 'UserOperation not yet confirmed',
        };
      }

      const explorerUrl = this.eip7702Manager.getExplorerUrl(
        parsedChainId,
        receipt.transactionHash,
      );

      return {
        found: true,
        userOpHash: receipt.userOpHash,
        transactionHash: receipt.transactionHash,
        success: receipt.success,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.actualGasUsed.toString(),
        gasCost: receipt.actualGasCost.toString(),
        reason: receipt.reason,
        explorerUrl,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get receipt: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Wait for UserOperation confirmation
   * POST /wallet/eip7702/wait-for-confirmation
   *
   * Note: This is a long-polling endpoint. Consider timeout limits.
   *
   * @param body - Wait parameters
   * @returns Confirmed receipt
   */
  @Post('wait-for-confirmation')
  @HttpCode(HttpStatus.OK)
  async waitForConfirmation(
    @Body()
    body: {
      chainId: number;
      userOpHash: string;
      timeoutMs?: number;
    },
  ) {
    if (!body.chainId) {
      throw new BadRequestException('chainId is required');
    }

    if (!body.userOpHash) {
      throw new BadRequestException('userOpHash is required');
    }

    // Validate userOpHash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(body.userOpHash)) {
      throw new BadRequestException(
        'userOpHash must be a valid 32-byte hex string',
      );
    }

    // Limit timeout to prevent long-running requests
    const timeout = Math.min(body.timeoutMs || 60_000, 120_000);

    try {
      const receipt = await this.eip7702Manager.waitForConfirmation(
        body.chainId,
        body.userOpHash as Hex,
        timeout,
      );

      const explorerUrl = this.eip7702Manager.getExplorerUrl(
        body.chainId,
        receipt.transactionHash,
      );

      return {
        success: true,
        userOpHash: receipt.userOpHash,
        transactionHash: receipt.transactionHash,
        executionSuccess: receipt.success,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.actualGasUsed.toString(),
        gasCost: receipt.actualGasCost.toString(),
        reason: receipt.reason,
        explorerUrl,
      };
    } catch (error) {
      this.logger.error(
        `Failed to wait for confirmation: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  /**
   * Get native token balance
   * GET /wallet/eip7702/balance
   *
   * @param userId - User ID
   * @param chainId - Chain ID
   * @returns Balance in wei
   */
  @Get('balance')
  async getBalance(
    @UserId() userId?: string,
    @Query('userId') queryUserId?: string,
    @Query('chainId') chainId?: string,
  ) {
    const finalUserId = userId || queryUserId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    if (!chainId) {
      throw new BadRequestException('chainId is required');
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId) || parsedChainId < 1) {
      throw new BadRequestException('chainId must be a positive integer');
    }

    if (!this.eip7702Manager.isGaslessSupported(parsedChainId)) {
      throw new BadRequestException(`Chain ID ${chainId} is not supported`);
    }

    try {
      const balance = await this.eip7702Manager.getBalance(
        finalUserId,
        parsedChainId,
      );

      return {
        balance: balance.toString(),
        chainId: parsedChainId,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get balance: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }
}

