/**
 * APP SESSION CONTROLLER
 *
 * Presentation Layer - HTTP Adapter
 *
 * Thin controller that adapts HTTP requests to use case calls.
 * Follows Clean Architecture principles:
 * - Controllers are thin (5-20 lines per method)
 * - Only validate, convert DTOs, call use case, return response
 * - NO business logic in controllers
 *
 * Simplified from current implementation:
 * - 7 endpoints instead of 11 (removed join, split fund-channel)
 * - Clear naming (no confusing fund-channel/deposit)
 * - Follows Yellow Network's actual flow
 *
 * Endpoint Map:
 * POST   /app-session/authenticate     → Authenticate wallet with Yellow Network
 * POST   /app-session                  → Create new app session
 * GET    /app-session/:sessionId       → Query specific session
 * GET    /app-session/discover/:userId → Discover user's sessions
 * PATCH  /app-session/:sessionId       → Update allocations (deposit/transfer/withdraw)
 * DELETE /app-session/:sessionId       → Close session
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';

// Use Cases
import { AuthenticateWalletUseCase } from '../../../application/app-session/use-cases/authenticate-wallet/authenticate-wallet.use-case.js';
import { CreateAppSessionUseCase } from '../../../application/app-session/use-cases/create-app-session/create-app-session.use-case.js';
import { QuerySessionUseCase } from '../../../application/app-session/use-cases/query-session/query-session.use-case.js';
import { DiscoverSessionsUseCase } from '../../../application/app-session/use-cases/discover-sessions/discover-sessions.use-case.js';
import { UpdateAllocationUseCase } from '../../../application/app-session/use-cases/update-allocation/update-allocation.use-case.js';
import { CloseSessionUseCase } from '../../../application/app-session/use-cases/close-session/close-session.use-case.js';

// HTTP DTOs
import { AuthenticateWalletRequestDto } from './dto/authenticate-wallet-request.dto.js';
import { CreateAppSessionRequestDto } from './dto/create-app-session-request.dto.js';
import { QuerySessionRequestDto } from './dto/query-session-request.dto.js';
import { UpdateAllocationRequestDto } from './dto/update-allocation-request.dto.js';

@Controller('app-session')
export class AppSessionController {
  constructor(
    private readonly authenticateWalletUseCase: AuthenticateWalletUseCase,
    private readonly createAppSessionUseCase: CreateAppSessionUseCase,
    private readonly querySessionUseCase: QuerySessionUseCase,
    private readonly discoverSessionsUseCase: DiscoverSessionsUseCase,
    private readonly updateAllocationUseCase: UpdateAllocationUseCase,
    private readonly closeSessionUseCase: CloseSessionUseCase,
  ) {}

  /**
   * POST /app-session/authenticate
   *
   * Authenticate user's wallet with Yellow Network.
   * This is the FIRST step - creates authenticated connection for the user.
   */
  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  async authenticate(@Body(ValidationPipe) request: AuthenticateWalletRequestDto) {
    const result = await this.authenticateWalletUseCase.execute({
      userId: request.userId,
      chain: request.chain,
    });

    return {
      ok: true,
      authenticated: result.authenticated,
      walletAddress: result.walletAddress,
      chain: result.chain,
      timestamp: result.timestamp,
    };
  }

  /**
   * POST /app-session
   *
   * Create a new app session (Lightning Node).
   * Participants are pre-authorized at creation (no "join" needed).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body(ValidationPipe) request: CreateAppSessionRequestDto) {
    const result = await this.createAppSessionUseCase.execute({
      userId: request.userId,
      chain: request.chain,
      participants: request.participants,
      weights: request.weights,
      quorum: request.quorum,
      token: request.token,
      initialAllocations: request.initialAllocations,
      sessionData: request.sessionData,
    });

    return {
      ok: true,
      appSessionId: result.appSessionId,
      status: result.status,
      version: result.version,
      participants: result.participants,
      allocations: result.allocations,
    };
  }

  /**
   * GET /app-session/:sessionId
   *
   * Query a specific app session.
   * User must be a participant.
   */
  @Get(':sessionId')
  async querySession(
    @Param('sessionId') sessionId: string,
    @Query('userId') userId: string,
    @Query('chain') chain: string,
  ) {
    const result = await this.querySessionUseCase.execute({
      userId,
      sessionId,
      chain,
    });

    return {
      ok: true,
      session: result,
    };
  }

  /**
   * GET /app-session/discover/:userId
   *
   * Discover all app sessions where user is a participant.
   * Yellow Network's auto-discovery feature.
   */
  @Get('discover/:userId')
  async discoverSessions(
    @Param('userId') userId: string,
    @Query('chain') chain: string,
    @Query('status') status?: 'open' | 'closed',
  ) {
    const result = await this.discoverSessionsUseCase.execute({
      userId,
      chain,
      status,
    });

    return {
      ok: true,
      sessions: result.sessions,
      count: result.count,
    };
  }

  /**
   * PATCH /app-session/:sessionId
   *
   * Update allocations (deposit, transfer, withdraw).
   * All allocation changes go through this single endpoint.
   */
  @Patch(':sessionId')
  @HttpCode(HttpStatus.OK)
  async updateAllocation(
    @Param('sessionId') sessionId: string,
    @Body(ValidationPipe) request: UpdateAllocationRequestDto,
  ) {
    const result = await this.updateAllocationUseCase.execute({
      userId: request.userId,
      appSessionId: sessionId,
      chain: request.chain,
      intent: request.intent,
      allocations: request.allocations,
    });

    return {
      ok: true,
      appSessionId: result.appSessionId,
      version: result.version,
      allocations: result.allocations,
    };
  }

  /**
   * DELETE /app-session/:sessionId
   *
   * Close app session and return funds to unified balance.
   */
  @Delete(':sessionId')
  @HttpCode(HttpStatus.OK)
  async closeSession(
    @Param('sessionId') sessionId: string,
    @Query('userId') userId: string,
    @Query('chain') chain: string,
  ) {
    const result = await this.closeSessionUseCase.execute({
      userId,
      appSessionId: sessionId,
      chain,
    });

    return {
      ok: true,
      closed: result.closed,
    };
  }
}
