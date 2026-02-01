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
  Body,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { DepositToCustodyUseCase } from '../../../application/custody/use-cases/deposit-to-custody/deposit-to-custody.use-case.js';

@Controller('custody')
export class CustodyController {
  constructor(
    private readonly depositToCustodyUseCase: DepositToCustodyUseCase,
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
  async depositToCustody(@Body(ValidationPipe) request: {
    userId: string;
    chain: string;
    asset: string;
    amount: string;
  }) {
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
}
