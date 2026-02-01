/**
 * CHANNEL CONTROLLER
 *
 * Presentation Layer - HTTP Adapter
 *
 * Manages 2-party payment channels (user ↔ clearnode).
 * Channels move funds from unified balance into payment channels.
 *
 * Flow: Unified Balance → Payment Channel
 *
 * Prerequisites: User must have funds in unified balance (deposit to custody first)
 *
 * Endpoints:
 * POST /channel/fund - Create or fund a payment channel
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';

import { FundChannelUseCase } from '../../../application/channel/use-cases/fund-channel/fund-channel.use-case.js';

@Controller('channel')
export class ChannelController {
  constructor(
    private readonly fundChannelUseCase: FundChannelUseCase,
  ) {}

  /**
   * POST /channel/fund
   *
   * Create or fund a 2-party payment channel.
   * Moves funds from unified balance into the channel.
   *
   * Prerequisites:
   * 1. User must have deposited to custody (POST /custody/deposit)
   * 2. User must be authenticated with Yellow Network
   */
  @Post('fund')
  @HttpCode(HttpStatus.OK)
  async fundChannel(@Body(ValidationPipe) request: {
    userId: string;
    chain: string;
    asset: string;
    amount: string;
  }) {
    const result = await this.fundChannelUseCase.execute({
      userId: request.userId,
      chain: request.chain,
      asset: request.asset,
      amount: request.amount,
    });

    return {
      ok: true,
      ...result,
    };
  }
}
