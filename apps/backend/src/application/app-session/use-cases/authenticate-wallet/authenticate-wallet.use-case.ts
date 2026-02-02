/**
 * AUTHENTICATE WALLET USE CASE
 *
 * Application Layer - Business Operation
 *
 * Authenticates a user's wallet with Yellow Network.
 *
 * Business Flow:
 * 1. Get user's wallet address for specified chain
 * 2. Authenticate with Yellow Network (creates session keys, WebSocket connection)
 * 3. Return authentication result
 *
 * This is the FIRST step in Yellow Network's flow.
 * After authentication, user can query and interact with app sessions.
 */

import { Injectable, Inject } from '@nestjs/common';
import type { IYellowNetworkPort } from '../../ports/yellow-network.port.js';
import { YELLOW_NETWORK_PORT } from '../../ports/yellow-network.port.js';
import type { IWalletProviderPort } from '../../ports/wallet-provider.port.js';
import { WALLET_PROVIDER_PORT } from '../../ports/wallet-provider.port.js';
import { AuthenticateWalletDto, AuthenticateWalletResultDto } from './authenticate-wallet.dto.js';

@Injectable()
export class AuthenticateWalletUseCase {
  constructor(
    @Inject(YELLOW_NETWORK_PORT)
    private readonly yellowNetwork: IYellowNetworkPort,
    @Inject(WALLET_PROVIDER_PORT)
    private readonly walletProvider: IWalletProviderPort,
  ) {}

  async execute(dto: AuthenticateWalletDto): Promise<AuthenticateWalletResultDto> {
    // 1. Get user's wallet address
    const walletAddress = await this.walletProvider.getWalletAddress(
      dto.userId,
      dto.chain
    );

    // 2. Authenticate with Yellow Network
    const { sessionId, expiresAt, authSignature } = await this.yellowNetwork.authenticate(dto.userId, walletAddress);

    // 3. Return result
    return {
      authenticated: true,
      sessionId,
      walletAddress,
      chain: dto.chain,
      timestamp: Date.now(),
      expiresAt,
      authSignature,
    };
  }
}
