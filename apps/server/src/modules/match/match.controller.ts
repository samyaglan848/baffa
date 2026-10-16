import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Body,
  Headers,
  Inject,
  forwardRef,
  UnauthorizedException,
} from '@nestjs/common';
import { MatchService } from './match.service';
import { GameGateway } from '../../gateways/game.gateway';

@Controller('api/matches')
export class MatchController {
  constructor(
    private readonly matchService: MatchService,
    @Inject(forwardRef(() => GameGateway))
    private readonly gameGateway: GameGateway,
  ) {}

  /**
   * HTTP fallbacks used by the web client while its socket is reconnecting.
   * Every action now requires the caller's token (account token or server-issued guest token);
   * the user id / seat sent in the body is ignored and taken from the verified token instead.
   */
  private requireIdentity(authHeader?: string) {
    const identity = this.gameGateway.identityFromAuthHeader(authHeader);
    if (!identity) {
      throw new UnauthorizedException('يجب تسجيل الدخول أو الدخول كضيف أولاً');
    }
    return identity;
  }

  @Post('rematch')
  async triggerRematch(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { roomId?: string }
  ) {
    return this.gameGateway.startRematchForRoom(body?.roomId, this.requireIdentity(authHeader));
  }

  @Post('visibility')
  async handleVisibility(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { roomId?: string; isVisible?: boolean; hasWindowFocus?: boolean }
  ) {
    return this.gameGateway.handleAppVisibilityChangedDirect(body, this.requireIdentity(authHeader));
  }

  @Post('leave')
  async handleLeaveRoom(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { roomId?: string }
  ) {
    return this.gameGateway.handleLeaveRoomDirect(body?.roomId, this.requireIdentity(authHeader));
  }

  @Post('start')
  async triggerStartMatch(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { roomId?: string }
  ) {
    return this.gameGateway.startMatchForRoom(body?.roomId, this.requireIdentity(authHeader));
  }

  @Post('trigger-bot')
  async triggerBot(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { roomId?: string; forceImmediate?: boolean }
  ) {
    return this.gameGateway.triggerBotForRoom(body?.roomId, body?.forceImmediate, this.requireIdentity(authHeader));
  }

  @Post('judge-decision')
  async handleJudgeDecisionHttp(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: any
  ) {
    return this.gameGateway.executeJudgeDecision(body, this.requireIdentity(authHeader));
  }

  @Post('next-round')
  async handleNextRoundHttp(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { roomId?: string }
  ) {
    return this.gameGateway.handleNextRoundHttp(body?.roomId, this.requireIdentity(authHeader));
  }

  @Post('play-tile')
  async handlePlayTileHttp(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { roomId?: string; tile?: any; end?: any; sequenceNumber?: number }
  ) {
    return this.gameGateway.handlePlayTileHttp(body, this.requireIdentity(authHeader));
  }

  @Post('pass-turn')
  async handlePassTurnHttp(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { roomId?: string; sequenceNumber?: number }
  ) {
    return this.gameGateway.handlePassTurnHttp(body, this.requireIdentity(authHeader));
  }

  @Get('active-state/:roomId')
  async getActiveState(
    @Headers('authorization') authHeader: string | undefined,
    @Param('roomId') roomId: string
  ) {
    return this.gameGateway.getActiveGameStateForRoom(roomId, this.requireIdentity(authHeader));
  }

  @Get('history')
  async getHistory(
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const rawPage = page ? parseInt(page, 10) : 1;
    const rawLimit = limit ? parseInt(limit, 10) : 10;
    const pageNum = isNaN(rawPage) ? 1 : Math.max(1, rawPage);
    const limitNum = isNaN(rawLimit) ? 10 : Math.min(50, Math.max(1, rawLimit));
    return this.matchService.getPaginatedHistory(userId, pageNum, limitNum);
  }

  @Get('details/:matchId')
  async getDetails(@Param('matchId') matchId: string) {
    return this.matchService.getMatchDetails(matchId);
  }

  @Get('profile/:userId')
  async getProfile(@Param('userId') userId: string) {
    return this.matchService.getProfile(userId);
  }

  @Get('stats/:userId')
  async getUserStatistics(@Param('userId') userId: string) {
    return this.matchService.getUserStatistics(userId);
  }

  @Get('head-to-head')
  async getHeadToHead(
    @Query('userId1') userId1: string,
    @Query('userId2') userId2: string
  ) {
    return this.matchService.getHeadToHead(userId1, userId2);
  }
}
