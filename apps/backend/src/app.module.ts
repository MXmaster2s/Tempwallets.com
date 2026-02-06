import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UserModule } from './user/user.module.js';
import { LightningNodeModule } from './lightning-node/lightning-node.module.js';
import { WalletConnectModule } from './walletconnect/walletconnect.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Don't specify envFilePath - let it use process.env in production
      envFilePath: process.env.NODE_ENV === 'production' ? undefined : '.env',
    }),
    PrismaModule,
    WalletModule,
    AuthModule,
    UserModule,
    LightningNodeModule,
    WalletConnectModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule { }
