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
import { AptosManager } from './managers/aptos.manager.js';
import { AptosFaucetService } from './services/aptos-faucet.service.js';
import { SendAptDto } from './dto/send-apt.dto.js';
import { GetBalanceDto } from './dto/get-balance.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator.js';
import { UserId } from '../../auth/decorators/user-id.decorator.js';

@Controller('wallet/aptos')
@UseGuards(JwtAuthGuard)
@OptionalAuth()
export class AptosWalletController {
  private readonly logger = new Logger(AptosWalletController.name);

  constructor(
    private readonly aptosManager: AptosManager,
    private readonly faucetService: AptosFaucetService,
  ) {}

  /**
   * Get Aptos address for a user
   * GET /wallet/aptos/address
   */
  @Get('address')
  async getAddress(
    @UserId() userId?: string,
    @Query('userId') queryUserId?: string,
    @Query('network') network?: 'mainnet' | 'testnet' | 'devnet',
    @Query('accountIndex') accountIndex?: string,
  ) {
    const finalUserId = userId || queryUserId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    const networkName = network || 'testnet';
    const index = accountIndex ? parseInt(accountIndex, 10) : 0;

    if (isNaN(index) || index < 0) {
      throw new BadRequestException('accountIndex must be a non-negative integer');
    }

    try {
      const address = await this.aptosManager.getAddress(
        finalUserId,
        index,
        networkName,
      );

      return {
        address,
        network: networkName,
        accountIndex: index,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get Aptos address: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get APT balance for a user
   * GET /wallet/aptos/balance
   */
  @Get('balance')
  async getBalance(
    @UserId() userId?: string,
    @Query('userId') queryUserId?: string,
    @Query('network') network?: 'mainnet' | 'testnet' | 'devnet',
  ) {
    const finalUserId = userId || queryUserId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    const networkName = network || 'testnet';

    try {
      const balance = await this.aptosManager.getBalance(finalUserId, networkName);

      return {
        balance,
        network: networkName,
        currency: 'APT',
      };
    } catch (error) {
      this.logger.error(
        `Failed to get Aptos balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Send APT
   * POST /wallet/aptos/send
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendAPT(
    @Body() dto: SendAptDto,
    @UserId() userId?: string,
  ) {
    const finalUserId = userId || dto.userId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    const network = dto.network || 'testnet';
    // Amount is already a number from DTO validation
    const amount = dto.amount;

    this.logger.log(
      `Sending ${amount} APT from user ${finalUserId} to ${dto.recipientAddress} on ${network}`,
    );

    try {
      const result = await this.aptosManager.sendAPT(
        finalUserId,
        dto.recipientAddress,
        amount,
        network,
      );

      return {
        success: true,
        transactionHash: result.hash,
        sequenceNumber: result.sequenceNumber,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send APT: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Fund account from faucet (testnet/devnet only)
   * POST /wallet/aptos/faucet
   */
  @Post('faucet')
  @HttpCode(HttpStatus.OK)
  async fundFromFaucet(
    @Body()
    body: {
      userId: string;
      network: 'testnet' | 'devnet';
      amount?: number;
    },
    @UserId() userId?: string,
  ) {
    const finalUserId = userId || body.userId;
    if (!finalUserId) {
      throw new BadRequestException('userId is required');
    }

    if (!body.network || !['testnet', 'devnet'].includes(body.network)) {
      throw new BadRequestException(
        'network must be "testnet" or "devnet" (faucet not available for mainnet)',
      );
    }

    if (!this.faucetService.isFaucetAvailable(body.network)) {
      throw new BadRequestException(
        `Faucet is not available for ${body.network}`,
      );
    }

    try {
      const address = await this.aptosManager.getAddress(
        finalUserId,
        0,
        body.network,
      );

      const result = await this.faucetService.fundAccount(
        address,
        body.network,
        body.amount,
      );

      if (!result.success) {
        throw new BadRequestException(result.message);
      }

      return {
        success: true,
        message: result.message,
        transactionHash: result.hash,
        address,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fund account from faucet: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}

