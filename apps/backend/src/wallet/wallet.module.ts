import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';
import { SeedRepository } from './seed.repository.js';
import { ZerionService } from './zerion.service.js';
import { PrismaModule } from '../database/prisma.module.js';
import { CryptoModule } from '../crypto/crypto.module.js';
// Import new modular services
import { ChainConfigService } from './config/chain.config.js';
import { PimlicoConfigService } from './config/pimlico.config.js';
import { SeedManager } from './managers/seed.manager.js';
import { AddressManager } from './managers/address.manager.js';
import { AccountFactory } from './factories/account.factory.js';
import { PimlicoAccountFactory } from './factories/pimlico-account.factory.js';
// Import Pimlico service for bundler/paymaster operations
import { PimlicoService } from './services/pimlico.service.js';
// Import Polkadot EVM RPC service
import { PolkadotEvmRpcService } from './services/polkadot-evm-rpc.service.js';
// Import Token List service
import { TokenListService } from './services/token-list.service.js';
// Import Substrate module
import { SubstrateModule } from './substrate/substrate.module.js';
// Import cache repositories
import { AddressCacheRepository } from './repositories/address-cache.repository.js';
import { BalanceCacheRepository } from './repositories/balance-cache.repository.js';

@Module({
  imports: [PrismaModule, CryptoModule, SubstrateModule],
  controllers: [WalletController],
  providers: [
    WalletService,
    SeedRepository,
    ZerionService,
    // Configuration services
    ChainConfigService,
    PimlicoConfigService,
    // Managers
    SeedManager,
    AddressManager,
    // Factories
    AccountFactory,
    PimlicoAccountFactory,
    // Pimlico bundler/paymaster service
    PimlicoService,
    // Polkadot EVM RPC service
    PolkadotEvmRpcService,
    // Token List service
    TokenListService,
    // Cache repositories
    AddressCacheRepository,
    BalanceCacheRepository,
  ],
  exports: [
    WalletService,
    SeedRepository,
    ZerionService,
    // Export managers and factories for use in other modules if needed
    SeedManager,
    AddressManager,
    AccountFactory,
    PimlicoAccountFactory,
    // Export Pimlico service
    PimlicoService,
    // Export Polkadot EVM RPC service
    PolkadotEvmRpcService,
    // Export Token List service
    TokenListService,
    // Export cache repositories
    AddressCacheRepository,
    BalanceCacheRepository,
  ],
})
export class WalletModule {}
