import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { WalletConnectService } from './walletconnect.service.js';
import { SessionService } from './session.service.js';
import { SigningService } from './signing.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator.js';
import { UserId } from '../auth/decorators/user-id.decorator.js';
import {
  ApproveProposalDto,
  RejectProposalDto,
  SignRequestDto,
} from './dto/index.js';

@Controller('walletconnect')
export class WalletConnectController {
  private readonly logger = new Logger(WalletConnectController.name);

  constructor(
    private readonly wcService: WalletConnectService,
    private readonly sessionService: SessionService,
    private readonly signingService: SigningService,
  ) {}

  /**
   * Get all EIP-7702 accounts formatted for WalletConnect
   * Returns CAIP-10 formatted account IDs
   */
  @Get('accounts')
  @HttpCode(HttpStatus.OK)
  async getAccounts(
    @UserId() userId?: string,
    @Body() body?: { userId?: string },
  ) {
    const finalUserId = userId || body?.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    // Getting WalletConnect accounts

    const accounts = await this.wcService.getEip7702Accounts(finalUserId);

    return {
      accounts,
      metadata: {
        name: 'Tempwallets',
        description: 'EIP-7702 Smart Account Wallet',
        url: 'https://tempwallets.com',
        icons: ['https://tempwallets.com/tempwallets-logo.png'],
      },
    };
  }

  /**
   * Get all active sessions for a user
   */
  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  async getSessions(
    @UserId() userId?: string,
    @Body() body?: { userId?: string },
  ) {
    const finalUserId = userId || body?.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    // Getting WalletConnect sessions

    const sessions = await this.sessionService.getActiveSessions(finalUserId);

    return {
      sessions: sessions.map((s) => ({
        topic: s.topic,
        dapp: {
          name: s.dappName,
          url: s.dappUrl,
          icon: s.dappIcon,
        },
        approvedChains: s.approvedChains,
        expiry: s.expiry,
        lastUsed: s.lastUsedAt,
      })),
    };
  }

  /**
   * Approve a session proposal
   * Called when user approves connection request
   */
  @Post('approve-proposal')
  @HttpCode(HttpStatus.OK)
  async approveProposal(
    @UserId() userId: string | null,
    @Body() dto: ApproveProposalDto,
  ) {
    const finalUserId = userId || dto.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    // Approving proposal

    const { namespaces, session } = await this.wcService.approveProposal(
      finalUserId,
      dto.proposalId,
      dto.approvedChains,
    );

    // Save session to database
    await this.sessionService.saveSession(finalUserId, session, namespaces);

    return {
      namespaces,
      session: {
        topic: session.topic,
        expiry: session.expiry,
      },
    };
  }

  /**
   * Reject a session proposal
   */
  @Post('reject-proposal')
  @OptionalAuth()
  @HttpCode(HttpStatus.OK)
  async rejectProposal(
    @UserId() userId: string | null,
    @Body() dto: RejectProposalDto,
  ) {
    const finalUserId = userId || dto.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    // Rejecting proposal

    await this.wcService.rejectProposal(
      finalUserId,
      dto.proposalId,
      dto.reason,
    );

    return { success: true };
  }

  /**
   * Save a proposal (called by frontend when session_proposal event is received)
   */
  @Post('save-proposal')
  @HttpCode(HttpStatus.OK)
  async saveProposal(
    @UserId() userId: string | null,
    @Body()
    body: {
      userId?: string;
      proposalId: number;
      proposer: any;
      requiredNamespaces: any;
      optionalNamespaces: any;
      expiresAt: string;
    },
  ) {
    const finalUserId = userId || body.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    await this.wcService.saveProposal(
      finalUserId,
      body.proposalId,
      body.proposer,
      body.requiredNamespaces,
      body.optionalNamespaces,
      new Date(body.expiresAt),
    );

    return { success: true };
  }

  /**
   * Save a session (called by frontend after WalletKit.approveSession)
   */
  @Post('save-session')
  @HttpCode(HttpStatus.OK)
  async saveSession(
    @UserId() userId: string | null,
    @Body()
    body: {
      userId?: string;
      session: any;
      namespaces: any;
    },
  ) {
    const finalUserId = userId || body.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    await this.sessionService.saveSession(
      finalUserId,
      body.session,
      body.namespaces,
    );

    return { success: true };
  }

  /**
   * Sign a transaction or message
   * Called when user approves signing request
   */
  @Post('sign')
  @HttpCode(HttpStatus.OK)
  async signRequest(
    @UserId() userId: string | null,
    @Body() dto: SignRequestDto,
  ) {
    const finalUserId = userId || dto.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    // Signing request

    const signature = await this.signingService.signRequest(
      finalUserId,
      dto.topic,
      dto.requestId,
      dto.method,
      dto.params,
      dto.chainId,
    );

    return { signature };
  }

  /**
   * Disconnect a session
   */
  @Delete('sessions/:topic')
  @HttpCode(HttpStatus.OK)
  async disconnectSession(
    @UserId() userId: string | null,
    @Param('topic') topic: string,
    @Body() body?: { userId?: string },
  ) {
    const finalUserId = userId || body?.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    // Disconnecting session

    await this.sessionService.disconnectSession(finalUserId, topic);

    return { success: true };
  }

  /**
   * Get pending proposals for a user
   */
  @Get('proposals/pending')
  @HttpCode(HttpStatus.OK)
  async getPendingProposals(
    @UserId() userId?: string,
    @Body() body?: { userId?: string },
  ) {
    const finalUserId = userId || body?.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    // Getting pending proposals

    const proposals =
      await this.sessionService.getPendingProposals(finalUserId);

    return { proposals };
  }

  /**
   * Get pending signing requests for a session
   */
  @Get('sessions/:topic/requests/pending')
  @HttpCode(HttpStatus.OK)
  async getPendingRequests(
    @UserId() userId: string | null,
    @Param('topic') topic: string,
    @Body() body?: { userId?: string },
  ) {
    const finalUserId = userId || body?.userId;
    if (!finalUserId) {
      throw new Error('userId is required');
    }

    // Getting pending requests

    const requests = await this.sessionService.getPendingRequests(
      finalUserId,
      topic,
    );

    return { requests };
  }
}
