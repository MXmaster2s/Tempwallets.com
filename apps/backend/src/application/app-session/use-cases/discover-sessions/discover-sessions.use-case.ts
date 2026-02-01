/**
 * DISCOVER SESSIONS USE CASE
 *
 * Application Layer - Business Operation
 *
 * Discover all app sessions where user is a participant.
 *
 * Business Flow:
 * 1. Get user's wallet address
 * 2. Authenticate with Yellow Network
 * 3. Query all sessions where user is participant
 * 4. Return filtered sessions
 *
 * Simplified from current implementation:
 * - No database sync (was 7 steps, now 1 step!)
 * - No "active" vs "invitations" split (artificial distinction)
 * - Yellow Network handles filtering
 */

import { Injectable, Inject } from '@nestjs/common';
import type { IYellowNetworkPort } from '../../ports/yellow-network.port.js';
import { YELLOW_NETWORK_PORT } from '../../ports/yellow-network.port.js';
import type { IWalletProviderPort } from '../../ports/wallet-provider.port.js';
import { WALLET_PROVIDER_PORT } from '../../ports/wallet-provider.port.js';
import { DiscoverSessionsDto, DiscoverSessionsResultDto } from './discover-sessions.dto.js';

@Injectable()
export class DiscoverSessionsUseCase {
  constructor(
    @Inject(YELLOW_NETWORK_PORT)
    private readonly yellowNetwork: IYellowNetworkPort,
    @Inject(WALLET_PROVIDER_PORT)
    private readonly walletProvider: IWalletProviderPort,
  ) {}

  async execute(dto: DiscoverSessionsDto): Promise<DiscoverSessionsResultDto> {
    // 1. Get user's wallet address
    const walletAddress = await this.walletProvider.getWalletAddress(
      dto.userId,
      dto.chain
    );

    // 2. Authenticate with Yellow Network
    await this.yellowNetwork.authenticate(dto.userId, walletAddress);

    // 3. Query sessions from Yellow Network
    // Yellow Network filters by participant for us
    const sessions = await this.yellowNetwork.querySessions({
      participant: walletAddress,
      status: dto.status,
    });

    // 4. Return simplified result
    return {
      sessions: sessions.map(s => ({
        appSessionId: s.app_session_id,
        status: s.status,
        version: s.version,
        participants: s.definition.participants,
        allocations: s.allocations,
      })),
      count: sessions.length,
    };
  }
}
