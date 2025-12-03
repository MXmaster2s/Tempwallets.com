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
// Import EVM module
import { EvmModule } from './evm/evm.module.js';
// Import Aptos module
import { AptosModule } from './aptos/aptos.module.js';
// Import cache repositories
import { AddressCacheRepository } from './repositories/address-cache.repository.js';
import { BalanceCacheRepository } from './repositories/balance-cache.repository.js';
import { WalletHistoryRepository } from './repositories/wallet-history.repository.js';
// Import Aptos managers and services
import { AptosAddressManager } from './aptos/managers/aptos-address.manager.js';
import { AptosAccountFactory } from './aptos/factories/aptos-account.factory.js';
import { AptosRpcService } from './aptos/services/aptos-rpc.service.js';
import { AptosAccountService } from './aptos/services/aptos-account.service.js';
import { AptosSequenceManager } from './aptos/managers/aptos-sequence.manager.js';
import { AptosTransactionService } from './aptos/services/aptos-transaction.service.js';
import { AptosFaucetService } from './aptos/services/aptos-faucet.service.js';

@Module({
  imports: [PrismaModule, CryptoModule, SubstrateModule, EvmModule, AptosModule],
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
    AptosAddressManager,
    AptosSequenceManager,
    // Factories
    AccountFactory,
    PimlicoAccountFactory,
    AptosAccountFactory,
    // Aptos Services
    AptosRpcService,
    AptosAccountService,
    AptosTransactionService,
    AptosFaucetService,
    // Pimlico bundler/paymaster service
    PimlicoService,
    // Polkadot EVM RPC service
    PolkadotEvmRpcService,
    // Token List service
    TokenListService,
    // Cache repositories
    AddressCacheRepository,
    BalanceCacheRepository,
    WalletHistoryRepository,
  ],
  exports: [
    WalletService,
    SeedRepository,
    ZerionService,
    // Configuration services
    ChainConfigService,
    PimlicoConfigService,
    // Export managers and factories for use in other modules if needed
    SeedManager,
    AddressManager,
    AccountFactory,
    PimlicoAccountFactory,
    AptosAddressManager,
    AptosAccountFactory,
    AptosRpcService,
    AptosAccountService,
    AptosTransactionService,
    AptosSequenceManager,
    // Export Pimlico service
    PimlicoService,
    // Export Polkadot EVM RPC service
    PolkadotEvmRpcService,
    // Export Token List service
    TokenListService,
    // Export cache repositories
    AddressCacheRepository,
    BalanceCacheRepository,
    WalletHistoryRepository,
  ],
})
export class WalletModule {}
