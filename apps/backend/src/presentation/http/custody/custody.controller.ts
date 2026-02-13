/**
 * CUSTODY CONTROLLER
 *
 * Presentation Layer - HTTP Adapter
 *
 * Manages custody operations (on-chain deposits/withdrawals).
 * Deposits move funds from wallet to custody contract, creating unified balance.
 *
 * Flow: Wallet (on-chain) → Custody Contract → Unified Balance
 *
 * This is the FIRST step in Yellow Network flow:
 *   1. Deposit to custody (this controller) - ON-CHAIN
 *   2. Fund channel (optional) - moves to 2-party channel
 *   3. Create app session - multi-party off-chain
 *
 * Endpoints:
 * POST /custody/deposit - Deposit funds to custody contract
 *
 * NOTE: This is a PLACEHOLDER controller since custody operations
 * require direct smart contract interaction which needs proper
 * Web3 setup. For now, this returns a helpful message.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { DepositToCustodyUseCase } from '../../../application/custody/use-cases/deposit-to-custody/deposit-to-custody.use-case.js';
import { Inject } from '@nestjs/common';
import type { IYellowNetworkPort } from '../../../application/app-session/ports/yellow-network.port.js';
import { YELLOW_NETWORK_PORT } from '../../../application/app-session/ports/yellow-network.port.js';
import type { IWalletProviderPort } from '../../../application/app-session/ports/wallet-provider.port.js';
import { WALLET_PROVIDER_PORT } from '../../../application/app-session/ports/wallet-provider.port.js';

@Controller('custody')
export class CustodyController {
  constructor(
    private readonly depositToCustodyUseCase: DepositToCustodyUseCase,
    @Inject(YELLOW_NETWORK_PORT)
    private readonly yellowNetwork: IYellowNetworkPort,
    @Inject(WALLET_PROVIDER_PORT)
    private readonly walletProvider: IWalletProviderPort,
  ) {}

  /**
   * POST /custody/deposit
   *
   * Deposit funds from wallet to custody contract.
   * This is an ON-CHAIN operation that creates unified balance.
   *
   * This solves the problem: "Custody balance shows funds but unified balance is 0"
   *
   * Flow:
   * 1. USDC.approve(custodyAddress, amount) - on-chain
   * 2. Custody.deposit(asset, amount, recipient) - on-chain
   * 3. Wait for Yellow Network to index deposit
   * 4. Verify unified balance is credited
   */
  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async depositToCustody(
    @Body(ValidationPipe)
    request: {
      userId: string;
      chain: string;
      asset: string;
      amount: string;
    },
  ) {
    const result = await this.depositToCustodyUseCase.execute({
      userId: request.userId,
      chain: request.chain,
      asset: request.asset,
      amount: request.amount,
    });

    return {
      ok: true,
      data: result,
    };
  }

  /**
   * GET /custody/balance
   *
   * Returns off-chain unified balance (Yellow Network ledger balances).
   *
   * IMPORTANT: Yellow ledger is only queryable after authenticating:
   * POST /app-session/authenticate
   */
  @Get('balance')
  @HttpCode(HttpStatus.OK)
  async getUnifiedBalance(
    @Query('userId') userId: string,
    @Query('chain') chain: string,
  ) {
    // Ensure the adapter is authenticated for the user's wallet.
    // This avoids the common case where deposit succeeded on-chain
    // but unified balance reads return 0 because we never authenticated.
    const walletAddress = await this.walletProvider.getWalletAddress(
      userId,
      chain,
    );
    await this.yellowNetwork.authenticate(userId, walletAddress);

    const balances = await this.yellowNetwork.getUnifiedBalance(walletAddress);

    return {
      ok: true,
      data: {
        accountId: walletAddress,
        balances,
      },
    };
  }
}
