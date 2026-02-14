/**
 * QUERY SESSION USE CASE
 *
 * Application Layer - Business Operation
 *
 * Query a specific app session from Yellow Network.
 *
 * Business Flow:
 * 1. Authenticate user's wallet with Yellow Network
 * 2. Query session from Yellow Network
 * 3. Verify user is a participant
 * 4. Return session data
 *
 * Simplified from current implementation:
 * - No database sync (overcomplicated)
 * - Yellow Network is single source of truth
 * - Clean, simple query operation
 */

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { IYellowNetworkPort } from '../../ports/yellow-network.port.js';
import { YELLOW_NETWORK_PORT } from '../../ports/yellow-network.port.js';
import type { IWalletProviderPort } from '../../ports/wallet-provider.port.js';
import { WALLET_PROVIDER_PORT } from '../../ports/wallet-provider.port.js';
import { QuerySessionDto, QuerySessionResultDto } from './query-session.dto.js';

@Injectable()
export class QuerySessionUseCase {
  constructor(
    @Inject(YELLOW_NETWORK_PORT)
    private readonly yellowNetwork: IYellowNetworkPort,
    @Inject(WALLET_PROVIDER_PORT)
    private readonly walletProvider: IWalletProviderPort,
  ) {}

  async execute(dto: QuerySessionDto): Promise<QuerySessionResultDto> {
    // 1. Get user's wallet address
    const walletAddress = await this.walletProvider.getWalletAddress(
      dto.userId,
      dto.chain,
    );

    // 2. Authenticate with Yellow Network
    await this.yellowNetwork.authenticate(dto.userId, walletAddress);

    // 3. Query session from Yellow Network
    const session = await this.yellowNetwork.querySession(dto.sessionId);

    // 4. Verify user is a participant
    const isParticipant = session.definition.participants.some(
      (p) => p.toLowerCase() === walletAddress.toLowerCase(),
    );

    if (!isParticipant) {
      throw new BadRequestException(
        `You are not a participant in this session. ` +
          `Your wallet address (${walletAddress}) was not included when the session was created.`,
      );
    }

    // 5. Return session data
    return {
      appSessionId: session.app_session_id,
      status: session.status,
      version: session.version,
      definition: session.definition,
      allocations: session.allocations,
      sessionData: session.session_data,
    };
  }
}
