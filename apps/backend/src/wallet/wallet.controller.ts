import { Controller, Post, Get, Query, Body, Logger } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { CreateOrImportSeedDto } from './dto/wallet.dto.js';

@Controller('wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  @Post('seed')
  async createOrImportSeed(@Body() dto: CreateOrImportSeedDto) {
    this.logger.log(`${dto.mode === 'random' ? 'Creating' : 'Importing'} seed for user ${dto.userId}`);
    
    try {
      await this.walletService.createOrImportSeed(dto.userId, dto.mode, dto.mnemonic);
      
      return {
        ok: true,
      };
    } catch (error) {
      this.logger.error(`Failed to ${dto.mode === 'random' ? 'create' : 'import'} seed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  @Get('addresses')
  async getAddresses(@Query('userId') userId: string) {
    this.logger.log(`Getting addresses for user ${userId}`);
    
    try {
      const addresses = await this.walletService.getAddresses(userId);
      
      return addresses;
    } catch (error) {
      this.logger.error(`Failed to get addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  @Get('balances')
  async getBalances(@Query('userId') userId: string) {
    this.logger.log(`Getting balances for user ${userId}`);
    
    try {
      const balances = await this.walletService.getBalances(userId);
      
      return balances;
    } catch (error) {
      this.logger.error(`Failed to get balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  @Get('erc4337/paymaster-balances')
  async getErc4337PaymasterBalances(@Query('userId') userId: string) {
    this.logger.log(`Getting ERC-4337 paymaster balances for user ${userId}`);
    
    try {
      const balances = await this.walletService.getErc4337PaymasterBalances(userId);
      
      return balances;
    } catch (error) {
      this.logger.error(`Failed to get paymaster balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}
