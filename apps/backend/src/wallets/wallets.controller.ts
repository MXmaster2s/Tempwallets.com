import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { WalletsService } from './wallets.service.js';
import { CreateWalletDto, GetWalletAddressesDto } from './dto/create-wallet.dto.js';

@Controller('wallets')
export class WalletsController {
  private readonly logger = new Logger(WalletsController.name);

  constructor(private readonly walletsService: WalletsService) {}

  @Post('create')
  async createWallet(@Body() createWalletDto: CreateWalletDto) {
    this.logger.log(`Creating wallet for user ${createWalletDto.userId}`);
    
    try {
      const result = await this.walletsService.createWallet(
        createWalletDto.userId,
        createWalletDto.passkey
      );
      
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  @Get(':walletId/addresses')
  async getWalletAddresses(@Param() params: GetWalletAddressesDto) {
    this.logger.log(`Getting addresses for wallet ${params.walletId}`);
    
    try {
      const addresses = await this.walletsService.getWalletAddresses(params.walletId);
      
      return {
        success: true,
        data: addresses,
      };
    } catch (error) {
      this.logger.error(`Failed to get wallet addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string) {
    this.logger.log(`Getting wallet ${walletId}`);
    
    try {
      const wallet = await this.walletsService.getWalletById(walletId);
      
      // Remove sensitive data from response
      const { encryptedSeed, encryptedEntropy, ...safeWallet } = wallet;
      
      return {
        success: true,
        data: safeWallet,
      };
    } catch (error) {
      this.logger.error(`Failed to get wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}

