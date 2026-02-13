/**
 * CUSTODY MODULE
 *
 * Presentation Layer - NestJS Module
 *
 * Placeholder module for custody operations.
 * Full implementation requires smart contract integration.
 */

import { Module } from '@nestjs/common';
import { CustodyController } from './custody.controller.js';
import { DepositToCustodyUseCase } from '../../../application/custody/use-cases/deposit-to-custody/deposit-to-custody.use-case.js';
import { CustodyContractAdapter } from '../../../infrastructure/custody/custody-contract.adapter.js';
import { CUSTODY_CONTRACT_PORT } from '../../../application/custody/ports/custody-contract.port.js';
import { WalletProviderModule } from '../../../infrastructure/wallet/wallet-provider.module.js';
import { YellowNetworkModule } from '../../../infrastructure/yellow-network/yellow-network.module.js';
import { ChannelModule } from '../channel/channel.module.js';

@Module({
  imports: [
    WalletProviderModule, // Provides WALLET_PROVIDER_PORT
    YellowNetworkModule, // Provides YELLOW_NETWORK_PORT
    ChannelModule, // Provides CHANNEL_MANAGER_PORT
  ],
  controllers: [CustodyController],
  providers: [
    DepositToCustodyUseCase,
    CustodyContractAdapter,
    {
      provide: CUSTODY_CONTRACT_PORT,
      useClass: CustodyContractAdapter,
    },
  ],
})
export class CustodyModule {}
