import { Module } from '@nestjs/common';
import { WalletConnectController } from './walletconnect.controller.js';
import { WalletConnectService } from './walletconnect.service.js';
import { SessionService } from './session.service.js';
import { SigningService } from './signing.service.js';
import { Eip7702AdapterService } from './eip7702-adapter.service.js';
import { PrismaModule } from '../database/prisma.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    WalletModule, // For Eip7702AccountFactory and SeedManager
    AuthModule, // For JWT auth
    PrismaModule,
  ],
  controllers: [WalletConnectController],
  providers: [
    WalletConnectService,
    SessionService,
    SigningService,
    Eip7702AdapterService,
  ],
  exports: [WalletConnectService, SessionService],
})
export class WalletConnectModule {}
