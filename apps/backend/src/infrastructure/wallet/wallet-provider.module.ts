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
import { WalletModule } from '../../wallet/wallet.module.js';

@Module({
  imports: [
    // Import WalletModule which provides WalletService and all its dependencies
    WalletModule,
  ],
  providers: [
    // Register adapter as implementation of port
    {
      provide: WALLET_PROVIDER_PORT,
      useClass: WalletProviderAdapter,
    },
  ],
  exports: [WALLET_PROVIDER_PORT],
})
export class WalletProviderModule {}
