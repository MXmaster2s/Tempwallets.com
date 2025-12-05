import { Module, forwardRef } from '@nestjs/common';
import { WalletModule } from '../wallet.module.js';
import { PrismaModule } from '../../database/prisma.module.js';

// Controller
import { Eip7702WalletController } from './eip7702-wallet.controller.js';

// Services
import { Eip7702RpcService } from './services/eip7702-rpc.service.js';
import { BundlerService } from './services/bundler.service.js';
import { PaymasterService } from './services/paymaster.service.js';
import { UserOperationService } from './services/user-operation.service.js';

// Managers
import { Eip7702Manager } from './managers/eip7702.manager.js';
import { DelegationManager } from './managers/delegation.manager.js';
import { NonceManager } from './managers/nonce.manager.js';

// Factories
import { SmartAccountFactory } from './factories/smart-account.factory.js';

/**
 * EIP-7702 Gasless Wallet Module
 *
 * Self-contained module for EIP-7702 based gasless transactions.
 *
 * ARCHITECTURE:
 * - Follows same pattern as AptosModule
 * - Uses forwardRef to WalletModule for SeedManager access
 * - Exports main manager for integration with other modules
 *
 * DEPENDENCIES:
 * - WalletModule: Provides SeedManager for seed phrase access
 * - PrismaModule: Provides database access for delegation tracking
 */
@Module({
  imports: [
    forwardRef(() => WalletModule),
    PrismaModule,
  ],
  controllers: [Eip7702WalletController],
  providers: [
    // Services (lowest level - no dependencies on other module services)
    Eip7702RpcService,
    BundlerService,
    PaymasterService,
    UserOperationService,

    // Factories
    SmartAccountFactory,

    // Managers (higher level - coordinate services)
    DelegationManager,
    NonceManager,
    Eip7702Manager,
  ],
  exports: [
    // Export manager for integration with main wallet service
    Eip7702Manager,
    // Export these for potential use in other modules
    BundlerService,
    PaymasterService,
    Eip7702RpcService,
  ],
})
export class Eip7702Module {}

