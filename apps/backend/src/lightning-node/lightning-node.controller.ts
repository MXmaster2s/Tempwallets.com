import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Query,
} from '@nestjs/common';
import { LightningNodeService } from './lightning-node.service.js';
import {
  CreateLightningNodeDto,
  DepositFundsDto,
  TransferFundsDto,
  CloseLightningNodeDto,
  JoinLightningNodeDto,
  AuthenticateWalletDto,
  SearchSessionDto,
  FundChannelDto,
  WithdrawFundsDto,
} from './dto/index.js';

@Controller('lightning-node')
export class LightningNodeController {
  constructor(private readonly lightningNodeService: LightningNodeService) {}

  // ============================================================================
  // Yellow Network Native Flow Endpoints
  // ============================================================================

  /**
   * POST /lightning-node/authenticate
   * Authenticate user's wallet with Yellow Network
   *
   * This is the FIRST step - creates authenticated NitroliteClient for the user.
   * After this, user can search/discover sessions and interact with them.
   */
  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  async authenticateWallet(@Body(ValidationPipe) dto: AuthenticateWalletDto) {
    return await this.lightningNodeService.authenticateWallet(dto);
  }

  /**
   * POST /lightning-node/search
   * Search for a specific Lightning Node session by ID
   *
   * Uses Yellow Network's getLightningNode() to query a session.
   * User must be authenticated and must be a participant.
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  async searchSession(@Body(ValidationPipe) dto: SearchSessionDto) {
    return await this.lightningNodeService.searchSession(dto);
  }

  /**
   * GET /lightning-node/discover/:userId
   * Discover all Lightning Node sessions where user is a participant
   *
   * Uses Yellow Network's getLightningNodes() to find all sessions.
   * Returns both active sessions and new invitations.
   */
  @Get('discover/:userId')
  async discoverSessions(
    @Param('userId') userId: string,
    @Query('chain') chain?: string,
  ) {
    return await this.lightningNodeService.discoverSessions(userId, chain);
  }

  /**
   * POST /lightning-node/create
   * Create a new Lightning Node (App Session)
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body(ValidationPipe) dto: CreateLightningNodeDto) {
    return await this.lightningNodeService.create(dto);
  }

  /**
   * POST /lightning-node/join
   * @deprecated Use the new flow instead: authenticate -> search/discover
   *
   * Legacy endpoint for backward compatibility.
   * Yellow Network doesn't have a "join" concept. Use these endpoints instead:
   * 1. POST /lightning-node/authenticate - Authenticate your wallet
   * 2. POST /lightning-node/search - Search for specific session
   * 3. GET /lightning-node/discover/:userId - Discover all your sessions
   */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  async join(@Body(ValidationPipe) dto: JoinLightningNodeDto) {
    return await this.lightningNodeService.join(dto);
  }

  /**
   * POST /lightning-node/fund-channel
   * Fund payment channel (add funds to unified balance)
   *
   * This moves funds from the user's on-chain wallet to the unified balance.
   * Funds in unified balance can then be deposited to app sessions (gasless).
   */
  @Post('fund-channel')
  @HttpCode(HttpStatus.OK)
  async fundChannel(@Body(ValidationPipe) dto: FundChannelDto) {
    return await this.lightningNodeService.fundChannel(dto);
  }

  /**
   * POST /lightning-node/deposit
   * Deposit funds to Lightning Node (gasless)
   *
   * Moves funds from unified balance to app session.
   * Requires funds to be in unified balance first (use fund-channel endpoint).
   */
  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(@Body(ValidationPipe) dto: DepositFundsDto) {
    return await this.lightningNodeService.deposit(dto);
  }

  /**
   * POST /lightning-node/withdraw
   * Withdraw funds from Lightning Node (gasless)
   *
   * Moves funds from app session back to unified balance.
   * From unified balance, funds can be withdrawn on-chain if needed.
   */
  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(@Body(ValidationPipe) dto: WithdrawFundsDto) {
    return await this.lightningNodeService.withdraw(dto);
  }

  /**
   * POST /lightning-node/transfer
   * Transfer funds within Lightning Node (gasless)
   */
  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(@Body(ValidationPipe) dto: TransferFundsDto) {
    return await this.lightningNodeService.transfer(dto);
  }

  /**
   * POST /lightning-node/close
   * Close Lightning Node
   */
  @Post('close')
  @HttpCode(HttpStatus.OK)
  async close(@Body(ValidationPipe) dto: CloseLightningNodeDto) {
    return await this.lightningNodeService.close(dto);
  }

  /**
   * GET /lightning-node/invited/:userId
   * Lists Lightning Nodes where the user's wallet address is included as a participant.
   * This allows invite discovery without having to manually receive the URI.
   */
  @Get('invited/:userId')
  async findInvited(@Param('userId') userId: string) {
    return await this.lightningNodeService.findInvitedByUserId(userId);
  }

  /**
   * POST /lightning-node/presence/:appSessionId/:userId
   * Best-effort presence heartbeat. Updates lastSeenAt for this user if they are a participant.
   */
  @Post('presence/:appSessionId/:userId')
  @HttpCode(HttpStatus.OK)
  async presence(
    @Param('appSessionId') appSessionId: string,
    @Param('userId') userId: string,
  ) {
    return await this.lightningNodeService.heartbeatPresence({
      userId,
      appSessionId,
    });
  }

  /**
   * GET /lightning-node/detail/:id
   * Get single Lightning Node by ID
   */
  @Get('detail/:id')
  async findById(@Param('id') id: string) {
    return await this.lightningNodeService.findById(id);
  }

  /**
   * GET /lightning-node/:userId
   * Get all Lightning Nodes for a user
   *
   * NOTE: Keep this route last so it doesn't shadow more specific routes like
   * `/lightning-node/invited/:userId` and `/lightning-node/detail/:id`.
   */
  @Get(':userId')
  async findByUserId(@Param('userId') userId: string) {
    return await this.lightningNodeService.findByUserId(userId);
  }
}
