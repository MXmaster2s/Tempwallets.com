/**
 * CHANNEL MODULE
 *
 * Presentation Layer - NestJS Module
 *
 * Wires together channel management functionality.
 */

import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller.js';
import { FundChannelUseCase } from '../../../application/channel/use-cases/fund-channel/fund-channel.use-case.js';
import { YellowNetworkModule } from '../../../infrastructure/yellow-network/yellow-network.module.js';
import { WalletProviderModule } from '../../../infrastructure/wallet/wallet-provider.module.js';

@Module({
  imports: [
    YellowNetworkModule, // Provides YELLOW_NETWORK_PORT and CHANNEL_MANAGER_PORT
    WalletProviderModule, // Provides WALLET_PROVIDER_PORT
  ],
  controllers: [ChannelController],
  providers: [FundChannelUseCase],
})
export class ChannelModule {}
