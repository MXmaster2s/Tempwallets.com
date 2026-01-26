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
  BadRequestException,
} from '@nestjs/common';
import { LightningNodeService } from './lightning-node.service.js';
import { FundChannelDto } from './dto/index.js';

@Controller('lightning-node')
export class LightningNodeController {
  constructor(private readonly lightningNodeService: LightningNodeService) {}

  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  async authenticate(@Body() dto: { userId: string; chain?: string; sessionKey?: string; jwtToken?: string; expiresAt?: number }) {
    // If session key data is provided, try to restore it
    if (dto.sessionKey && dto.jwtToken && dto.expiresAt) {
      const now = Date.now();
      if (dto.expiresAt > now) {
        // Session is still valid, return it
        return {
          ok: true,
          authenticated: true,
          sessionKey: dto.sessionKey,
          jwtToken: dto.jwtToken,
          expiresAt: dto.expiresAt,
          message: 'Session restored from cache'
        };
      }
    }

    // Otherwise, perform full authentication
    return await this.lightningNodeService.authenticate(dto.userId, dto.chain || 'base');
  }

  @Get('discover/:userId')
  @HttpCode(HttpStatus.OK)
  async discover(@Param('userId') userId: string, @Query('chain') chain?: string) {
    return {
      ok: true,
      sessions: [],
      activeSessions: [],
      invitations: [],
      message: 'Phase 1: Session discovery not implemented yet'
    };
  }

  @Post('fund-channel')
  @HttpCode(HttpStatus.OK)
  async fundChannel(@Body(ValidationPipe) dto: FundChannelDto) {
    return await this.lightningNodeService.fundChannel(dto);
  }

  @Get('custody-balance')
  @HttpCode(HttpStatus.OK)
  async getCustodyBalance(
    @Query('userId') userId: string,
    @Query('chain') chain: string,
    @Query('asset') asset: string,
  ) {
    if (!userId || !chain || !asset) {
      throw new BadRequestException('userId, chain, and asset are required');
    }
    return await this.lightningNodeService.getCustodyBalance(userId, chain, asset);
  }

  @Get('unified-balance')
  @HttpCode(HttpStatus.OK)
  async getUnifiedBalance(
    @Query('userId') userId: string,
    @Query('chain') chain: string,
  ) {
    if (!userId || !chain) {
      throw new BadRequestException('userId and chain are required');
    }
    return await this.lightningNodeService.getUnifiedBalance(userId, chain);
  }
}
