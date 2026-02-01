/**
 * APP SESSION MODULE
 *
 * Presentation Layer - NestJS Module
 *
 * Wires together the presentation, application, and infrastructure layers.
 * This is where the Clean Architecture comes together:
 * - Controllers (Presentation) depend on Use Cases (Application)
 * - Use Cases depend on Ports (Application layer interfaces)
 * - Infrastructure modules provide Port implementations (Adapters)
 *
 * Dependency flow: Presentation → Application → Infrastructure
 */

import { Module } from '@nestjs/common';
import { AppSessionController } from './app-session.controller.js';

// Application layer - Use Cases
import { AuthenticateWalletUseCase } from '../../../application/app-session/use-cases/authenticate-wallet/authenticate-wallet.use-case.js';
import { CreateAppSessionUseCase } from '../../../application/app-session/use-cases/create-app-session/create-app-session.use-case.js';
import { UpdateAllocationUseCase } from '../../../application/app-session/use-cases/update-allocation/update-allocation.use-case.js';
import { QuerySessionUseCase } from '../../../application/app-session/use-cases/query-session/query-session.use-case.js';
import { DiscoverSessionsUseCase } from '../../../application/app-session/use-cases/discover-sessions/discover-sessions.use-case.js';
import { CloseSessionUseCase } from '../../../application/app-session/use-cases/close-session/close-session.use-case.js';

// Infrastructure layer - Adapter modules
import { YellowNetworkModule } from '../../../infrastructure/yellow-network/yellow-network.module.js';
import { WalletProviderModule } from '../../../infrastructure/wallet/wallet-provider.module.js';

@Module({
  imports: [
    // Import infrastructure modules (provide port implementations)
    YellowNetworkModule,
    WalletProviderModule,
  ],
  controllers: [
    AppSessionController,
  ],
  providers: [
    // Register use cases
    AuthenticateWalletUseCase,
    CreateAppSessionUseCase,
    UpdateAllocationUseCase,
    QuerySessionUseCase,
    DiscoverSessionsUseCase,
    CloseSessionUseCase,
  ],
})
export class AppSessionModule {}
