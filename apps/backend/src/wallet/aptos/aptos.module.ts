import { Module, forwardRef } from '@nestjs/common';
import { AptosRpcService } from './services/aptos-rpc.service.js';
import { AptosAccountService } from './services/aptos-account.service.js';
import { AptosTransactionService } from './services/aptos-transaction.service.js';
import { AptosFaucetService } from './services/aptos-faucet.service.js';
import { AptosSequenceManager } from './managers/aptos-sequence.manager.js';
import { AptosAddressManager } from './managers/aptos-address.manager.js';
import { AptosAccountFactory } from './factories/aptos-account.factory.js';
import { AptosManager } from './managers/aptos.manager.js';
import { AptosWalletController } from './aptos-wallet.controller.js';
// Import dependencies - use forwardRef to avoid circular dependency
import { WalletModule } from '../wallet.module.js';
import { PrismaModule } from '../../database/prisma.module.js';

/**
 * Aptos Module
 *
 * Encapsulates all Aptos wallet functionality
 * Separate from EVM/Substrate wallet logic
 */
@Module({
  imports: [forwardRef(() => WalletModule), PrismaModule], // Import to get SeedManager (avoid circular dependency)
  controllers: [AptosWalletController],
  providers: [
    // Services
    AptosRpcService,
    AptosAccountService,
    AptosTransactionService,
    AptosFaucetService,
    // Managers
    AptosSequenceManager,
    AptosAddressManager,
    AptosManager, // Main facade/coordinator for wallet integration
    // Factories
    AptosAccountFactory,
  ],
  exports: [
    AptosRpcService,
    AptosAccountService,
    AptosTransactionService,
    AptosFaucetService,
    AptosSequenceManager,
    AptosAddressManager,
    AptosAccountFactory,
    AptosManager, // Export for wallet integration
  ],
})
export class AptosModule {}

