import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';
import { PrismaModule } from '../database/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}

