/**
 * WALLET PROVIDER MODULE
 *
 * Infrastructure Layer - NestJS Module
 *
 * Provides the Wallet Provider adapter implementation.
 * Registers the adapter with the dependency injection container.
 */

import { Module } from '@nestjs/common';
import { WalletProviderAdapter } from './wallet-provider.adapter.js';
import { WALLET_PROVIDER_PORT } from '../../application/app-session/ports/wallet-provider.port.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SeedRepository } from '../../wallet/seed.repository.js';

@Module({
  providers: [
    // Register adapter as implementation of port
    {
      provide: WALLET_PROVIDER_PORT,
      useClass: WalletProviderAdapter,
    },
    WalletService,
    PrismaService,
    SeedRepository,
  ],
  exports: [WALLET_PROVIDER_PORT],
})
export class WalletProviderModule {}
