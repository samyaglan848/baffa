import { Controller, Get, Param, Query, Post, Body, Inject, forwardRef } from '@nestjs/common';
import { MatchService } from './match.service';
import { GameGateway } from '../../gateways/game.gateway';

@Controller('api/matches')
export class MatchController {
  constructor(
    private readonly matchService: MatchService,
    @Inject(forwardRef(() => GameGateway))
    private readonly gameGateway: GameGateway,
  ) {}

  @Post('rematch')
  async triggerRematch(
    @Body() body: { roomId?: string; userId?: string; username?: string }
  ) {
    return this.gameGateway.startRematchForRoom(body?.roomId, body?.userId, body?.username);
  }

  @Post('visibility')
  async handleVisibility(
    @Body() body: { roomId?: string; userId?: string; username?: string; isVisible?: boolean; hasWindowFocus?: boolean }
  ) {
    return this.gameGateway.handleAppVisibilityChangedDirect(body);
  }

  @Post('leave')
  async handleLeaveRoom(
    @Body() body: { roomId?: string; userId?: string }
  ) {
    return this.gameGateway.handleLeaveRoomDirect(body?.roomId, body?.userId);
  }

  @Post('start')
  async triggerStartMatch(
    @Body() body: { roomId?: string; userId?: string; username?: string; role?: string }
  ) {
    return this.gameGateway.startMatchForRoom(body?.roomId, body?.userId, body?.username, body?.role);
  }

  @Post('trigger-bot')
  async triggerBot(
    @Body() body: { roomId?: string; forceImmediate?: boolean }
  ) {
    return this.gameGateway.triggerBotForRoom(body?.roomId, body?.forceImmediate);
  }

  @Post('judge-decision')
  async handleJudgeDecisionHttp(
    @Body() body: any
  ) {
    return this.gameGateway.executeJudgeDecision(body);
  }

  @Post('next-round')
  async handleNextRoundHttp(
    @Body() body: { roomId?: string; userId?: string; user?: any }
  ) {
    return this.gameGateway.handleNextRoundHttp(body?.roomId, body?.userId || body?.user?.id);
  }

  @Post('play-tile')
  async handlePlayTileHttp(
    @Body() body: { roomId?: string; seat?: number; tile?: any; end?: any; userId?: string }
  ) {
    return this.gameGateway.handlePlayTileHttp(body);
  }

  @Post('pass-turn')
  async handlePassTurnHttp(
    @Body() body: { roomId?: string; seat?: number; userId?: string }
  ) {
    return this.gameGateway.handlePassTurnHttp(body);
  }

  @Get('active-state/:roomId')
  async getActiveState(
    @Param('roomId') roomId: string,
    @Query('userId') userId?: string,
    @Query('role') role?: string,
    @Query('username') username?: string
  ) {
    return this.gameGateway.getActiveGameStateForRoom(roomId, userId, role, username);
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
