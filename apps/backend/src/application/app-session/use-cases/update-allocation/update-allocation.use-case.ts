/**
 * UPDATE ALLOCATION USE CASE
 *
 * Application Layer - Business Operation
 *
 * Updates allocations in an app session (deposit, transfer, withdraw).
 * This is Yellow Network's core operation - gasless state transitions.
 *
 * Business Flow:
 * 1. Authenticate user's wallet
 * 2. Query current session state from Yellow Network
 * 3. Validate user is a participant
 * 4. Update allocations via Yellow Network (signed state transition)
 * 5. Return updated state (NO database update - Yellow Network is source of truth)
 *
 * Simplified from current implementation:
 * - No database sync (overcomplicated)
 * - Single operation for deposit/transfer/withdraw (cleaner)
 * - Yellow Network handles all validation
 */

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { IYellowNetworkPort } from '../../ports/yellow-network.port.js';
import { YELLOW_NETWORK_PORT } from '../../ports/yellow-network.port.js';
import type { IWalletProviderPort } from '../../ports/wallet-provider.port.js';
import { WALLET_PROVIDER_PORT } from '../../ports/wallet-provider.port.js';
import {
  UpdateAllocationDto,
  UpdateAllocationResultDto,
} from './update-allocation.dto.js';

@Injectable()
export class UpdateAllocationUseCase {
  constructor(
    @Inject(YELLOW_NETWORK_PORT)
    private readonly yellowNetwork: IYellowNetworkPort,
    @Inject(WALLET_PROVIDER_PORT)
    private readonly walletProvider: IWalletProviderPort,
  ) {}

  async execute(dto: UpdateAllocationDto): Promise<UpdateAllocationResultDto> {
    // 1. Get user's wallet address
    const walletAddress = await this.walletProvider.getWalletAddress(
      dto.userId,
      dto.chain,
    );

    // 2. Authenticate with Yellow Network
    await this.yellowNetwork.authenticate(dto.userId, walletAddress);

    // 3. Query current session to verify user is participant
    const currentSession = await this.yellowNetwork.querySession(
      dto.appSessionId,
    );

    // 4. Update allocations with Yellow Network
    const updated = await this.yellowNetwork.updateSession({
      sessionId: dto.appSessionId,
      intent: dto.intent,
      allocations: dto.allocations,
    });

    // 5. Return result (NO database update)
    return {
      appSessionId: updated.app_session_id,
      version: updated.version,
      allocations: updated.allocations,
    };
  }
}
