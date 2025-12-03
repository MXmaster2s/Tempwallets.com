import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { SubstrateWalletConnectService } from './services/substrate-walletconnect.service.js';
import {
  SubstrateWalletConnectSignTransactionDto,
  SubstrateWalletConnectSignMessageDto,
} from './dto/substrate-walletconnect.dto.js';

/**
 * Substrate WalletConnect Controller
 *
 * Handles WalletConnect/Reown operations for Substrate chains
 */
@Controller('wallet/substrate/walletconnect')
export class SubstrateWalletConnectController {
  private readonly logger = new Logger(SubstrateWalletConnectController.name);

  constructor(
    private readonly walletConnectService: SubstrateWalletConnectService,
  ) {}

  /**
   * Get formatted Substrate accounts for WalletConnect
   * GET /wallet/substrate/walletconnect/accounts?userId=xxx&useTestnet=false
   */
  @Get('accounts')
  async getAccounts(
    @Query('userId') userId: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const useTestnetBool = useTestnet === 'true';

    try {
      const accounts = await this.walletConnectService.getFormattedAccounts(
        userId,
        useTestnetBool,
      );

      return {
        userId,
        useTestnet: useTestnetBool,
        accounts,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get Substrate WalletConnect accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Sign a Substrate transaction for WalletConnect
   * POST /wallet/substrate/walletconnect/sign-transaction
   */
  @Post('sign-transaction')
  @HttpCode(HttpStatus.OK)
  async signTransaction(@Body() dto: SubstrateWalletConnectSignTransactionDto) {
    this.logger.log(
      `Signing Substrate WalletConnect transaction for user ${dto.userId}, account ${dto.accountId}`,
    );

    try {
      const result = await this.walletConnectService.signTransaction(
        dto.userId,
        dto.accountId,
        dto.transactionPayload,
        dto.useTestnet || false,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to sign Substrate WalletConnect transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Sign a Substrate message for WalletConnect
   * POST /wallet/substrate/walletconnect/sign-message
   */
  @Post('sign-message')
  @HttpCode(HttpStatus.OK)
  async signMessage(@Body() dto: SubstrateWalletConnectSignMessageDto) {
    this.logger.log(
      `Signing Substrate WalletConnect message for user ${dto.userId}, account ${dto.accountId}`,
    );

    try {
      const result = await this.walletConnectService.signMessage(
        dto.userId,
        dto.accountId,
        dto.message,
        dto.useTestnet || false,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to sign Substrate WalletConnect message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
