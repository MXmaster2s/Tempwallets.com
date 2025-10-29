import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';
import { SeedRepository } from './seed.repository.js';
import { PrismaModule } from '../database/prisma.module.js';
import { CryptoModule } from '../crypto/crypto.module.js';

@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [WalletController],
  providers: [WalletService, SeedRepository],
  exports: [WalletService, SeedRepository],
})
export class WalletModule {}

