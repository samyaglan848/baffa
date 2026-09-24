import { Injectable, Logger } from '@nestjs/common';
import {
  BotChatMessage,
  BotId,
  ChainEnd,
  DominoTile,
  MatchResult,
  NotificationPayload,
  PlayerSeat,
  RoundResult,
  SanitizedGameState,
  TeamId,
  UserRole,
} from '@baffa/shared';
import { DominoGameEngine } from '@baffa/engine';
import { BotService, BotDecision } from './bot.service';
import { RoomService } from '../room/room.service';
import { AnticheatService } from '../anticheat/anticheat.service';
import { MatchService } from '../match/match.service';

export interface GameSessionCallbacks {
  broadcastStateToRoom: (roomId: string) => void;
  emitErrorToPlayer: (socketId: string, error: string) => void;
  broadcastBotChat: (roomId: string, chat: BotChatMessage) => void;
  broadcastStatsUpdated: (roomId: string) => void;
  broadcastNotification?: (roomId: string, notification: NotificationPayload) => void;
}

@Injectable()
export class GameSessionService {
  private readonly logger = new Logger(GameSessionService.name);
  private sessions: Map<string, DominoGameEngine> = new Map();
  private botTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private turnTimers: Map<string, NodeJS.Timeout> = new Map();
  private callbacks?: GameSessionCallbacks;

  constructor(
    private readonly botService: BotService,
    private readonly roomService: RoomService,
    private readonly anticheatService: AnticheatService,
    private readonly matchService: MatchService
  ) {}

  public setCallbacks(callbacks: GameSessionCallbacks) {
    this.callbacks = callbacks;
  }

  public getSession(roomId: string): DominoGameEngine | undefined {
    return this.sessions.get(roomId);
  }

  /**
   * Starts a new match in the specified room.
   */
  public startMatch(roomId: string, adminId: string): DominoGameEngine {
    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const existingEngine = this.sessions.get(roomId);
    if (existingEngine && existingEngine.getStatus() === 'PLAYING') {
      this.logger.log(`Match already in progress in room ${roomId}, returning existing engine.`);
      return existingEngine;
    }

    // Always clear existing bot timeouts and turn timers before starting a fresh match
    const existingTimeout = this.botTimeouts.get(roomId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.botTimeouts.delete(roomId);
    }
    this.clearTurnTimer(roomId);

    const isObserver = Boolean(room.judge) || Boolean(room.spectator) || (room.spectators && room.spectators.length > 0);
    const humanSeats = room.seats.filter(
      (s) =>
        s.occupied &&
        !s.isBot &&
        s.playerId !== room.judge?.userId &&
        s.username !== room.judge?.username &&
        s.playerId !== room.spectator?.userId &&
        s.username !== room.spectator?.username
    );
    const isSoloHuman = humanSeats.length <= 1;
    const allBotsOccupied = humanSeats.length === 0;
    const hasJudge = Boolean(room.judge);
    const isJudgeUser =
      room.judge &&
      (room.judge.userId === adminId || room.judge.username === adminId);

    const isAuthorized =
      room.currentAdminId === adminId ||
      room.originalAdminId === adminId ||
      room.ownerId === adminId ||
      isJudgeUser ||
      hasJudge ||
      allBotsOccupied ||
      isSoloHuman ||
      room.seats.some((s) => s.playerId === adminId);

    if (!isAuthorized) {
      throw new Error('Only the room admin or presiding judge can start the match');
    }

    // Guarantee all 4 seats are occupied (auto-fill empty slots with bots)
    const defaultBots: { name: string; botId: BotId; avatar: string }[] = [
      { name: 'الرايق', botId: 'EL_RAYEQ', avatar: 'bot-rayeq' },
      { name: 'القط', botId: 'EL_QETT', avatar: 'bot-qett' },
      { name: 'السامي', botId: 'EL_SAMY', avatar: 'bot-samy' },
      { name: 'رقم واحد', botId: 'RAQAM_WAHED', avatar: 'bot-raqam-wahed' },
    ];

    room.seats.forEach((seat, idx) => {
      // Check if this seat is occupied by a judge or spectator who is NOT a table player
      const isJudgeOccupying = Boolean(
        room.judge &&
        (seat.playerId === room.judge.userId || (seat.username && seat.username === room.judge.username))
      );
      const isSpectatorOccupying = Boolean(
        room.spectator &&
        (seat.playerId === room.spectator.userId || (seat.username && seat.username === room.spectator.username))
      );

      // Check if a real human player is genuinely seated here
      const isRealHumanSeated = Boolean(
        seat.occupied &&
        !seat.isBot &&
        seat.playerId &&
        !seat.playerId.startsWith('bot_') &&
        !isJudgeOccupying &&
        !isSpectatorOccupying
      );

      // Only fill with a bot if the seat is EMPTY, already a bot, or occupied by a referee/spectator!
      if (!isRealHumanSeated) {
        const botConfig = defaultBots[idx % defaultBots.length];
        seat.occupied = true;
        seat.playerId = `bot_${seat.seat}`;
        seat.username = botConfig.name;
        seat.avatar = botConfig.avatar;
        seat.isBot = true;
        seat.botId = botConfig.botId;
        seat.isReady = true;
        seat.isConnected = true;
        seat.presence = 'ONLINE';
        seat.isTemporarilyBotControlled = false;
      } else {
        // Human player is active and ready
        seat.isBot = false;
        seat.isReady = true;
        seat.isConnected = true;
        seat.isTemporarilyBotControlled = false;
      }
    });

    const occupiedSeats = room.seats.filter((s) => s.occupied);
    if (occupiedSeats.length < 4) {
      throw new Error('All 4 seats must be occupied (by players or bots) to start a match');
    }

    const existingBot = this.botTimeouts.get(roomId);
    if (existingBot) {
      clearTimeout(existingBot);
      this.botTimeouts.delete(roomId);
    }
    this.clearTurnTimer(roomId);

    const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const engine = new DominoGameEngine({
      matchId,
      roomId,
      targetScore: room.settings.targetScore,
      turnTimeLimit: room.settings.roundTimerSeconds || 20,
      players: room.seats.map((s) => ({
        seat: s.seat,
        playerId: s.playerId || `bot_${s.seat}`,
        username: s.username || `Player ${s.seat + 1}`,
        avatar: s.avatar || `avatar-${s.seat + 1}`,
        isBot: s.isBot,
        botId: s.botId || 'EL_SAMY',
        isConnected: s.isConnected,
        isReady: s.isReady,
      })),
    });

    engine.startMatch();

    // STRICT GUARANTEE: In Round 1, immediately find the seat holding [6|6] and assign turn & starter to that exact seat!
    const dealtHands = (engine as any).hands as DominoTile[][];
    if (dealtHands && engine.getRoundNumber() === 1) {
      for (let s = 0; s < 4; s++) {
        if (dealtHands[s]?.some((t) => (t[0] === 6 && t[1] === 6) || (t[1] === 6 && t[0] === 6))) {
          (engine as any).starterSeat = s;
          (engine as any).currentTurnSeat = s;
          break;
        }
      }
    }

    this.sessions.set(roomId, engine);
    this.roomService.updateMatchStatus(roomId, 'PLAYING');

    this.anticheatService.logAudit('MATCH_START', {
      userId: adminId,
      roomId,
      matchId,
      metadata: { targetScore: room.settings.targetScore },
    });

    this.logger.log(`Match started in room ${roomId} (Match ID: ${matchId})`);

    // Proactively broadcast initial state to ensure clients receive real matchId and starter info
    this.callbacks?.broadcastStateToRoom(roomId);

    // Start turn timer and trigger bot immediately so opening move occurs in exactly 2000ms
    const activeEngine = this.sessions.get(roomId);
    if (activeEngine && activeEngine.getStatus() === 'PLAYING') {
      this.startTurnTimer(roomId);
      this.checkAndTriggerBotTurn(roomId, true);
    }

    try {
      require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[START-MATCH] room=${roomId}\n`);
    } catch(e) {}

    return engine;
  }

  /**
   * Starts a completely fresh Rematch ("Play Again") in the room.
   * Guarantees that zero old hands, scores, turns, cheating states, or timers leak into the new match.
   */
  public startRematch(
    roomId: string,
    adminId?: string,
    callerPlayer?: { userId: string; username: string; avatar: string }
  ): DominoGameEngine {
    const existingTimeout = this.botTimeouts.get(roomId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.botTimeouts.delete(roomId);
    }
    this.clearTurnTimer(roomId);

    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Guarantee room has a valid currentAdminId so startMatch never fails
    const effectiveAdminId = room.currentAdminId || adminId || room.originalAdminId || room.ownerId || callerPlayer?.userId || 'admin';
    room.currentAdminId = effectiveAdminId;

    // Ensure the caller is properly seated if provided and not Judge or Spectator
    if (callerPlayer?.userId) {
      const isJudge =
        room.judge?.userId === callerPlayer.userId ||
        Boolean(room.judge && callerPlayer.username && room.judge.username === callerPlayer.username);
      const isSpectator =
        room.spectator?.userId === callerPlayer.userId ||
        Boolean(room.spectator && callerPlayer.username && room.spectator.username === callerPlayer.username);

      if (!isJudge && !isSpectator) {
        let existingSeat = room.seats.find(
          (s) =>
            s.playerId === callerPlayer.userId ||
            (!s.isBot && callerPlayer.username && s.username === callerPlayer.username)
        );
        if (!existingSeat) {
          // Seat them in first available seat or Seat 0
          existingSeat = room.seats.find((s) => !s.occupied || s.isBot) || room.seats[0];
          existingSeat.occupied = true;
          existingSeat.playerId = callerPlayer.userId;
          existingSeat.username = callerPlayer.username;
          existingSeat.avatar = callerPlayer.avatar;
        }
        existingSeat.occupied = true;
        existingSeat.isBot = false;
        existingSeat.isReady = true;
        existingSeat.isConnected = true;
        existingSeat.presence = 'IN_ROOM';
        existingSeat.isTemporarilyBotControlled = false;
      }
    }

    // Ensure all 4 seats are occupied, filling any unseated positions with default bots
    const defaultBots: { name: string; botId: BotId; avatar: string }[] = [
      { name: 'القط', botId: 'EL_QETT', avatar: 'bot-qett' },
      { name: 'السامي', botId: 'EL_SAMY', avatar: 'bot-samy' },
      { name: 'رقم واحد', botId: 'RAQAM_WAHED', avatar: 'bot-raqam-wahed' },
      { name: 'الرايق', botId: 'EL_RAYEQ', avatar: 'bot-rayeq' },
    ];
    room.seats.forEach((seat, idx) => {
      if (!seat.occupied || (!seat.playerId && !seat.isBot)) {
        const botConfig = defaultBots[idx % defaultBots.length];
        seat.occupied = true;
        seat.playerId = `bot_${seat.seat}`;
        seat.username = botConfig.name;
        seat.avatar = botConfig.avatar;
        seat.isBot = true;
        seat.botId = botConfig.botId;
        seat.isReady = true;
        seat.isConnected = true;
        seat.presence = 'ONLINE';
      }
      seat.isReady = true;
      seat.isConnected = true;
      seat.isTemporarilyBotControlled = false;
    });

    room.disconnectGraces = [];
    room.matchStatus = 'PLAYING';

    return this.startMatch(roomId, effectiveAdminId);
  }

  /**
   * Handles a player's tile placement.
   */
  public playTile(
    roomId: string,
    seat: PlayerSeat,
    tile: DominoTile,
    end?: ChainEnd,
    clientSequence?: number
  ) {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'No active match found for this room' };
    }

    const telemetry = this.anticheatService.evaluateAction({
      userId: `seat_${seat}`,
      roomId,
      action: 'PLAY_TILE',
      clientSequence,
      expectedSequence: engine.getSequenceNumber(),
      timestamp: Date.now(),
    });

    if (!telemetry.isPermitted) {
      return { success: false, error: telemetry.warning || 'Move rejected by anti-cheat' };
    }

    const result = engine.playTile(seat, tile, end);
    if (result.success) {
      this.anticheatService.logAudit('PLAY_TILE', {
        roomId,
        matchId: engine.getMatchId(),
        metadata: { seat, tile, end, round: engine.getRoundNumber() },
      });

      this.clearTurnTimer(roomId);
      this.clearBotTimeout(roomId);
      if (engine.getStatus() === 'MATCH_FINISHED') {
        this.matchService.finalizeMatch(engine);
        this.callbacks?.broadcastStatsUpdated(roomId);
        this.triggerBotRoundEndReaction(roomId);
      } else if (engine.getStatus() === 'PLAYING') {
        this.startTurnTimer(roomId);
      } else if (engine.getStatus() === 'ROUND_FINISHED') {
        // Auto-advance for bot/judge matches (normal win condition)
        this.triggerBotRoundEndReaction(roomId);
        this.autoAdvanceRoundIfBotMatch(roomId, 4500);
      }

      this.callbacks?.broadcastStateToRoom(roomId);
      this.checkAndTriggerBotTurn(roomId);
    }

    return result;
  }

  /**
   * Handles a player's pass.
   */
  public passTurn(roomId: string, seat: PlayerSeat, clientSequence?: number) {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'No active match found for this room' };
    }

    const telemetry = this.anticheatService.evaluateAction({
      userId: `seat_${seat}`,
      roomId,
      action: 'PASS_TURN',
      clientSequence,
      expectedSequence: engine.getSequenceNumber(),
      timestamp: Date.now(),
    });

    if (!telemetry.isPermitted) {
      return { success: false, error: telemetry.warning || 'Pass rejected by anti-cheat' };
    }

    const result = engine.passTurn(seat);
    if (result.success) {
      this.anticheatService.logAudit('PASS_TURN', {
        roomId,
        matchId: engine.getMatchId(),
        metadata: { seat, round: engine.getRoundNumber() },
      });

      this.clearTurnTimer(roomId);
      this.clearBotTimeout(roomId);
      if (engine.getStatus() === 'MATCH_FINISHED') {
        this.matchService.finalizeMatch(engine);
        this.callbacks?.broadcastStatsUpdated(roomId);
        this.triggerBotRoundEndReaction(roomId);
      } else if (engine.getStatus() === 'PLAYING') {
        this.startTurnTimer(roomId);
        this.triggerBotOpponentPassReaction(roomId, seat);
      } else if (engine.getStatus() === 'ROUND_FINISHED') {
        // Auto-advance for bot/judge matches (blocked round)
        this.triggerBotRoundEndReaction(roomId);
        this.autoAdvanceRoundIfBotMatch(roomId, 4500);
      }

      this.callbacks?.broadcastStateToRoom(roomId);
      this.checkAndTriggerBotTurn(roomId);
    }

    return result;
  }

  /**
   * Server-authoritative Judge Cheating Penalty.
   */
  public penalizeCheating(
    roomId: string,
    judgeId: string,
    offendingSeat: PlayerSeat,
    reason: string
  ) {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'No active match found for this room' };
    }

    const result = engine.penalizeCheating(judgeId, offendingSeat, reason);
    if (result.success) {
      this.anticheatService.logAudit('JUDGE_PENALIZE_CHEATING', {
        userId: judgeId,
        roomId,
        matchId: engine.getMatchId(),
        metadata: { offendingSeat, reason, penaltyResult: result.roundResult },
      });

      this.clearTurnTimer(roomId);
      const existingBot = this.botTimeouts.get(roomId);
      if (existingBot) {
        clearTimeout(existingBot);
        this.botTimeouts.delete(roomId);
      }

      if (engine.getStatus() === 'MATCH_FINISHED') {
        this.matchService.finalizeMatch(engine);
        this.callbacks?.broadcastStatsUpdated(roomId);
        this.callbacks?.broadcastStateToRoom(roomId);
      } else {
        // Broadcast updated (ROUND_FINISHED) state first so clients see the penalty result
        this.callbacks?.broadcastStateToRoom(roomId);
        // For bot/judge matches: auto-advance to next round after display window
        this.autoAdvanceRoundIfBotMatch(roomId, 4500);
      }
    }

    return result;
  }

  /**
   * Judge issues a yellow card warning to a player.
   * Warning 1: Warning alert.
   * Warning 2: Automatic cheating forfeiture with opposing team points.
   */
  public warnPlayer(
    roomId: string,
    judgeId: string,
    seat: PlayerSeat,
    reason: string = 'مخالفة أو اشتباه في الغش'
  ): {
    success: boolean;
    warningCount?: number;
    isCheatingTriggered?: boolean;
    error?: string;
    roundResult?: RoundResult;
    matchResult?: MatchResult;
  } {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'لا توجد مباراة نشطة في هذه الغرفة' };
    }

    const result = engine.warnPlayer(judgeId, seat, reason);
    if (result.success) {
      this.anticheatService.logAudit('JUDGE_WARN_PLAYER', {
        userId: judgeId,
        roomId,
        matchId: engine.getMatchId(),
        metadata: { seat, reason, warningCount: result.warningCount, isCheatingTriggered: result.isCheatingTriggered },
      });

      if (result.isCheatingTriggered) {
        this.clearTurnTimer(roomId);
        const existingBot = this.botTimeouts.get(roomId);
        if (existingBot) {
          clearTimeout(existingBot);
          this.botTimeouts.delete(roomId);
        }

        if (engine.getStatus() === 'MATCH_FINISHED') {
          this.matchService.finalizeMatch(engine);
          this.callbacks?.broadcastStatsUpdated(roomId);
          this.callbacks?.broadcastStateToRoom(roomId);
        } else {
          // Broadcast the ROUND_FINISHED state, then auto-advance
          this.callbacks?.broadcastStateToRoom(roomId);
          this.autoAdvanceRoundIfBotMatch(roomId, 4500);
        }
      } else {
        // Warning 1 only — broadcast and keep game running
        this.callbacks?.broadcastStateToRoom(roomId);
        // Ensure the active bot turn continues smoothly
        if (engine.getStatus() === 'PLAYING') {
          this.checkAndTriggerBotTurn(roomId, true);
        }
      }
    }

    return result;
  }

  /**
   * Judge issues a direct red card to a player for confirmed cheating.
   */
  public directRedCard(
    roomId: string,
    judgeId: string,
    seat: PlayerSeat,
    reason: string = 'كارت أحمر مباشر - احتساب حالة غش صريحة'
  ) {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'لا توجد مباراة نشطة في هذه الغرفة' };
    }

    const result = engine.directRedCard(judgeId, seat, reason);
    if (result.success) {
      this.anticheatService.logAudit('JUDGE_DIRECT_RED_CARD', {
        userId: judgeId,
        roomId,
        matchId: engine.getMatchId(),
        metadata: { seat, reason, penaltyResult: result.roundResult },
      });

      this.clearTurnTimer(roomId);
      const existingBot = this.botTimeouts.get(roomId);
      if (existingBot) {
        clearTimeout(existingBot);
        this.botTimeouts.delete(roomId);
      }

      if (engine.getStatus() === 'MATCH_FINISHED') {
        this.matchService.finalizeMatch(engine);
        this.callbacks?.broadcastStatsUpdated(roomId);
        this.callbacks?.broadcastStateToRoom(roomId);
      } else {
        // Broadcast the ROUND_FINISHED state, then auto-advance for bot/judge matches
        this.callbacks?.broadcastStateToRoom(roomId);
        this.autoAdvanceRoundIfBotMatch(roomId, 4500);
      }
    }

    return result;
  }

  /**
   * Judge cancels current round and redeals it.
   */
  public voidCurrentRound(roomId: string, judgeId: string, reason?: string) {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'لا توجد مباراة نشطة' };
    }

    const result = engine.voidCurrentRound();
    if (result.success) {
      this.anticheatService.logAudit('JUDGE_VOID_ROUND', {
        userId: judgeId,
        roomId,
        matchId: engine.getMatchId(),
        metadata: { reason },
      });

      this.clearTurnTimer(roomId);
      this.clearBotTimeout(roomId);

      // Broadcast fresh redealt state first so clients update their boards
      this.callbacks?.broadcastStateToRoom(roomId);

      const activeEngine = this.sessions.get(roomId);
      if (activeEngine && activeEngine.getStatus() === 'PLAYING') {
        this.startTurnTimer(roomId);
        this.checkAndTriggerBotTurn(roomId, true);
      }
    }

    return result;
  }

  /**
   * Automatically advances to the next round for bot-only / judge-supervised matches.
   * Called after referee penalty actions that set the engine to ROUND_FINISHED.
   * This ensures bots keep playing without waiting for a client REQUEST_NEXT_ROUND event.
   */
  private autoAdvanceRoundIfBotMatch(roomId: string, delayMs: number) {
    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    // Only auto-advance when all seats are bots or a judge is presiding
    const isBotOrJudgeMatch = room.seats.every((s) => s.isBot) || Boolean(room.judge);
    if (!isBotOrJudgeMatch) return;

    setTimeout(() => {
      const engine = this.sessions.get(roomId);
      if (!engine || engine.getStatus() !== 'ROUND_FINISHED') return;

      const nextResult = engine.nextRound();
      if (nextResult.success) {
        this.logger.log(`Auto-advanced to round ${engine.getRoundNumber()} in bot/judge room ${roomId}`);
        this.clearBotTimeout(roomId);
        this.clearTurnTimer(roomId);
        this.callbacks?.broadcastStateToRoom(roomId);
        const activeEngine = this.sessions.get(roomId);
        if (activeEngine && activeEngine.getStatus() === 'PLAYING') {
          this.startTurnTimer(roomId);
          this.checkAndTriggerBotTurn(roomId, true);
        }
      }
    }, delayMs);
  }

  /**
   * Judge grants extra thinking time (+20s).
   */
  public grantExtraTime(roomId: string, seconds: number = 20) {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'لا توجد مباراة نشطة' };
    }

    const result = engine.grantExtraTime(seconds);
    if (result.success) {
      this.clearTurnTimer(roomId);
      const room = this.roomService.getRoom(roomId);
      const baseSecs = room?.settings?.roundTimerSeconds || 20;
      const timeout = setTimeout(() => {
        this.handleTurnTimeout(roomId);
      }, (baseSecs + seconds) * 1000);
      this.turnTimers.set(roomId, timeout);

      this.callbacks?.broadcastStateToRoom(roomId);

      if (engine.getStatus() === 'PLAYING') {
        this.checkAndTriggerBotTurn(roomId, true);
      }
    }

    return result;
  }

  /**
   * Judge terminates match immediately.
   */
  public terminateMatch(
    roomId: string,
    judgeId: string,
    winnerTeam?: TeamId,
    reason?: string
  ): {
    success: boolean;
    matchResult?: MatchResult;
    error?: string;
  } {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'لا توجد مباراة نشطة' };
    }

    const result = engine.terminateMatch(winnerTeam, reason);
    if (result.success) {
      this.anticheatService.logAudit('JUDGE_TERMINATE_MATCH', {
        userId: judgeId,
        roomId,
        matchId: engine.getMatchId(),
        metadata: { winnerTeam, reason, matchResult: result.matchResult },
      });

      this.clearTurnTimer(roomId);
      const existingBot = this.botTimeouts.get(roomId);
      if (existingBot) {
        clearTimeout(existingBot);
        this.botTimeouts.delete(roomId);
      }

      this.matchService.finalizeMatch(engine);
      this.callbacks?.broadcastStatsUpdated(roomId);
      this.callbacks?.broadcastStateToRoom(roomId);
    }

    return result;
  }

  /**
   * Judge updates player seat mute status.
   */
  public setPlayerMute(
    roomId: string,
    seat: PlayerSeat,
    muteType: 'CHAT' | 'REACTIONS' | 'VOICE',
    isMuted: boolean
  ) {
    const engine = this.sessions.get(roomId);
    if (engine) {
      engine.setPlayerMute(seat, muteType, isMuted);
      this.callbacks?.broadcastStateToRoom(roomId);
    }
  }

  /**
   * Updates player seat metadata (sub with bot or restored player).
   */
  public updateSeatMetadata(roomId: string, seat: PlayerSeat, updates: any) {
    const engine = this.sessions.get(roomId);
    if (engine) {
      engine.updateSeatPlayer(seat, updates);
      if (updates.isBot && engine.getCurrentTurnSeat() === seat) {
        this.checkAndTriggerBotTurn(roomId);
      }
      this.callbacks?.broadcastStateToRoom(roomId);
    }
  }

  /**
   * Enables or disables bot takeover for a disconnected/reconnecting seat.
   * STRICT CONSTRAINT: Does NOT alter the player's underlying hand tiles.
   */
  public setBotTakeover(roomId: string, seat: PlayerSeat, active: boolean) {
    const engine = this.sessions.get(roomId);
    if (engine) {
      engine.setBotTakeover(seat, active);
      this.callbacks?.broadcastStateToRoom(roomId);

      if (!active) {
        this.clearBotTimeout(roomId);
      }
    }
  }

  /**
   * Starts the next round of an ongoing match.
   */
  public requestNextRound(roomId: string, userId: string) {
    const engine = this.sessions.get(roomId);
    if (!engine) {
      return { success: false, error: 'No active match found' };
    }

    const result = engine.nextRound();
    if (result.success) {
      this.anticheatService.logAudit('NEXT_ROUND', {
        userId,
        roomId,
        matchId: engine.getMatchId(),
        metadata: { round: engine.getRoundNumber() },
      });

      this.clearTurnTimer(roomId);
      this.clearBotTimeout(roomId);

      this.callbacks?.broadcastStateToRoom(roomId);

      const activeEngine = this.sessions.get(roomId);
      if (activeEngine && activeEngine.getStatus() === 'PLAYING') {
        this.startTurnTimer(roomId);
        this.checkAndTriggerBotTurn(roomId, true);
      }
    }

    return result;
  }

  /**
   * Evaluates if the current turn belongs to a bot (or a bot-controlled player) and schedules its move.
   */
  public checkAndTriggerBotTurn(roomId: string, force = false, forceImmediate = false) {
    const engine = this.sessions.get(roomId);
    this.logger.log(`[BOT-TRIGGER] room=${roomId} force=${force} forceImmediate=${forceImmediate} status=${engine?.getStatus() ?? 'NO_ENGINE'} seat=${engine?.getCurrentTurnSeat() ?? 'N/A'}`);
    try {
      require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[BOT-TRIGGER] room=${roomId} force=${force} forceImmediate=${forceImmediate} status=${engine?.getStatus() ?? 'NO_ENGINE'} seat=${engine?.getCurrentTurnSeat() ?? 'N/A'}\n`);
    } catch(e) {}
    if (!engine || engine.getStatus() !== 'PLAYING') {
      return;
    }

    // Round 1 opening safeguard: strictly ensure the turn belongs to the player holding [6|6]
    if (engine.getChain().getState().tiles.length === 0 && engine.getRoundNumber() === 1) {
      const hands = (engine as any).hands as DominoTile[][];
      if (hands) {
        for (let s = 0; s < 4; s++) {
          if (hands[s]?.some((t) => (t[0] === 6 && t[1] === 6) || (t[1] === 6 && t[0] === 6))) {
            if (engine.getCurrentTurnSeat() !== s) {
              this.logger.warn(`Aligning Round 1 starter turn from ${engine.getCurrentTurnSeat()} to seat ${s} holding [6|6]`);
              (engine as any).currentTurnSeat = s;
              (engine as any).starterSeat = s;
            }
            break;
          }
        }
      }
    }

    const currentSeat = engine.getCurrentTurnSeat();
    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    const seatInfo = room.seats[currentSeat];
    const enginePlayers = (engine as any).players;
    const enginePlayer = enginePlayers ? enginePlayers[currentSeat] : null;
    const isActualBot = Boolean(
      seatInfo &&
      seatInfo.occupied &&
      (seatInfo.isBot || (seatInfo.playerId && seatInfo.playerId.startsWith('bot_')))
    );
    if (!isActualBot) {
      return; // Turn belongs to a human player (active, away, or reconnecting) -> turn timer handles full timeout
    }

    // If an active bot timer is already running for this room:
    // Only interrupt if forceImmediate is explicitly requested (e.g. referee manual trigger).
    // Never restart or postpone an existing countdown from watchdogs or repeated triggers!
    if (this.botTimeouts.has(roomId)) {
      if (!forceImmediate) {
        return;
      }
      const existing = this.botTimeouts.get(roomId);
      if (existing) clearTimeout(existing);
      this.botTimeouts.delete(roomId);
    }

    // Natural, realistic tempo for bot moves:
    // Every bot takes ~2 seconds (1900ms - 2100ms) to evaluate, decide, and play their move
    const delayMs = forceImmediate ? 200 : Math.floor(1900 + Math.random() * 200);

    const resolvedBotId = seatInfo?.botId || enginePlayer?.botId || 'EL_SAMY';
    const timeout = setTimeout(() => {
      this.executeBotTurn(roomId, currentSeat, resolvedBotId);
    }, delayMs);

    this.botTimeouts.set(roomId, timeout);
  }

  private executeBotTurn(roomId: string, scheduledSeat: PlayerSeat, botId: BotId) {
    this.botTimeouts.delete(roomId);

    try {
      require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[EXECUTE-BOT] room=${roomId} scheduledSeat=${scheduledSeat} botId=${botId}\n`);
    } catch(e) {}

    try {
      const engine = this.sessions.get(roomId);
      if (!engine || engine.getStatus() !== 'PLAYING') return;

      const currentSeat = engine.getCurrentTurnSeat();
      // Guard 1: If the turn already advanced away from the scheduled bot seat, abort immediately
      if (currentSeat !== scheduledSeat) {
        return;
      }

      const room = this.roomService.getRoom(roomId);
      if (!room) return;

      // Round 1 opening safeguard: strictly ensure the turn belongs to the player holding [6|6]
      if (engine.getChain().getState().tiles.length === 0 && engine.getRoundNumber() === 1) {
        const hands = (engine as any).hands as DominoTile[][];
        if (hands) {
          let seatWith66: PlayerSeat | null = null;
          for (let s = 0; s < 4; s++) {
            if (hands[s]?.some((t) => (t[0] === 6 && t[1] === 6) || (t[1] === 6 && t[0] === 6))) {
              seatWith66 = s as PlayerSeat;
              break;
            }
          }
          if (seatWith66 !== null && engine.getCurrentTurnSeat() !== seatWith66) {
            this.logger.warn(`Correcting Round 1 starter turn from ${engine.getCurrentTurnSeat()} to seat ${seatWith66} holding [6|6]`);
            (engine as any).currentTurnSeat = seatWith66;
            (engine as any).starterSeat = seatWith66;
          }
        }
      }

      const activeTurnSeat = engine.getCurrentTurnSeat();
      if (activeTurnSeat !== scheduledSeat) {
        return;
      }

      const seatInfo = room.seats[activeTurnSeat];
      const enginePlayers = (engine as any).players;
      const enginePlayer = enginePlayers ? enginePlayers[activeTurnSeat] : null;
      const isActualBot = Boolean(
        seatInfo &&
        seatInfo.occupied &&
        (seatInfo.isBot || (seatInfo.playerId && seatInfo.playerId.startsWith('bot_')))
      );

      // Guard 2: If the turn belongs to a human player (active, away, or reconnecting),
      // DO NOT execute bot move and DO NOT clear or restart their active turn timer!
      if (!isActualBot) {
        return;
      }

      // Only clear turn timer when an actual bot is genuinely playing its move
      this.clearTurnTimer(roomId);

      const effectiveBotId = seatInfo?.botId || enginePlayer?.botId || botId || 'EL_SAMY';
      let decision: BotDecision;
      try {
        decision = this.botService.decideMove(engine, currentSeat, effectiveBotId);
      } catch (err: any) {
        this.logger.error(`Error in botService.decideMove for seat ${currentSeat}: ${err.message}`);
        const legal = engine.getLegalMovesForSeat(currentSeat);
        if (legal.length > 0) {
          decision = { action: 'PLAY', tile: legal[0].tile, end: legal[0].validEnds[0] || 'LEFT' };
        } else {
          decision = { action: 'PASS' };
        }
      }

      if (decision.chatMessage) {
        try {
          this.callbacks?.broadcastBotChat(roomId, decision.chatMessage);
        } catch {}
      }

      if (decision.action === 'PLAY' && decision.tile) {
        try { require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[BOT-PLAY] room=${roomId} seat=${currentSeat} tile=${JSON.stringify(decision.tile)}\n`); } catch(e) {}
        const playRes = engine.playTile(currentSeat, decision.tile, decision.end);
        if (!playRes.success) {
          this.logger.warn(`Bot move for seat ${currentSeat} returned error: ${playRes.error}, attempting legal fallback`);
          const legalMoves = engine.getLegalMovesForSeat(currentSeat);
          if (legalMoves.length > 0) {
            const fallback = legalMoves[0];
            engine.playTile(currentSeat, fallback.tile, fallback.validEnds[0] || 'LEFT');
          } else {
            engine.passTurn(currentSeat);
          }
        }

        // If game continues, check if this move forced the next player to pass (OPPONENT_PASS banter)
        if (engine.getStatus() === 'PLAYING') {
          const nextSeat = engine.getCurrentTurnSeat();
          const nextLegalMoves = engine.getLegalMovesForSeat(nextSeat);
          if (nextLegalMoves.length === 0) {
            setTimeout(() => {
              const taunt = this.botService.generateSocialReaction(engine, currentSeat, effectiveBotId, 'OPPONENT_PASS');
              if (taunt) {
                try {
                  this.callbacks?.broadcastBotChat(roomId, taunt);
                } catch {}
              }
            }, 350);
          }
        }
      } else {
        try { require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[BOT-PASS] room=${roomId} seat=${currentSeat}\n`); } catch(e) {}
        const legalMoves = engine.getLegalMovesForSeat(currentSeat);
        if (legalMoves.length > 0) {
          const fallback = legalMoves[0];
          engine.playTile(currentSeat, fallback.tile, fallback.validEnds[0] || 'LEFT');
        } else {
          engine.passTurn(currentSeat);
          this.triggerBotOpponentPassReaction(roomId, currentSeat);
        }
      }

      if (engine.getStatus() === 'MATCH_FINISHED') {
        this.matchService.finalizeMatch(engine);
        this.callbacks?.broadcastStatsUpdated(roomId);
        this.triggerBotRoundEndReaction(roomId);
      } else if (engine.getStatus() === 'PLAYING') {
        this.startTurnTimer(roomId);
      } else if (engine.getStatus() === 'ROUND_FINISHED') {
        // Auto-advance to next round for bot/judge matches
        this.triggerBotRoundEndReaction(roomId);
        this.autoAdvanceRoundIfBotMatch(roomId, 4500);
      }

      this.callbacks?.broadcastStateToRoom(roomId);
      this.checkAndTriggerBotTurn(roomId);
    } catch (fatalErr: any) {
      this.logger.error(`Fatal error in executeBotTurn for room ${roomId}: ${fatalErr.message}`);
      // Emergency recovery: force schedule next turn with small delay
      setTimeout(() => {
        this.checkAndTriggerBotTurn(roomId, true);
      }, 400);
    }
  }

  public clearBotTimeout(roomId: string) {
    const existing = this.botTimeouts.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.botTimeouts.delete(roomId);
    }
  }

  public clearTurnTimer(roomId: string) {
    const existing = this.turnTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.turnTimers.delete(roomId);
    }
  }

  public startTurnTimer(roomId: string) {
    this.clearTurnTimer(roomId);

    const engine = this.sessions.get(roomId);
    if (!engine || engine.getStatus() !== 'PLAYING') {
      return;
    }

    const room = this.roomService.getRoom(roomId);
    const timerSeconds = room?.settings?.roundTimerSeconds || 20;

    const timeout = setTimeout(() => {
      this.handleTurnTimeout(roomId);
    }, timerSeconds * 1000);

    this.turnTimers.set(roomId, timeout);
  }

  private handleTurnTimeout(roomId: string) {
    const engine = this.sessions.get(roomId);
    if (!engine || engine.getStatus() !== 'PLAYING') return;

    const existingBot = this.botTimeouts.get(roomId);
    if (existingBot) {
      clearTimeout(existingBot);
      this.botTimeouts.delete(roomId);
    }

    const currentSeat = engine.getCurrentTurnSeat();
    const legalMoves = engine.getLegalMovesForSeat(currentSeat);

    if (legalMoves.length > 0) {
      // Pick random legal move and auto-play
      const chosen = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      const end = chosen.validEnds[0];
      engine.playTile(currentSeat, chosen.tile, end);
    } else {
      engine.passTurn(currentSeat);
    }

    this.callbacks?.broadcastNotification?.(roomId, {
      type: 'INFO',
      message: `Time expired for seat ${currentSeat + 1}. Auto-played move.`,
      arabicMessage: `انتهى وقت التفكير لمقعد ${currentSeat + 1}. تم لعب كارت تلقائياً.`,
      timestamp: Date.now(),
    });

    if (engine.getStatus() === 'MATCH_FINISHED') {
      this.clearTurnTimer(roomId);
      this.matchService.finalizeMatch(engine);
      this.callbacks?.broadcastStatsUpdated(roomId);
      this.triggerBotRoundEndReaction(roomId);
    } else if (engine.getStatus() === 'PLAYING') {
      this.startTurnTimer(roomId);
      this.checkAndTriggerBotTurn(roomId);
    } else if (engine.getStatus() === 'ROUND_FINISHED') {
      this.clearTurnTimer(roomId);
      this.triggerBotRoundEndReaction(roomId);
      this.autoAdvanceRoundIfBotMatch(roomId, 4500);
    } else {
      this.clearTurnTimer(roomId);
    }

    this.callbacks?.broadcastStateToRoom(roomId);
  }

  /**
   * Triggers witty Egyptian bot reactions when a round or match ends.
   * Winning bots taunt opponents; losing bots mock their teammate ("فردة تعبانة").
   */
  private triggerBotRoundEndReaction(roomId: string) {
    const engine = this.sessions.get(roomId);
    if (!engine) return;

    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    const sanitized = engine.getSanitizedState(null);
    const roundResult = sanitized.lastRoundResult;
    if (!roundResult) return;

    const winnerTeam: TeamId = roundResult.winnerTeam;

    // Collect bots in this room
    const botSeats: { seat: PlayerSeat; botId: BotId; isWinner: boolean }[] = [];
    room.seats.forEach((s) => {
      if (s.isBot || s.isTemporarilyBotControlled || (s.playerId && s.playerId.startsWith('bot_'))) {
        const team: TeamId = s.seat % 2 === 0 ? 1 : 2;
        const isWinner = team === winnerTeam;
        const botId: BotId = s.botId || 'EL_SAMY';
        botSeats.push({ seat: s.seat, botId, isWinner });
      }
    });

    if (botSeats.length === 0) return;

    const winningBots = botSeats.filter((b) => b.isWinner);
    const losingBots = botSeats.filter((b) => !b.isWinner);

    // Winning bot taunts the defeated opponents (~500ms)
    if (winningBots.length > 0) {
      const bot = winningBots[Math.floor(Math.random() * winningBots.length)];
      setTimeout(() => {
        const chat = this.botService.generateSocialReaction(engine, bot.seat, bot.botId, 'ROUND_WIN');
        if (chat) {
          try {
            this.callbacks?.broadcastBotChat(roomId, chat);
          } catch {}
        }
      }, 500);
    }

    // Losing bot mocks/blames teammate ("أنا بلعب مع فردة تعبانة وضيعتني يا زميلي!") (~1800ms)
    if (losingBots.length > 0) {
      const bot = losingBots[Math.floor(Math.random() * losingBots.length)];
      setTimeout(() => {
        const chat = this.botService.generateSocialReaction(engine, bot.seat, bot.botId, 'ROUND_LOSS');
        if (chat) {
          try {
            this.callbacks?.broadcastBotChat(roomId, chat);
          } catch {}
        }
      }, 1800);
    }
  }

  /**
   * Triggers an opponent bot to taunt a player who just passed their turn.
   */
  private triggerBotOpponentPassReaction(roomId: string, passingSeat: PlayerSeat) {
    const engine = this.sessions.get(roomId);
    if (!engine) return;

    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    // Find bots on the opposing team
    const passingTeam: TeamId = passingSeat % 2 === 0 ? 1 : 2;
    const opponentBots = room.seats.filter(
      (s) =>
        (s.isBot || s.isTemporarilyBotControlled || (s.playerId && s.playerId.startsWith('bot_'))) &&
        (s.seat % 2 === 0 ? 1 : 2) !== passingTeam
    );

    if (opponentBots.length === 0) return;

    const bot = opponentBots[Math.floor(Math.random() * opponentBots.length)];
    const botId: BotId = bot.botId || 'EL_SAMY';

    setTimeout(() => {
      const taunt = this.botService.generateSocialReaction(engine, bot.seat, botId, 'OPPONENT_PASS');
      if (taunt) {
        try {
          this.callbacks?.broadcastBotChat(roomId, taunt);
        } catch {}
      }
    }, 450);
  }

  /**
   * Generates role-isolated sanitized state for a specific client.
   */
  public getSanitizedState(
    roomId: string,
    seat: PlayerSeat | null,
    role: UserRole = 'PLAYER'
  ): SanitizedGameState | null {
    const engine = this.sessions.get(roomId);
    if (!engine) return null;
    return engine.getSanitizedState(seat, role);
  }

  /**
   * Immediately destroys a game session and its timers (e.g. when room is abandoned).
   */
  public endSession(roomId: string): void {
    this.clearTurnTimer(roomId);
    const botTimer = this.botTimeouts.get(roomId);
    if (botTimer) {
      clearTimeout(botTimer);
      this.botTimeouts.delete(roomId);
    }
    this.sessions.delete(roomId);
    this.logger.log(`Game session for room ${roomId} has been terminated.`);
  }
}
