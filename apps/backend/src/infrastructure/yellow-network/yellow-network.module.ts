/**
 * YELLOW NETWORK MODULE
 *
 * Infrastructure Layer - NestJS Module
 *
 * Provides the Yellow Network adapter implementation.
 * Registers the adapter with the dependency injection container.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YellowNetworkAdapter } from './yellow-network.adapter.js';
import { YELLOW_NETWORK_PORT } from '../../application/app-session/ports/yellow-network.port.js';
import { CHANNEL_MANAGER_PORT } from '../../application/channel/ports/channel-manager.port.js';
import { WalletModule } from '../../wallet/wallet.module.js';

@Module({
  imports: [
    ConfigModule,
    // Import WalletModule which provides SeedRepository and its dependencies
    WalletModule,
  ],
  providers: [
    YellowNetworkAdapter,
    // Register adapter as implementation of Yellow Network port
    {
      provide: YELLOW_NETWORK_PORT,
      useExisting: YellowNetworkAdapter,
    },
    // Register same adapter as implementation of Channel Manager port
    {
      provide: CHANNEL_MANAGER_PORT,
      useExisting: YellowNetworkAdapter,
    },
  ],
  exports: [YELLOW_NETWORK_PORT, CHANNEL_MANAGER_PORT],
})
export class YellowNetworkModule {}
