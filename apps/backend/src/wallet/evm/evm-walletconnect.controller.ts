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
import { EvmWalletConnectService } from './services/evm-walletconnect.service.js';
import {
  EvmWalletConnectSignTransactionDto,
  EvmWalletConnectSignMessageDto,
  EvmWalletConnectSignTypedDataDto,
} from './dto/evm-walletconnect.dto.js';

/**
 * EVM WalletConnect Controller
 *
 * Handles WalletConnect/Reown operations for EVM chains
 */
@Controller('wallet/evm/walletconnect')
export class EvmWalletConnectController {
  private readonly logger = new Logger(EvmWalletConnectController.name);

  constructor(private readonly walletConnectService: EvmWalletConnectService) {}

  /**
   * Get formatted EVM accounts for WalletConnect
   * GET /wallet/evm/walletconnect/accounts?userId=xxx&useTestnet=false
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
        `Failed to get EVM WalletConnect accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Sign an EVM transaction for WalletConnect
   * POST /wallet/evm/walletconnect/sign-transaction
   */
  @Post('sign-transaction')
  @HttpCode(HttpStatus.OK)
  async signTransaction(@Body() dto: EvmWalletConnectSignTransactionDto) {
    this.logger.log(
      `Signing EVM WalletConnect transaction for user ${dto.userId}, account ${dto.accountId}`,
    );

    try {
      const result = await this.walletConnectService.signTransaction(
        dto.userId,
        dto.accountId,
        dto.transaction as any, // Cast to any to allow flexibility in transaction format
        dto.useTestnet || false,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to sign EVM WalletConnect transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Sign an EVM message for WalletConnect (personal_sign)
   * POST /wallet/evm/walletconnect/sign-message
   */
  @Post('sign-message')
  @HttpCode(HttpStatus.OK)
  async signMessage(@Body() dto: EvmWalletConnectSignMessageDto) {
    this.logger.log(
      `Signing EVM WalletConnect message for user ${dto.userId}, account ${dto.accountId}`,
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
        `Failed to sign EVM WalletConnect message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Sign EVM typed data for WalletConnect (eth_signTypedData)
   * POST /wallet/evm/walletconnect/sign-typed-data
   */
  @Post('sign-typed-data')
  @HttpCode(HttpStatus.OK)
  async signTypedData(@Body() dto: EvmWalletConnectSignTypedDataDto) {
    this.logger.log(
      `Signing EVM WalletConnect typed data for user ${dto.userId}, account ${dto.accountId}`,
    );

    try {
      const result = await this.walletConnectService.signTypedData(
        dto.userId,
        dto.accountId,
        dto.typedData,
        dto.useTestnet || false,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to sign EVM WalletConnect typed data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
