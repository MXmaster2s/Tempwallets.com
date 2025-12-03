import { Module, forwardRef } from '@nestjs/common';
import { EvmWalletConnectService } from './services/evm-walletconnect.service.js';
import { EvmWalletConnectController } from './evm-walletconnect.controller.js';
// Import dependencies - use forwardRef to avoid circular dependency
import { WalletModule } from '../wallet.module.js';

/**
 * EVM Module
 *
 * Encapsulates all EVM WalletConnect functionality
 * Separate from Substrate wallet logic for namespace isolation
 */
@Module({
  imports: [forwardRef(() => WalletModule)], // Import to get AddressManager, SeedManager, etc.
  controllers: [EvmWalletConnectController],
  providers: [
    // Services
    EvmWalletConnectService,
  ],
  exports: [EvmWalletConnectService],
})
export class EvmModule {}
