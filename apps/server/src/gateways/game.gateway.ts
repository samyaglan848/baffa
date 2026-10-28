import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { randomBytes } from 'crypto';
import {
  AdminMoveSeatPayload,
  AdminToggleBotPayload,
  AdminUpdateSettingsPayload,
  AppVisibilityChangedPayload,
  BotChatMessage,
  BotId,
  ClientEvents,
  ChainEnd,
  DominoTile,
  CreateRoomPayload,
  JoinRoomPayload,
  JudgeReportCheatingPayload,
  JudgeWarnPlayerPayload,
  JudgeDirectRedCardPayload,
  JudgeMuteActionPayload,
  JudgeVoidRoundPayload,
  JudgeGrantExtraTimePayload,
  JudgeTerminateMatchPayload,
  JudgeSubSeatPayload,
  RefereeActionType,
  RefereeDecisionBroadcastPayload,
  PassTurnPayload,
  PlayTilePayload,
  PlayerSeat,
  TeamId,
  SelectSeatPayload,
  ServerEvents,
  VoiceMutePayload,
  VoiceSignalPayload,
  QuickChatPayload,
  EmoteReactionPayload,
  NotificationPayload,
  UserRole,
} from '@baffa/shared';
import { RoomService } from '../modules/room/room.service';
import { GameSessionService } from '../modules/game/game-session.service';
import { AuthService, isGuestId } from '../modules/auth/auth.service';
import { VoiceService } from '../modules/voice/voice.service';
import { AnticheatService } from '../modules/anticheat/anticheat.service';
import { PersistenceService } from '../modules/persistence/persistence.service';
import { toPublicAvatar } from '../modules/profile/avatar-url';

export interface HttpIdentity {
  id: string;
  username: string;
  avatar: string;
  isGuest: boolean;
}

function socketCorsOrigins(): string[] | '*' {
  const raw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '';
  const list = raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => o.length > 0 && o !== '*');
  return list.length > 0 ? list : '*';
}

@WebSocketGateway({
  cors: {
    origin: socketCorsOrigins(),
  },
  // 1MB per message is plenty for game events (avatars are no longer sent inline).
  maxHttpBufferSize: 1e6,
  // Detect a dead connection in ~18s instead of the default ~45s (phones kill the connection of a
  // backgrounded page without closing it, and both sides kept waiting on it).
  pingInterval: 10000,
  pingTimeout: 8000,
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  private readonly playerAwaySince = new Map<string, number>();
  private readonly recentlyLeftUsers = new Map<string, { timestamp: number; username: string }>();

  /**
   * Automatic referee for leaving the game screen during a match (only when the room has no human
   * referee, who decides for themself). Away for more than AWAY_GRACE_MS counts as one violation:
   * 1st = warning, 2nd = cheating (round lost to the other team), 3rd in the same match = removed
   * from the table and replaced by a bot.
   */
  private static readonly AWAY_GRACE_MS = 5000;
  /**
   * A dropped connection is not the same as leaving the screen: on a weak network (or a slow server)
   * the socket can drop and come back in a few seconds while the player never left the game.
   * Leaving the app is reported separately (visibility event) and still uses AWAY_GRACE_MS.
   */
  private static readonly NETWORK_DROP_GRACE_MS = 30000;
  private readonly awayViolationTimers = new Map<string, NodeJS.Timeout>(); // `${roomId}_${userId}`
  private readonly awayStrikes = new Map<string, number>(); // `${roomId}_${matchId}_${userId}`

  /** فردي و"بدون حكم": الخروج من الشاشة بيظهر كعلامة فوق الاسم بس، من غير رسالة تنبيه نزاهة. */
  private isQuietAwayRoom(room: Parameters<typeof RoomService.isSoloRoom>[0] & Parameters<typeof RoomService.refereeModeOf>[0]): boolean {
    return RoomService.isSoloRoom(room) && RoomService.refereeModeOf(room) === 'NONE';
  }

  private scheduleAwayViolation(roomId: string, userId: string, graceMs: number = GameGateway.AWAY_GRACE_MS) {
    const room = this.findRoom(roomId);
    if (!room || room.matchStatus !== 'PLAYING' || !RoomService.serverJudges(room)) return;
    if (!this.getMembership(room, userId).seated) return;
    const key = `${room.id}_${userId}`;
    if (this.awayViolationTimers.has(key)) return;
    const timer = setTimeout(() => {
      this.awayViolationTimers.delete(key);
      try {
        this.applyAwayViolation(room.id, userId);
      } catch (err: any) {
        this.logger.warn(`Away violation failed for ${userId} in ${room.id}: ${err.message}`);
      }
    }, graceMs);
    timer.unref?.();
    this.awayViolationTimers.set(key, timer);
  }

  private cancelAwayViolation(roomId: string, userId: string) {
    const room = this.findRoom(roomId);
    const key = `${room?.id || roomId}_${userId}`;
    const timer = this.awayViolationTimers.get(key);
    if (timer) clearTimeout(timer);
    this.awayViolationTimers.delete(key);
  }

  private applyAwayViolation(roomId: string, userId: string) {
    const room = this.findRoom(roomId);
    if (!room || room.matchStatus !== 'PLAYING' || !RoomService.serverJudges(room)) return;
    const seated = this.getMembership(room, userId).seated;
    const engine = this.gameSessionService.getSession(room.id);
    // Between rounds (score screen) leaving is not counted.
    if (!seated || !engine || engine.getStatus() !== 'PLAYING') return;

    // Never punish a player who is actually back: connected again and not marked as away.
    const markedAway = this.playerAwaySince.has(`${room.id}_${userId}`);
    if (!markedAway && this.hasOtherLiveSocket(userId, '')) return;

    const seat = seated.seat as PlayerSeat;
    const name = seated.username || `لاعب ${seat + 1}`;
    const strikeKey = `${room.id}_${engine.getMatchId()}_${userId}`;
    const strike = (this.awayStrikes.get(strikeKey) || 0) + 1;
    this.awayStrikes.set(strikeKey, strike);
    const targetTeam = (seat % 2 === 0 ? 1 : 2) as TeamId;
    const beneficiaryTeam = (seat % 2 === 0 ? 2 : 1) as TeamId;
    const decision = (actionType: RefereeActionType, title: string, arabicMessage: string, reason: string) =>
      this.emitToRoom(room.id, ServerEvents.REFEREE_DECISION_BROADCAST, {
        actionType,
        judgeName: 'الحكم الآلي',
        targetSeat: seat,
        targetPlayerName: name,
        targetTeam,
        beneficiaryTeam,
        title,
        arabicMessage,
        reason,
        timestamp: Date.now(),
      } as RefereeDecisionBroadcastPayload);

    if (strike === 1) {
      const reason = 'الخروج من شاشة اللعبة أثناء الماتش';
      const res = this.gameSessionService.warnPlayer(room.id, 'SERVER_AUTO_JUDGE', seat, reason);
      if (!res.success) return;
      const cheating = Boolean(res.isCheatingTriggered);
      decision(
        cheating ? 'YELLOW_CARD_2_CHEATING' : 'YELLOW_CARD_1',
        cheating ? 'إنذار ثانٍ - احتساب غش' : 'كارت أصفر - خروج من اللعبة',
        cheating
          ? `الإنذار الثاني للاعب ${name}: تم احتساب غش وإنهاء الجولة.`
          : `إنذار للاعب ${name} بسبب الخروج من شاشة اللعبة. المرة الجاية تتحسب غش، والتالتة طرد.`,
        reason
      );
      this.notifySeatPlayer(room.id, seat, {
        type: cheating ? 'ALERT' : 'WARNING',
        message: 'Warning: you left the game screen during the match.',
        arabicMessage: cheating
          ? '🟥 خرجت من شاشة اللعبة وده إنذارك التاني: اتحسبت عليك حالة غش واتنهت الجولة.'
          : '🟨 خدت إنذار لأنك خرجت من شاشة اللعبة أكتر من 5 ثواني. المرة الجاية تتحسب غش، والتالتة طرد من الطاولة.',
        timestamp: Date.now(),
        persistent: true,
      });
      return;
    }

    if (strike === 2) {
      const reason = 'خروج متكرر من شاشة اللعبة أثناء الماتش';
      const res = this.gameSessionService.penalizeCheating(room.id, 'SERVER_AUTO_JUDGE', seat, reason);
      if (!res.success) return;
      decision(
        'YELLOW_CARD_2_CHEATING',
        'احتساب غش - خروج متكرر',
        `اللاعب ${name} خرج من اللعبة للمرة التانية: تم احتساب غش وإنهاء الجولة لصالح الفريق المنافس. المرة الجاية طرد.`,
        reason
      );
      this.notifySeatPlayer(room.id, seat, {
        type: 'ALERT',
        message: 'Second time away: cheating penalty applied.',
        arabicMessage: '🟥 خرجت من شاشة اللعبة للمرة التانية: اتحسبت عليك حالة غش واتنهت الجولة. لو اتكررت هتتطرد من الطاولة.',
        timestamp: Date.now(),
        persistent: true,
      });
      this.broadcastGameState(room.id);
      return;
    }

    // Third time: removed from the table for the rest of the match.
    this.kickFromTable(room, userId, seat, name);
    decision(
      'DIRECT_RED_CARD',
      'طرد من الطاولة',
      `تم طرد اللاعب ${name} من الطاولة بعد الخروج من اللعبة 3 مرات، وتولى مكانه بوت.`,
      'الخروج من شاشة اللعبة 3 مرات في نفس الماتش'
    );
  }

  /** Replaces a seated player with a bot for the rest of the match and tells them. */
  private kickFromTable(room: any, userId: string, seat: PlayerSeat, name: string) {
    const kickedNotice: NotificationPayload = {
      type: 'ALERT',
      message: 'You were removed from the table for leaving the game 3 times.',
      arabicMessage: '⛔ اتطردت من الطاولة لأنك خرجت من شاشة اللعبة 3 مرات في نفس الماتش، وبوت كمّل مكانك.',
      timestamp: Date.now(),
      userId,
      persistent: true,
    };
    for (const s of this.server.sockets.sockets.values()) {
      if (s.data?.user?.id !== userId) continue;
      s.emit(ServerEvents.NOTIFICATION, kickedNotice);
      s.emit('server:kicked', { roomId: room.id });
      s.leave(room.id);
      if (room.code) s.leave(room.code);
      const p = this.roomService.getPlayerBySocket(s.id);
      if (p) {
        p.roomId = null;
        p.seat = null;
      }
    }

    this.roomService.markKicked(room.id, userId);
    const tempId = `kick_${userId}`;
    this.roomService.registerSocket(tempId, { id: userId, username: name, avatar: 'avatar-1' }, 'PLAYER');
    this.roomService.leaveRoom(room.id, tempId); // seat becomes a bot
    this.roomService.unregisterSocket(tempId);
    this.roomService.markKicked(room.id, userId); // leaveRoom remembered the seat; forget it again
    this.roomService.cancelDisconnectGrace(room.id, seat);

    const botSeat = room.seats[seat];
    if (botSeat?.isBot) {
      this.gameSessionService.updateSeatMetadata(room.id, seat, {
        isBot: true,
        botId: botSeat.botId || 'EL_RAYEQ',
        username: botSeat.username || 'الرايق',
        avatar: botSeat.avatar || 'bot-rayeq',
        playerId: botSeat.playerId || `bot_${seat}`,
        isTemporarilyBotControlled: false,
      });
    }
    this.syncRoomToAll(room.id, room);
    this.broadcastGameState(room.id);
    this.gameSessionService.checkAndTriggerBotTurn(room.id, true);
    this.logger.log(`[AUTO_JUDGE] ${name} (${userId}) removed from table in room ${room.id} after 3 away violations`);
  }

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly roomService: RoomService,
    private readonly gameSessionService: GameSessionService,
    private readonly authService: AuthService,
    private readonly voiceService: VoiceService,
    private readonly anticheatService: AnticheatService,
    private readonly persistence: PersistenceService
  ) {}

  private readonly roomEmptySince = new Map<string, number>();
  private janitorTimer?: NodeJS.Timeout;

  /**
   * Rooms (and their game engines + timers) were never removed unless the last player pressed
   * "leave". Closed tabs left them in memory forever, so the server slowly filled up.
   * A room with no connected participant for 15 minutes is now cleaned up.
   */
  private runRoomJanitor() {
    const now = Date.now();
    const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
    for (const room of this.roomService.getAllRooms()) {
      const hasLiveParticipant = this.collectRoomTargets(room).some((id) => this.server.sockets.sockets.get(id)?.connected);
      if (hasLiveParticipant) {
        this.roomEmptySince.delete(room.id);
        continue;
      }
      const since = this.roomEmptySince.get(room.id) ?? now;
      this.roomEmptySince.set(room.id, since);
      if (now - since >= EMPTY_ROOM_TTL_MS) {
        this.gameSessionService.endSession(room.id);
        this.roomService.deleteRoom(room.id);
        this.roomEmptySince.delete(room.id);
        this.logger.log(`Cleaned up abandoned room ${room.id}`);
      }
    }
    for (const id of this.roomEmptySince.keys()) {
      if (!this.roomService.getRoom(id)) this.roomEmptySince.delete(id);
    }
    for (const [key, info] of this.recentlyLeftUsers.entries()) {
      if (now - info.timestamp > 60_000) this.recentlyLeftUsers.delete(key);
    }
    const liveRoomIds = this.roomService.getAllRooms().map((r) => r.id);
    for (const [key, ts] of this.playerAwaySince.entries()) {
      const belongsToLiveRoom = liveRoomIds.some((id) => key.startsWith(`${id}_`));
      if (!belongsToLiveRoom || now - ts > 6 * 60 * 60 * 1000) this.playerAwaySince.delete(key);
    }
  }

  afterInit() {
    this.logger.log('Authenticated GameGateway initialized');
    this.janitorTimer = setInterval(() => {
      try {
        this.runRoomJanitor();
      } catch (err: any) {
        this.logger.warn(`Room janitor error: ${err.message}`);
      }
    }, 60_000);
    this.janitorTimer.unref?.();
    this.gameSessionService.setCallbacks({
      broadcastStateToRoom: (roomId: string) => this.broadcastGameState(roomId),
      emitErrorToPlayer: (socketId: string, error: string) => {
        this.server.to(socketId).emit(ServerEvents.MOVE_REJECTED, { reason: error });
      },
      broadcastBotChat: (roomId: string, chat: BotChatMessage) => {
        this.emitToRoom(roomId, ServerEvents.BOT_MESSAGE, chat);
        // Also delivered as QUICK_CHAT_BROADCAST so it renders in the in-game chat stream and bubbles
        this.emitToRoom(roomId, ServerEvents.QUICK_CHAT_BROADCAST, {
          userId: `bot_${chat.seat}`,
          messageId: chat.text,
          senderName: chat.botName,
          seat: chat.seat,
          timestamp: chat.timestamp,
        });
        this.logger.debug(`[BOT_MESSAGE] room=${roomId} bot=${chat.botName} (seat ${chat.seat}): "${chat.text}"`);
      },
      broadcastStatsUpdated: (roomId: string) => {
        this.server.to(roomId).emit(ServerEvents.STATS_UPDATED, { timestamp: Date.now() });
      },
      broadcastNotification: (roomId: string, notification: NotificationPayload) => {
        this.broadcastNotificationToRoom(roomId, notification);
      },
      broadcastRefereeDecision: (roomId: string, decision: RefereeDecisionBroadcastPayload) => {
        this.emitToRoom(roomId, ServerEvents.REFEREE_DECISION_BROADCAST, decision);
      },
      notifySeat: (roomId: string, seat: PlayerSeat, notification: NotificationPayload) => {
        this.notifySeatPlayer(roomId, seat, notification);
      },
    });
  }

  /**
   * The referee's decision card disappears after a few seconds and names the player only by seat,
   * so a warned player often missed it. They now also get their own message that stays until closed.
   */
  private notifyWarnedPlayer(roomId: string, seat: PlayerSeat, judgeName: string, reason: string, isCheating: boolean) {
    this.notifySeatPlayer(roomId, seat, {
      type: isCheating ? 'ALERT' : 'WARNING',
      message: isCheating ? 'Second warning from the referee: cheating penalty.' : 'The referee gave you a warning.',
      arabicMessage: isCheating
        ? `🟥 الحكم ${judgeName} اداك الإنذار التاني (${reason}). اتحسبت عليك حالة غش واتنهت الجولة.`
        : `🟨 الحكم ${judgeName} اداك إنذار: ${reason}. الإنذار التاني في نفس الجولة بيتحسب غش.`,
      timestamp: Date.now(),
      persistent: true,
    });
  }

  /**
   * Tells a player who just came back (to the tab, or after a dropped connection) what happened to
   * them meanwhile: warnings, penalties and cards played for them when their time ran out. Messages
   * sent while they were away were usually replaced by later ones before they could see them.
   */
  private sendAwaySummary(roomId: string, userId: string, since: number) {
    const room = this.findRoom(roomId);
    if (!room) return;
    const seated = this.getMembership(room, userId).seated;
    if (!seated) return;
    const events = this.gameSessionService.getSeatEventsSince(room.id, seated.seat, since);
    if (events.length === 0) return;

    const lines: string[] = [];
    for (const e of events) {
      if (e.kind === 'CHEATING') lines.push(`🟥 اتحسبت عليك حالة غش واتنهت الجولة: ${e.text}`);
      else if (e.kind === 'WARNING') lines.push(`🟨 خدت إنذار: ${e.text}`);
    }
    const autoPlays = events.filter((e) => e.kind === 'AUTO_PLAY');
    if (autoPlays.length > 0) {
      const played = autoPlays.filter((e) => e.text !== 'PASS').map((e) => e.text);
      lines.push(
        `⏱️ وقتك خلص ${autoPlays.length === 1 ? 'مرة' : `${autoPlays.length} مرات`} واتلعب مكانك تلقائي` +
          (played.length > 0 ? ` (${played.join('، ')})` : '')
      );
    }
    const hasCheating = events.some((e) => e.kind === 'CHEATING');
    const hasWarning = events.some((e) => e.kind === 'WARNING');

    const notification: NotificationPayload = {
      type: hasCheating ? 'ALERT' : hasWarning ? 'WARNING' : 'INFO',
      message: 'While you were away: ' + events.map((e) => e.kind).join(', '),
      arabicMessage: `وانت برة اللعبة: ${lines.join(' • ')}`,
      timestamp: Date.now(),
      userId,
      persistent: hasCheating || hasWarning,
    };
    for (const s of this.server.sockets.sockets.values()) {
      if (s.connected && s.data?.user?.id === userId) s.emit(ServerEvents.NOTIFICATION, notification);
    }
  }

  /** Delivers a notification only to the human player sitting in a seat (all of their connections). */
  private notifySeatPlayer(roomId: string, seat: PlayerSeat, notification: NotificationPayload) {
    const room = this.findRoom(roomId);
    const playerId = room?.seats[seat]?.playerId;
    if (!room || !playerId || room.seats[seat].isBot) return;
    // Tagged with the player's id so their page knows the message is about them (it is kept on screen).
    const tagged = { ...notification, userId: notification.userId ?? playerId };
    for (const s of this.server.sockets.sockets.values()) {
      if (s.connected && s.data?.user?.id === playerId) s.emit(ServerEvents.NOTIFICATION, tagged);
    }
  }

  public broadcastNotificationToRoom(roomId: string, notif: NotificationPayload, excludeSocketId?: string) {
    this.emitToRoom(roomId, ServerEvents.NOTIFICATION, notif, excludeSocketId);
  }

  public syncRoomToAll(roomId: string, room: any, excludeSocketId?: string) {
    this.emitToRoom(room?.id || roomId, ServerEvents.ROOM_SYNC, { room }, excludeSocketId);
  }

  handleConnection(client: Socket) {
    const auth = (client.handshake.auth || {}) as Record<string, any>;
    const bearer = client.handshake.headers?.authorization?.startsWith('Bearer ')
      ? client.handshake.headers.authorization.substring(7)
      : null;
    const token: string | null = (typeof auth.token === 'string' && auth.token) || bearer || null;
    const guestToken: string | null = typeof auth.guestToken === 'string' ? auth.guestToken : null;

    let resolvedUser: { id: string; username: string; avatar: string; isAuthenticated: boolean; isGuest: boolean } | null = null;
    let tokenRejected = false;

    // 1. Registered account: only a correctly signed, unexpired token is accepted.
    if (token) {
      const userPayload = this.authService.validateGameToken(token);
      if (userPayload && !userPayload.isGuest) {
        const persisted = this.persistence.getUserById(userPayload.sub);
        let cleanName = (persisted?.displayName || persisted?.username || userPayload.username || '').trim();
        cleanName = cleanName.replace(/_\d{3,4}$/, '');
        if (!cleanName) cleanName = 'لاعب';

        resolvedUser = {
          id: userPayload.sub,
          username: cleanName,
          avatar: this.publicAvatar(userPayload.sub, persisted?.customAvatarUrl || persisted?.avatarUrl || 'avatar-1'),
          isAuthenticated: true,
          isGuest: false,
        };
        this.logger.log(`Authenticated client connected: ${cleanName} (${client.id})`);
      } else if (userPayload && userPayload.isGuest) {
        resolvedUser = this.buildGuestIdentity(userPayload.sub, auth.username, auth.avatar);
      } else {
        tokenRejected = true;
      }
    }

    // 2. Guest with a server-issued guest token (proves ownership of the guest id).
    if (!resolvedUser && guestToken) {
      const guestPayload = this.authService.validateGameToken(guestToken);
      if (guestPayload && guestPayload.isGuest) {
        resolvedUser = this.buildGuestIdentity(guestPayload.sub, auth.username, auth.avatar);
      }
    }

    // 3. Guest without a token yet: accept the client-generated guest id only if nobody is using it,
    //    otherwise hand out a fresh one. Registered ids can never be claimed this way.
    if (!resolvedUser) {
      const claimed = auth.userId;
      const guestId = isGuestId(claimed) && !this.isIdentityInUse(claimed)
        ? claimed
        : `guest_${randomBytes(9).toString('hex')}`;
      resolvedUser = this.buildGuestIdentity(guestId, auth.username, auth.avatar);
    }

    client.data.user = resolvedUser;

    // Tell the client which identity the server bound to this connection.
    // Guests receive a signed token so a reconnect (or another device) can prove it is them.
    client.emit('server:session', {
      userId: resolvedUser.id,
      username: resolvedUser.username,
      isGuest: resolvedUser.isGuest,
      guestToken: resolvedUser.isGuest
        ? this.authService.issueGuestToken(resolvedUser.id, resolvedUser.username)
        : undefined,
      tokenRejected,
    });

    if (!resolvedUser.isAuthenticated) {
      this.logger.log(`Guest connected: ${resolvedUser.username} (${resolvedUser.id}) [${client.id}]`);
    }

    try {
      this.rebindConnectingClient(client, resolvedUser);
    } catch (err: any) {
      this.logger.warn(`Auto-rebind error for ${client.id}: ${err.message}`);
    }
  }

  /** At most 6 chat messages / reactions per 5 seconds per connection. */
  private isChatFlooding(client: Socket): boolean {
    const now = Date.now();
    const recent: number[] = (client.data.chatTimes || []).filter((t: number) => now - t < 5000);
    if (recent.length >= 6) {
      client.data.chatTimes = recent;
      return true;
    }
    recent.push(now);
    client.data.chatTimes = recent;
    return false;
  }

  private hasOtherLiveSocket(userId: string, exceptSocketId: string): boolean {
    for (const s of this.server.sockets.sockets.values()) {
      if (s.id !== exceptSocketId && s.connected && s.data?.user?.id === userId) return true;
    }
    return false;
  }

  private buildGuestIdentity(guestId: string, rawName: unknown, rawAvatar: unknown) {
    let guestUsername = typeof rawName === 'string' ? rawName.trim().replace(/_\d{3,4}$/, '').slice(0, 25) : '';
    if (
      !guestUsername ||
      guestUsername.startsWith('Guest_') ||
      guestUsername.startsWith('guest_') ||
      guestUsername.startsWith('ضيف_')
    ) {
      guestUsername = 'ضيف';
    }
    const avatar = typeof rawAvatar === 'string' && /^(avatar-\d{1,2}|bot-[a-z-]+)$/.test(rawAvatar) ? rawAvatar : 'avatar-1';
    return { id: guestId, username: guestUsername, avatar, isAuthenticated: false, isGuest: true };
  }

  /** True when an id is already bound to a live socket or referenced by any room. */
  private isIdentityInUse(userId: string): boolean {
    for (const s of this.server?.sockets?.sockets?.values?.() || []) {
      if (s.data?.user?.id === userId) return true;
    }
    for (const r of this.roomService.getAllRooms()) {
      if (
        r.seats.some((s) => s.playerId === userId) ||
        r.judge?.userId === userId ||
        r.spectator?.userId === userId ||
        r.spectators?.some((sp) => sp.userId === userId) ||
        r.currentAdminId === userId ||
        r.ownerId === userId ||
        r.originalAdminId === userId
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Base64 photos stored in the DB are ~30-100KB each. Sending them inside every room/game
   * sync made each bot move push hundreds of KB to every player. Real-time payloads now carry
   * a short URL to the existing avatar endpoint instead.
   */
  public publicAvatar(userId: string, avatar: string | null | undefined): string {
    return toPublicAvatar(userId, avatar, this.persistence.getUserById(userId)?.updatedAt);
  }


  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    let player = this.roomService.getPlayerBySocket(client.id);
    let roomId = player?.roomId;

    // Fallback: search by user ID in all rooms if socket ID was unregistered or reconnected
    const userId = client.data?.user?.id || player?.userId;
    if (!roomId && userId) {
      for (const r of this.roomService.getAllRooms()) {
        const isSeated = r.seats.some((s) => s.playerId === userId && !s.isBot);
        const isJudge = r.judge?.userId === userId;
        const isSpectator = (r.spectator?.userId === userId) || (r.spectators?.some((s) => s.userId === userId));
        const isAdmin = r.currentAdminId === userId || r.originalAdminId === userId || r.ownerId === userId;
        if (isSeated || isJudge || isSpectator || isAdmin) {
          roomId = r.id;
          const seatObj = r.seats.find((s) => s.playerId === userId);
          if (!player) {
            player = {
              socketId: client.id,
              userId,
              username: client.data?.user?.username || seatObj?.username || 'لاعب',
              avatar: client.data?.user?.avatar || 'avatar-1',
              role: isJudge ? 'JUDGE' : isSpectator ? 'SPECTATOR' : isAdmin ? 'ADMIN' : 'PLAYER',
              seat: seatObj ? seatObj.seat : null,
              roomId: r.id,
            };
          } else {
            player.roomId = r.id;
            if (seatObj) player.seat = seatObj.seat;
          }
          break;
        }
      }
    }

    // Clean up voice peer
    const removedVoice = this.voiceService.removeSocket(client.id);
    if (removedVoice) {
      this.broadcastVoicePeers(removedVoice.roomId);
    }

    // Reconnect race: when a player's connection drops, the browser usually reconnects with a new
    // socket *before* the server notices the old one is gone. Without this check the late
    // disconnect of the old socket marked the (already reconnected) player as disconnected and
    // handed their turns to the bot. If the same identity still has a live socket, do nothing.
    if (userId && this.hasOtherLiveSocket(userId, client.id)) {
      this.logger.log(`Ignoring stale disconnect of ${client.id}: user ${userId} is still connected on another socket`);
      this.roomService.unregisterSocket(client.id);
      return;
    }

    if (roomId && player) {
      const room = this.roomService.getRoom(roomId);
      const username = player.username || client.data?.user?.username || 'أحد اللاعبين';

      if (room && room.matchStatus === 'PLAYING') {
        if (player.seat !== null) {
          // Start 2-Minute Disconnect Grace Period with Bot Takeover
          const grace = this.roomService.startDisconnectGrace(roomId, player.seat, () => {
            const notif: NotificationPayload = {
              type: 'ALERT',
              message: `Player ${username}'s 2-minute disconnect grace period has expired.`,
              arabicMessage: `انتهت مهلة الدقيقتين للاعب ${username}.`,
              timestamp: Date.now(),
            };
            this.broadcastNotificationToRoom(roomId, notif, client.id);
          });

          if (grace) {
            this.gameSessionService.setBotTakeover(roomId, player.seat, true);
            // Closing the game (or the phone killing it in the background) counts like leaving the screen.
            this.scheduleAwayViolation(roomId, player.userId, GameGateway.NETWORK_DROP_GRACE_MS);
            this.server.to(roomId).emit(ServerEvents.DISCONNECT_GRACE_UPDATE, { grace });
            const notif: NotificationPayload = {
              type: 'WARNING',
              message: `${username} disconnected. Waiting for turn timer before auto-play (2-min grace).`,
              arabicMessage: `انقطع اتصال اللاعب ${username} (خرج من الموقع). سيتم انتظار انتهاء وقت تفكيره بالكامل قبل لعب كارت عشوائي لحين عودته.`,
              timestamp: Date.now(),
              userId: player.userId,
            };
            this.broadcastNotificationToRoom(roomId, notif, client.id);
            this.broadcastGameState(roomId);
          }
        } else if (player.role === 'JUDGE' || room.judge?.userId === player.userId) {
          if (room.judge) room.judge.isConnected = false;
          const notif: NotificationPayload = {
            type: 'WARNING',
            message: `Judge ${username} disconnected.`,
            arabicMessage: `انقطع اتصال الحكم ${username} (خرج من الموقع).`,
            timestamp: Date.now(),
              userId: player.userId,
          };
          this.broadcastNotificationToRoom(roomId, notif, client.id);
          this.syncRoomToAll(roomId, room);
        } else if (player.role === 'SPECTATOR' || room.spectator?.userId === player.userId) {
          if (room.spectator) room.spectator.isConnected = false;
          this.syncRoomToAll(roomId, room);
        }
      } else if (room && room.matchStatus === 'LOBBY') {
        // In LOBBY: Never kick player immediately! Schedule 60s grace period and mark OFFLINE
        const updatedRoom = this.roomService.handleLobbyDisconnect(roomId, player.userId, () => {
          const finalRoom = this.roomService.getRoom(roomId);
          if (finalRoom) {
            this.syncRoomToAll(roomId, finalRoom);
          }
        });
        if (updatedRoom) {
          const notif: NotificationPayload = {
            type: 'INFO',
            message: `${username} went offline (reconnecting...).`,
            arabicMessage: `انقطع اتصال اللاعب ${username} (خرج من الموقع).`,
            timestamp: Date.now(),
              userId: player.userId,
          };
          this.broadcastNotificationToRoom(roomId, notif, client.id);
          this.syncRoomToAll(roomId, updatedRoom);
        }
      } else {
        const updatedRoom = this.roomService.leaveRoom(roomId, client.id);
        if (updatedRoom) {
          this.syncRoomToAll(roomId, updatedRoom);
        }
      }
    }

    this.roomService.unregisterSocket(client.id);
  }

  private rebindConnectingClient(client: Socket, user: { id: string; username: string; avatar: string }) {
    for (const room of this.roomService.getAllRooms()) {
      const isJudge = Boolean(
        room.judge && room.judge.userId === user.id
      );
      const isSpectator = Boolean(
        (room.spectator && room.spectator.userId === user.id) ||
        room.spectators?.some((s) => s.userId === user.id)
      );
      const seated = RoomService.liveSeats(room).find(
        (s) => !s.isBot && s.occupied && s.playerId === user.id
      );
      const isAdmin =
        room.currentAdminId === user.id ||
        room.originalAdminId === user.id ||
        room.ownerId === user.id;

      if (room.matchStatus === 'PLAYING') {
        if (seated || isJudge || isSpectator || isAdmin) {
          // Leave any stale rooms
          for (const r of client.rooms) {
            if (r !== client.id && r !== room.id && r !== room.code) {
              client.leave(r);
            }
          }
          client.join(room.id);
          if (room.code && room.code !== room.id) {
            client.join(room.code);
          }
          const role: UserRole = isJudge ? 'JUDGE' : isSpectator ? 'SPECTATOR' : (isAdmin ? 'ADMIN' : 'PLAYER');
          this.roomService.registerSocket(client.id, user, role);
          const player = this.roomService.getPlayerBySocket(client.id);
          if (player) {
            player.roomId = room.id;
            player.seat = seated ? seated.seat : null;
          }

          if (isJudge && room.judge) {
            room.judge.isConnected = true;
          }
          if (isSpectator && room.spectator) {
            room.spectator.isConnected = true;
          }

          const grace = seated ? room.disconnectGraces?.find((g) => g.seat === seated.seat) : undefined;
          const hadGrace = Boolean(grace);
          if (seated) {
            seated.isConnected = true;
            seated.presence = 'ONLINE';
            seated.isTemporarilyBotControlled = false;
            this.roomService.cancelDisconnectGrace(room.id, seated.seat);
            this.cancelAwayViolation(room.id, user.id);
            // Also re-arms the turn flow; the room's bot timer is no longer cleared here (that froze
            // the table whenever a player reconnected during a bot's turn).
            this.gameSessionService.setBotTakeover(room.id, seated.seat, false);
          } else {
            this.gameSessionService.resumeTurnFlow(room.id);
          }

          if (hadGrace) {
            const returnNotif: NotificationPayload = {
              type: 'SUCCESS',
              message: `Player ${user.username} has returned to the game!`,
              arabicMessage: `عَادَ اللاعب ${user.username} إلى اللعبة واستلم دوره!`,
              timestamp: Date.now(),
              userId: user.id,
            };
            this.broadcastNotificationToRoom(room.id, returnNotif);
          }

          this.syncRoomToAll(room.id, room);
          client.emit(ServerEvents.ROOM_SYNC, { room });
          this.broadcastGameState(room.id, client.id);
          // Came back after the connection dropped (phone put the page to sleep): say what happened.
          if (grace) this.sendAwaySummary(room.id, user.id, grace.disconnectedAt);
          this.logger.log(`Auto-rebound client ${user.username} (${client.id}) to PLAYING room ${room.id} as ${role}`);
          break;
        }
      } else if (room.matchStatus === 'LOBBY') {
        // Rebind seated players, judges, spectators, or room admin in lobby!
        if (seated || isJudge || isSpectator || isAdmin) {
          for (const r of client.rooms) {
            if (r !== client.id && r !== room.id && r !== room.code) {
              client.leave(r);
            }
          }
          client.join(room.id);
          if (room.code && room.code !== room.id) {
            client.join(room.code);
          }

          const role: UserRole = isAdmin ? 'ADMIN' : isJudge ? 'JUDGE' : isSpectator ? 'SPECTATOR' : 'PLAYER';
          this.roomService.registerSocket(client.id, user, role);
          const player = this.roomService.getPlayerBySocket(client.id);
          if (player) {
            player.roomId = room.id;
            player.seat = seated ? seated.seat : null;
          }

          this.roomService.cancelLobbyDisconnect(room.id, user.id);

          const returnNotif: NotificationPayload = {
            type: 'SUCCESS',
            message: `Player ${user.username} is back in the room!`,
            arabicMessage: `عَادَ اللاعب ${user.username} إلى الغرفة!`,
            timestamp: Date.now(),
              userId: user.id,
          };
          this.broadcastNotificationToRoom(room.id, returnNotif);
          this.syncRoomToAll(room.id, room);
          client.emit(ServerEvents.ROOM_SYNC, { room });
          this.logger.log(`Auto-rebound client ${user.username} (${client.id}) to LOBBY room ${room.id} as ${role}`);
          break;
        }
      }
    }
  }

  /**
   * Resolves the caller identity from the connection itself (set during the handshake from a
   * verified token). IDs sent inside event payloads are ignored — previously a guest could send
   * another player's id (visible in the room data) and act as that player.
   * Guests may still change their display name through the payload.
   */
  private resolveUser(client: Socket, payloadUser?: any): { id: string; username: string; avatar: string } {
    const bound = client.data.user as
      | { id: string; username: string; avatar: string; isAuthenticated: boolean; isGuest?: boolean }
      | undefined;

    if (!bound || !bound.id) {
      // Should never happen (handshake always binds an identity) — fall back to a socket-scoped guest.
      const fallback = this.buildGuestIdentity(`guest_${client.id.replace(/[^A-Za-z0-9_-]/g, '')}`, payloadUser?.username, payloadUser?.avatar);
      client.data.user = fallback;
      return { id: fallback.id, username: fallback.username, avatar: fallback.avatar };
    }

    if (bound.isAuthenticated) {
      const persisted = this.persistence.getUserById(bound.id);
      let name = (persisted?.displayName || persisted?.username || bound.username || '').trim();
      name = name.replace(/_\d{3,4}$/, '');
      const avatar = this.publicAvatar(bound.id, persisted?.customAvatarUrl || persisted?.avatarUrl || bound.avatar || 'avatar-1');
      return { id: bound.id, username: name || 'لاعب', avatar };
    }

    // Guest: id is fixed, name/avatar are cosmetic and may be updated by the client.
    const nameCandidate = payloadUser?.username;
    if (typeof nameCandidate === 'string' && nameCandidate.trim().length >= 2 && nameCandidate.trim().length <= 25) {
      const refreshed = this.buildGuestIdentity(bound.id, nameCandidate, payloadUser?.avatar || bound.avatar);
      bound.username = refreshed.username;
      bound.avatar = refreshed.avatar;
    }
    return { id: bound.id, username: bound.username || 'ضيف', avatar: bound.avatar || 'avatar-1' };
  }

  private findRoom(roomIdOrCode: string) {
    if (!roomIdOrCode || typeof roomIdOrCode !== 'string') return undefined;
    return this.roomService.getRoom(roomIdOrCode) || this.roomService.getRoomByCode(roomIdOrCode);
  }

  /** Membership of a user id in a room, by id only (never by display name). */
  private getMembership(room: any, userId: string) {
    const seated = RoomService.liveSeats(room).find((s: any) => !s.isBot && s.occupied && s.playerId === userId);
    const isJudge = Boolean(room.judge && room.judge.userId === userId);
    const isSpectator = Boolean(
      room.spectator?.userId === userId || room.spectators?.some((sp: any) => sp.userId === userId)
    );
    const isAdmin =
      room.currentAdminId === userId || room.originalAdminId === userId || room.ownerId === userId;
    return { seated, isJudge, isSpectator, isAdmin, isMember: Boolean(seated || isJudge || isSpectator || isAdmin) };
  }

  /**
   * Validates room existence and that the caller (by verified identity) belongs to the room.
   */
  private validateCallerInRoom(client: Socket, roomId: string, payloadUser?: any) {
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Invalid roomId provided');
    }
    const room = this.findRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const userAuth = this.resolveUser(client, payloadUser);
    const membership = this.getMembership(room, userAuth.id);
    let player = this.roomService.getPlayerBySocket(client.id);
    if (player && player.userId !== userAuth.id) {
      // Stale registration from a different identity on this socket — rebuild it.
      this.roomService.unregisterSocket(client.id);
      player = undefined;
    }

    const registeredHere = Boolean(player && player.roomId === room.id);
    if (!membership.isMember && !registeredHere) {
      throw new Error('غير مسموح: أنت لست مشاركاً في هذه الغرفة');
    }

    client.join(room.id);
    if (room.code && room.code !== room.id) client.join(room.code);

    if (!player) {
      const role: UserRole = membership.isJudge
        ? 'JUDGE'
        : membership.isSpectator
        ? 'SPECTATOR'
        : membership.isAdmin
        ? 'ADMIN'
        : 'PLAYER';
      this.roomService.registerSocket(client.id, userAuth, role);
      player = this.roomService.getPlayerBySocket(client.id)!;
    }

    player.roomId = room.id;
    if (membership.isJudge) {
      player.role = 'JUDGE';
      player.seat = null;
    } else if (membership.isSpectator && !membership.seated) {
      player.role = 'SPECTATOR';
      player.seat = null;
    } else if (membership.seated) {
      player.seat = membership.seated.seat;
      player.role = membership.isAdmin ? 'ADMIN' : 'PLAYER';
    } else {
      player.seat = null;
      player.role = membership.isAdmin ? 'ADMIN' : 'PLAYER';
    }

    return { player, room };
  }

  /**
   * Authorizes the presiding Judge/Referee of a room. Only the user recorded as the room's
   * judge may use referee actions. (Previously any caller was promoted to judge automatically,
   * so any player could hand a cheating penalty to the other team.)
   */
  private validateJudgeInRoom(client: Socket, roomId: string, payloadUser?: any): { player: any; room: any } {
    const { player, room } = this.validateCallerInRoom(client, roomId, payloadUser);
    if (!room.judge || room.judge.userId !== player.userId) {
      throw new Error('غير مسموح: هذا الإجراء متاح لحكم الغرفة فقط');
    }
    room.judge.isConnected = true;
    player.role = 'JUDGE';
    player.seat = null;
    return { player, room };
  }

  /** Every socket that should receive updates for a room (room channel, code channel, registered players). */
  private collectRoomTargets(room: any, excludeSocketId?: string): string[] {
    const targets = new Set<string>();
    const add = (channel?: string) => {
      if (!channel) return;
      const members = this.server.sockets.adapter.rooms.get(channel);
      if (members) for (const id of members) targets.add(id);
    };
    add(room.id);
    if (room.code && room.code !== room.id) add(room.code);
    for (const cp of this.roomService.getConnectedPlayersInRoom(room.id)) {
      if (cp.socketId) targets.add(cp.socketId);
    }
    if (excludeSocketId) targets.delete(excludeSocketId);
    return Array.from(targets);
  }

  /** Emits once per socket (the old code emitted the same event up to 3 times to each player). */
  private emitToRoom(roomIdOrCode: string, event: string, payload: any, excludeSocketId?: string) {
    const room = this.findRoom(roomIdOrCode);
    if (!room) {
      if (excludeSocketId) this.server.to(roomIdOrCode).except(excludeSocketId).emit(event, payload);
      else this.server.to(roomIdOrCode).emit(event, payload);
      return;
    }
    const targets = this.collectRoomTargets(room, excludeSocketId);
    if (targets.length > 0) this.server.to(targets).emit(event, payload);
  }

  private broadcastGameState(roomId: string, directSocketId?: string) {
    const room = this.findRoom(roomId);
    if (!room) return;

    const targets = new Set(this.collectRoomTargets(room));
    if (directSocketId) targets.add(directSocketId);
    if (targets.size === 0) return;

    this.server.to(Array.from(targets)).emit(ServerEvents.ROOM_SYNC, { room });

    const hasSession = Boolean(this.gameSessionService.getSession(room.id));
    if (!hasSession) return;

    // Cache the masked state per (seat, role): at most a handful of variants per room.
    const cache = new Map<string, any>();
    for (const socketId of targets) {
      const socket = this.server.sockets.sockets.get(socketId);
      const userId: string | undefined =
        socket?.data?.user?.id || this.roomService.getPlayerBySocket(socketId)?.userId;
      if (!userId) continue;

      // Seat and role are resolved strictly by user id. (Matching by display name leaked a
      // player's private hand to anyone who joined with the same name, e.g. two guests named "ضيف".)
      const m = this.getMembership(room, userId);
      const role: UserRole = m.isJudge
        ? 'JUDGE'
        : m.seated
        ? (m.isAdmin ? 'ADMIN' : 'PLAYER')
        : m.isSpectator
        ? 'SPECTATOR'
        : 'SPECTATOR';
      const seat = m.isJudge ? null : m.seated ? m.seated.seat : null;

      const key = `${seat}_${role}`;
      let sanitized = cache.get(key);
      if (sanitized === undefined) {
        sanitized = this.gameSessionService.getSanitizedState(room.id, seat, role);
        cache.set(key, sanitized);
      }
      if (sanitized) {
        this.server.to(socketId).emit(ServerEvents.GAME_STATE_SYNC, { gameState: sanitized });
      }
    }
  }

  /**
   * After a rejected move the client still shows its optimistic board (tile already on the table,
   * turn passed on). Sending the authoritative state right away rolls that back; without it the
   * player stared at a board where it was no longer their turn until someone else moved.
   */
  private resyncPlayer(client: Socket, roomId: string) {
    const room = this.findRoom(roomId);
    if (!room || !this.gameSessionService.getSession(room.id)) return;
    const userId: string | undefined = client.data?.user?.id;
    if (!userId) return;
    const m = this.getMembership(room, userId);
    const role: UserRole = m.isJudge ? 'JUDGE' : m.seated ? (m.isAdmin ? 'ADMIN' : 'PLAYER') : 'SPECTATOR';
    const seat = m.isJudge ? null : m.seated ? m.seated.seat : null;
    const gameState = this.gameSessionService.getSanitizedState(room.id, seat, role);
    if (gameState) client.emit(ServerEvents.GAME_STATE_SYNC, { gameState });
  }

  /**
   * Called by the client when the player comes back to the tab. The acknowledgement proves the
   * connection is still alive (a connection that died while the tab was in the background can look
   * "connected" for up to ~45s, during which nothing arrived and moves were lost), and it carries the
   * current room and board so the player resumes exactly where the game is now.
   */
  @SubscribeMessage('client:resync')
  handleResync(@ConnectedSocket() client: Socket, @MessageBody() payload: { roomId?: string }) {
    try {
      const room = this.findRoom(payload?.roomId || '');
      const userId: string | undefined = client.data?.user?.id;
      if (!room || !userId) return { ok: true, room: null, gameState: null };
      const m = this.getMembership(room, userId);
      if (!m.isMember) return { ok: true, room: null, gameState: null };
      client.join(room.id);
      if (room.code && room.code !== room.id) client.join(room.code);
      const role: UserRole = m.isJudge ? 'JUDGE' : m.seated ? (m.isAdmin ? 'ADMIN' : 'PLAYER') : 'SPECTATOR';
      const seat = m.isJudge ? null : m.seated ? m.seated.seat : null;
      const gameState = this.gameSessionService.getSanitizedState(room.id, seat, role);
      return { ok: true, room, gameState };
    } catch (err: any) {
      return { ok: true, room: null, gameState: null, error: err.message };
    }
  }

  @SubscribeMessage(ClientEvents.CREATE_ROOM)
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CreateRoomPayload
  ) {
    try {
      const user = this.resolveUser(client, payload?.user);
      const initialRole =
        payload?.initialRole === 'JUDGE'
          ? 'JUDGE'
          : payload?.initialRole === 'SPECTATOR'
          ? 'SPECTATOR'
          : 'ADMIN';
      this.roomService.registerSocket(client.id, user, initialRole);
      const room = this.roomService.createRoom(
        client.id,
        user,
        payload?.name,
        payload?.settings,
        initialRole
      );
      // Clean up: Leave all other socket rooms to prevent audio bleed or ghost events
      for (const r of client.rooms) {
        if (r !== client.id && r !== room.id) {
          client.leave(r);
        }
      }
      client.join(room.id);
      if (room.code && room.code !== room.id) {
        client.join(room.code);
      }
      // Quick play goes straight to the table: the lobby is not sent first (it only flashed by).
      const startsNow = payload?.autoStart === true && initialRole !== 'JUDGE';
      if (!startsNow) client.emit(ServerEvents.ROOM_SYNC, { room });

      if (room.settings.voiceEnabled) {
        this.voiceService.joinVoice(room.id, user.id, client.id, initialRole);
        this.broadcastVoicePeers(room.id);
      }

      this.logger.log(`Room created: ${room.id} (${room.code}) by ${user.username} with role ${initialRole}`);

      // Quick play: start at once instead of showing the lobby and waiting for another press.
      // If room is created as a Judge with 4 Egyptian bots, auto-start match immediately so the referee presides directly over the game
      if ((initialRole === 'JUDGE' && RoomService.liveSeats(room).every((s) => s.isBot)) || (payload?.autoStart === true && initialRole !== 'JUDGE')) {
        this.logger.log(`Auto-starting 4-bot match for presiding referee in room ${room.id}`);
        this.gameSessionService.startMatch(room.id, user.id);
        const updatedRoom = this.roomService.getRoom(room.id);
        if (updatedRoom) {
          client.emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
        }
        this.broadcastGameState(room.id, client.id);
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.JOIN_ROOM)
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload
  ) {
    try {
      if (!payload?.roomId) throw new Error('Room ID or code is required');
      const user = this.resolveUser(client, payload.user);
      this.roomService.registerSocket(client.id, user, 'PLAYER');
      let room = this.roomService.getRoom(payload.roomId) || this.roomService.getRoomByCode(payload.roomId);
      if (!room) throw new Error('Room not found with provided ID or Code');

      // Clean up: Leave all other socket rooms to prevent audio bleed or ghost events
      for (const r of client.rooms) {
        if (r !== client.id && r !== room.id) {
          client.leave(r);
        }
      }
      // joinRoom() cancels the disconnect grace itself, so remember whether there was one first
      // (the old check ran afterwards, never matched, and left the seat flagged as bot-controlled).
      const seatBefore = RoomService.liveSeats(room).find((s) => !s.isBot && s.occupied && s.playerId === user.id);
      const hadActiveGrace = Boolean(seatBefore && room.disconnectGraces?.some((g) => g.seat === seatBefore.seat));

      const updatedRoom = this.roomService.joinRoom(room.id, client.id, user);
      this.cancelAwayViolation(room.id, user.id);
      client.join(room.id);
      if (room.code && room.code !== room.id) {
        client.join(room.code);
      }

      if (updatedRoom.settings.voiceEnabled) {
        this.voiceService.joinVoice(room.id, user.id, client.id, 'PLAYER');
        this.broadcastVoicePeers(room.id);
      }

      // A player coming back into a running match (after pressing "leave", or a new player taking a
      // bot seat) must also replace the bot inside the game engine. Before, only the room seat was
      // switched to human: the bot stopped playing that seat, the engine still listed the bot, and
      // every turn of that seat waited for the full timer — the table looked frozen.
      const mySeat = updatedRoom.seats.find((s) => !s.isBot && s.occupied && s.playerId === user.id);
      const engine = this.gameSessionService.getSession(updatedRoom.id);
      if (updatedRoom.matchStatus === 'PLAYING' && mySeat && engine) {
        const enginePlayer = engine.getSanitizedState(null).players[mySeat.seat];
        if (enginePlayer && (enginePlayer.isBot || enginePlayer.playerId !== user.id)) {
          this.gameSessionService.updateSeatMetadata(updatedRoom.id, mySeat.seat, {
            isBot: false,
            playerId: user.id,
            username: mySeat.username || user.username,
            avatar: mySeat.avatar || user.avatar,
            isConnected: true,
            isTemporarilyBotControlled: false,
          });
        }
        this.gameSessionService.setBotTakeover(updatedRoom.id, mySeat.seat, false);
      }

      this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      if (room.code && room.code !== room.id) {
        this.server.to(room.code).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }
      client.emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });

      if (room.matchStatus === 'PLAYING' && hadActiveGrace) {
        const returnNotif: NotificationPayload = {
          type: 'SUCCESS',
          message: `Player ${user.username} has returned to the game!`,
          arabicMessage: `عَادَ اللاعب ${user.username} إلى اللعبة واستلم دوره!`,
          timestamp: Date.now(),
          userId: user.id,
        };
        this.broadcastNotificationToRoom(room.id, returnNotif);
      }

      this.broadcastGameState(room.id);
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.JOIN_AS_JUDGE)
  handleJoinAsJudge(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload
  ) {
    try {
      if (!payload?.roomId) throw new Error('Room ID or code is required');
      const user = this.resolveUser(client, payload.user);
      this.roomService.registerSocket(client.id, user, 'JUDGE');
      let room = this.roomService.getRoom(payload.roomId) || this.roomService.getRoomByCode(payload.roomId);
      if (!room) throw new Error('Room not found');

      // Clean up: Leave all other socket rooms to prevent audio bleed or ghost events
      for (const r of client.rooms) {
        if (r !== client.id && r !== room.id) {
          client.leave(r);
        }
      }
      const updatedRoom = this.roomService.joinAsJudge(room.id, client.id, user);
      client.join(room.id);
      if (room.code && room.code !== room.id) {
        client.join(room.code);
      }

      if (updatedRoom.settings.voiceEnabled) {
        this.voiceService.joinVoice(room.id, user.id, client.id, 'JUDGE');
        this.broadcastVoicePeers(room.id);
      }

      this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      if (room.code && room.code !== room.id) {
        this.server.to(room.code).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }
      client.emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      this.broadcastGameState(room.id);
      this.logger.log(`User ${user.username} joined as JUDGE in room ${room.id}`);
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.JOIN_AS_SPECTATOR)
  handleJoinAsSpectator(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload
  ) {
    try {
      if (!payload?.roomId) throw new Error('Room ID or code is required');
      const user = this.resolveUser(client, payload.user);
      this.roomService.registerSocket(client.id, user, 'SPECTATOR');
      let room = this.roomService.getRoom(payload.roomId) || this.roomService.getRoomByCode(payload.roomId);
      if (!room) throw new Error('Room not found');

      // Clean up: Leave all other socket rooms to prevent audio bleed or ghost events
      for (const r of client.rooms) {
        if (r !== client.id && r !== room.id) {
          client.leave(r);
        }
      }
      const updatedRoom = this.roomService.joinAsSpectator(room.id, client.id, user);
      client.join(room.id);
      if (room.code && room.code !== room.id) {
        client.join(room.code);
      }

      if (updatedRoom.settings.voiceEnabled) {
        this.voiceService.joinVoice(room.id, user.id, client.id, 'SPECTATOR');
        this.broadcastVoicePeers(room.id);
      }

      this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      if (room.code && room.code !== room.id) {
        this.server.to(room.code).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }
      client.emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      this.broadcastGameState(room.id);
      this.logger.log(`User ${user.username} joined as SPECTATOR in room ${room.id}`);
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.LEAVE_ROOM)
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string }
  ) {
    try {
      if (!payload?.roomId) return;
      const player = this.roomService.getPlayerBySocket(client.id);
      const userId = client.data?.user?.id || player?.userId;

      const room = this.roomService.getRoom(payload.roomId) || this.roomService.getRoomByCode(payload.roomId);
      if (!room) return;
      const actualRoomId = room.id;

      // Count human players remaining in the room (both seated and unseated in lobby)
      const seatedHumans = room.seats
        ? RoomService.liveSeats(room).filter((s) => s.occupied && !s.isBot && s.playerId && s.playerId !== userId).length
        : 0;
      const judgeHuman = room.judge && room.judge.userId !== userId && room.judge.isConnected ? 1 : 0;
      const spectatorHuman = (room.spectator && room.spectator.userId !== userId && room.spectator.isConnected ? 1 : 0) +
        (room.spectators ? room.spectators.filter((s) => s.userId !== userId && s.isConnected).length : 0);
      const otherConnected = this.roomService
        .getConnectedPlayersInRoom(actualRoomId)
        .filter((cp) => cp.socketId !== client.id && cp.userId !== userId).length;

      const totalRemainingHumans = seatedHumans + judgeHuman + spectatorHuman + otherConnected;

      const leftPlayerUsername = player?.username || client.data?.user?.username || 'أحد اللاعبين';
      const leftPlayerSeat = player?.seat ?? RoomService.liveSeats(room).find((s) => s.playerId === userId)?.seat ?? null;

      // Leaving on purpose is not "away" any more.
      if (userId) this.cancelAwayViolation(actualRoomId, userId);

      // Track in recentlyLeftUsers to deduplicate with handleLeaveRoomDirect
      if (userId) {
        this.recentlyLeftUsers.set(`${actualRoomId}_${userId}`, {
          timestamp: Date.now(),
          username: leftPlayerUsername,
        });
      }

      // Broadcast leave notification to ALL participants in the room immediately
      const leaveNotif: NotificationPayload = {
        type: 'WARNING',
        message: `${leftPlayerUsername} permanently left the room.`,
        arabicMessage: room.matchStatus === 'PLAYING'
          ? `🚪 غادر اللاعب ${leftPlayerUsername} الغرفة نهائياً، وتولى مكانه البوت.`
          : `🚪 غادر اللاعب ${leftPlayerUsername} الغرفة نهائياً.`,
        timestamp: Date.now(),
        userId,
        username: leftPlayerUsername,
        persistent: true,
      };
      this.broadcastNotificationToRoom(actualRoomId, leaveNotif);
      this.logger.log(`[LEAVE_ROOM] broadcasted leave for ${leftPlayerUsername} in room ${actualRoomId}`);

      const removedVoiceOnLeave = this.voiceService.removeSocket(client.id);
      if (removedVoiceOnLeave) {
        this.broadcastVoicePeers(removedVoiceOnLeave.roomId);
      } else {
        this.broadcastVoicePeers(actualRoomId);
      }

      const socketsInRoom = this.server.sockets.adapter.rooms.get(actualRoomId)?.size || 0;
      const socketsInCode = (room.code ? this.server.sockets.adapter.rooms.get(room.code)?.size : 0) || 0;
      const remainingSockets = Math.max(socketsInRoom, socketsInCode) - 1;

      if (totalRemainingHumans <= 0 && remainingSockets <= 0) {
        this.gameSessionService.endSession(actualRoomId);
        this.roomService.deleteRoom(actualRoomId);
        this.logger.log(`Room ${actualRoomId} destroyed because all human players left.`);
      } else {
        if (leftPlayerSeat !== null) {
          this.roomService.cancelDisconnectGrace(actualRoomId, leftPlayerSeat);
        }
        if (!this.roomService.getPlayerBySocket(client.id) && userId) {
          // Unregistered connection (e.g. after a reconnect): leaveRoom() would silently do nothing
          // and the player would stay seated / owner of the room they just left.
          const m = this.getMembership(room, userId);
          this.roomService.registerSocket(client.id, this.resolveUser(client), m.isJudge ? 'JUDGE' : m.isSpectator && !m.seated ? 'SPECTATOR' : 'PLAYER');
        }
        const updatedRoom = this.roomService.leaveRoom(actualRoomId, client.id);
        if (updatedRoom) {
          this.syncRoomToAll(actualRoomId, updatedRoom);

          if (leftPlayerSeat !== null && updatedRoom.matchStatus === 'PLAYING') {
            const botSeat = updatedRoom.seats[leftPlayerSeat];
            if (botSeat && botSeat.isBot) {
              this.gameSessionService.updateSeatMetadata(actualRoomId, leftPlayerSeat, {
                isBot: true,
                botId: botSeat.botId || 'EL_RAYEQ',
                username: botSeat.username || 'الرايق',
                avatar: botSeat.avatar || 'bot-rayeq',
                playerId: botSeat.playerId || `bot_${leftPlayerSeat}`,
                isTemporarilyBotControlled: false,
              });
            }
          }

          if (updatedRoom.matchStatus === 'PLAYING') {
            this.broadcastGameState(actualRoomId);
            this.gameSessionService.checkAndTriggerBotTurn(actualRoomId, true);
          }
        }
      }

      client.leave(actualRoomId);
      if (room.code && room.code !== actualRoomId) {
        client.leave(room.code);
      }

      if (player) {
        player.roomId = null;
        player.seat = null;
      }
    } catch (err: any) {
      this.logger.warn(`Error in handleLeaveRoom: ${err.message}`);
    }
  }

  @SubscribeMessage(ClientEvents.APP_VISIBILITY_CHANGED)
  handleAppVisibilityChanged(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AppVisibilityChangedPayload
  ) {
    try {
      if (!payload?.roomId) return;
      const room = this.roomService.getRoom(payload.roomId) || this.roomService.getRoomByCode(payload.roomId);
      if (!room) return;
      const roomId = room.id;

      // Identity comes from the connection, never from the payload.
      const userId: string | undefined = client.data?.user?.id;
      if (!userId) return;
      const membership = this.getMembership(room, userId);
      if (!membership.isMember) return;
      const username: string = membership.seated?.username || client.data?.user?.username || 'أحد اللاعبين';

      client.join(roomId);

      const isAway = !payload.isVisible || !payload.hasWindowFocus;
      const awayKey = `${roomId}_${userId}`;


      if (isAway) {
        if (this.playerAwaySince.has(awayKey)) return;
        this.playerAwaySince.set(awayKey, Date.now());
        this.scheduleAwayViolation(roomId, userId);

        const notif: NotificationPayload = {
          type: 'WARNING',
          message: `Anti-cheat: ${username} switched away from the game screen.`,
          arabicMessage: `⚠️ تنبيه نزاهة: اللاعب ${username} خرج من شاشة اللعبة (انتقل لنافذة أو تطبيق آخر).`,
          timestamp: Date.now(),
          userId,
          username,
          persistent: true,
        };
        // فردي بدون حكم: مفيش داعي لتنبيه النزاهة، والعلامة الصغيرة فوق الاسم كفاية (presence = AWAY).
        if (!this.isQuietAwayRoom(room)) this.broadcastNotificationToRoom(roomId, notif);

        const seatObj = RoomService.liveSeats(room).find((s) => s.playerId === userId && !s.isBot);
        if (seatObj) {
          seatObj.presence = 'AWAY';
        }
        if (room.judge && room.judge.userId === userId) {
          (room.judge as any).presence = 'AWAY';
        }
        if (room.spectator && room.spectator.userId === userId) {
          (room.spectator as any).presence = 'AWAY';
        }
        const spec = room.spectators?.find((s) => s.userId === userId);
        if (spec) {
          (spec as any).presence = 'AWAY';
        }

        this.syncRoomToAll(roomId, room);
        if (room.matchStatus === 'PLAYING') {
          this.broadcastGameState(roomId);
        }
      } else {
        this.cancelAwayViolation(roomId, userId);
        // The client reports a return both over the socket and over HTTP; only the first one counts.
        // (Each duplicate re-sent the whole room and board to every player.)
        if (!this.playerAwaySince.has(awayKey)) return;
        const awayStart = this.playerAwaySince.get(awayKey);
        this.playerAwaySince.delete(awayKey);
        const awayDurationSec = awayStart ? Math.max(1, Math.round((Date.now() - awayStart) / 1000)) : 0;

        const notif: NotificationPayload = {
          type: 'SUCCESS',
          message: `${username} returned to the game screen${awayDurationSec > 0 ? ` after ${awayDurationSec}s` : ''}.`,
          arabicMessage: awayDurationSec > 0
            ? `✅ عاد اللاعب ${username} إلى شاشة اللعبة بعد غياب ${awayDurationSec} ثوانٍ.`
            : `✅ عاد اللاعب ${username} إلى شاشة اللعبة.`,
          timestamp: Date.now(),
          userId,
          username,
          persistent: false,
        };
        this.broadcastNotificationToRoom(roomId, notif);
        if (awayStart) this.sendAwaySummary(roomId, userId, awayStart);

        const seatObj = RoomService.liveSeats(room).find((s) => s.playerId === userId && !s.isBot);
        if (seatObj) {
          seatObj.presence = 'ONLINE';
          seatObj.isTemporarilyBotControlled = false;
          // Previously this also cleared the room's bot timer: coming back to the tab during a bot's
          // turn cancelled the bot's move and the game stood still until the turn timer expired.
          this.gameSessionService.setBotTakeover(roomId, seatObj.seat, false);
        }
        if (room.judge && room.judge.userId === userId) {
          (room.judge as any).presence = 'ONLINE';
        }
        if (room.spectator && room.spectator.userId === userId) {
          (room.spectator as any).presence = 'ONLINE';
        }
        const spec = room.spectators?.find((s) => s.userId === userId);
        if (spec) {
          (spec as any).presence = 'ONLINE';
        }

        this.syncRoomToAll(roomId, room);
        if (room.matchStatus === 'PLAYING') {
          this.broadcastGameState(roomId);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error in handleAppVisibilityChanged: ${err.message}`);
    }
  }

  public handleAppVisibilityChangedDirect(payload: {
    roomId?: string;
    isVisible?: boolean;
    hasWindowFocus?: boolean;
  }, identity: HttpIdentity) {
    try {
      if (!payload?.roomId) return { success: false, error: 'roomId required' };
      const room = this.roomService.getRoom(payload.roomId) || this.roomService.getRoomByCode(payload.roomId);
      if (!room) return { success: false, error: 'Room not found' };
      const roomId = room.id;

      const membership = this.getMembership(room, identity.id);
      if (!membership.isMember) return { success: false, error: 'Not a participant in this room' };
      const userId = identity.id;
      const username = membership.seated?.username || identity.username || 'أحد اللاعبين';

      const isAway = !payload.isVisible || !payload.hasWindowFocus;
      const awayKey = `${roomId}_${userId}`;


      if (isAway) {
        if (this.playerAwaySince.has(awayKey)) return { success: true, isAway: true };
        this.playerAwaySince.set(awayKey, Date.now());
        this.scheduleAwayViolation(roomId, userId);

        const notif: NotificationPayload = {
          type: 'WARNING',
          message: `Anti-cheat: ${username} switched away from the game screen.`,
          arabicMessage: `⚠️ تنبيه نزاهة: اللاعب ${username} خرج من شاشة اللعبة (انتقل لنافذة أو تطبيق آخر).`,
          timestamp: Date.now(),
          userId,
          username,
          persistent: true,
        };
        // فردي بدون حكم: مفيش داعي لتنبيه النزاهة، والعلامة الصغيرة فوق الاسم كفاية (presence = AWAY).
        if (!this.isQuietAwayRoom(room)) this.broadcastNotificationToRoom(roomId, notif);

        const seatObj = RoomService.liveSeats(room).find((s) => s.playerId === userId && !s.isBot);
        if (seatObj) {
          seatObj.presence = 'AWAY';
        }
        if (room.judge && room.judge.userId === userId) {
          (room.judge as any).presence = 'AWAY';
        }
        if (room.spectator && room.spectator.userId === userId) {
          (room.spectator as any).presence = 'AWAY';
        }
        const spec = room.spectators?.find((s) => s.userId === userId);
        if (spec) {
          (spec as any).presence = 'AWAY';
        }

        this.syncRoomToAll(roomId, room);
        if (room.matchStatus === 'PLAYING') {
          this.broadcastGameState(roomId);
        }
      } else {
        this.cancelAwayViolation(roomId, userId);
        if (!this.playerAwaySince.has(awayKey)) return { success: true, isAway: false };
        const awayStart = this.playerAwaySince.get(awayKey);
        this.playerAwaySince.delete(awayKey);
        const awayDurationSec = awayStart ? Math.max(1, Math.round((Date.now() - awayStart) / 1000)) : 0;

        const notif: NotificationPayload = {
          type: 'SUCCESS',
          message: `${username} returned to the game screen${awayDurationSec > 0 ? ` after ${awayDurationSec}s` : ''}.`,
          arabicMessage: awayDurationSec > 0
            ? `✅ عاد اللاعب ${username} إلى شاشة اللعبة بعد غياب ${awayDurationSec} ثوانٍ.`
            : `✅ عاد اللاعب ${username} إلى شاشة اللعبة.`,
          timestamp: Date.now(),
          userId,
          username,
          persistent: false,
        };
        this.broadcastNotificationToRoom(roomId, notif);
        if (awayStart) this.sendAwaySummary(roomId, userId, awayStart);

        const seatObj = RoomService.liveSeats(room).find((s) => s.playerId === userId && !s.isBot);
        if (seatObj) {
          seatObj.presence = 'ONLINE';
        }
        if (room.judge && room.judge.userId === userId) {
          (room.judge as any).presence = 'ONLINE';
        }
        if (room.spectator && room.spectator.userId === userId) {
          (room.spectator as any).presence = 'ONLINE';
        }
        const spec = room.spectators?.find((s) => s.userId === userId);
        if (spec) {
          (spec as any).presence = 'ONLINE';
        }

        this.syncRoomToAll(roomId, room);
        if (room.matchStatus === 'PLAYING') {
          this.broadcastGameState(roomId);
        }
      }
      return { success: true, isAway };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public handleLeaveRoomDirect(roomId: string | undefined, identity: HttpIdentity) {
    const userId = identity.id;
    try {
      if (!roomId) return { success: false, error: 'roomId required' };
      const room = this.roomService.getRoom(roomId) || this.roomService.getRoomByCode(roomId);
      if (!room) return { success: false, error: 'Room not found' };
      const actualRoomId = room.id;
      if (!this.getMembership(room, userId).isMember) {
        return { success: true, alreadyHandled: true };
      }

      // Check deduplication
      if (userId) {
        const leaveKey = `${actualRoomId}_${userId}`;
        const recent = this.recentlyLeftUsers.get(leaveKey);
        if (recent && Date.now() - recent.timestamp < 10000) {
          return { success: true, alreadyHandled: true };
        }
      }

      let leftSeat: PlayerSeat | null = null;
      let leftUsername = 'أحد اللاعبين';

      if (userId) {
        const seated = RoomService.liveSeats(room).find((s) => s.playerId === userId);
        if (seated) {
          leftSeat = seated.seat;
          leftUsername = seated.username || 'أحد اللاعبين';
        }
        this.recentlyLeftUsers.set(`${actualRoomId}_${userId}`, {
          timestamp: Date.now(),
          username: leftUsername,
        });
      }

      const leaveNotif: NotificationPayload = {
        type: 'WARNING',
        message: `${leftUsername} permanently left the room.`,
        arabicMessage: room.matchStatus === 'PLAYING'
          ? `🚪 غادر اللاعب ${leftUsername} الغرفة نهائياً، وتولى مكانه البوت.`
          : `🚪 غادر اللاعب ${leftUsername} الغرفة نهائياً.`,
        timestamp: Date.now(),
        userId,
        username: leftUsername,
        persistent: true,
      };
      this.broadcastNotificationToRoom(actualRoomId, leaveNotif);

      const seatedHumans = room.seats
        ? RoomService.liveSeats(room).filter((s) => s.occupied && !s.isBot && s.playerId && s.playerId !== userId).length
        : 0;
      const judgeHuman = room.judge && room.judge.userId !== userId && room.judge.isConnected ? 1 : 0;
      const spectatorHuman = (room.spectator && room.spectator.userId !== userId && room.spectator.isConnected ? 1 : 0) +
        (room.spectators ? room.spectators.filter((s) => s.userId !== userId && s.isConnected).length : 0);
      const otherConnected = this.roomService
        .getConnectedPlayersInRoom(actualRoomId)
        .filter((cp) => cp.userId !== userId).length;

      const totalRemainingHumans = seatedHumans + judgeHuman + spectatorHuman + otherConnected;

      if (totalRemainingHumans <= 0) {
        this.gameSessionService.endSession(actualRoomId);
        this.roomService.deleteRoom(actualRoomId);
      } else {
        if (leftSeat !== null) {
          this.roomService.cancelDisconnectGrace(actualRoomId, leftSeat);
        }
        const connectedPlayers = this.roomService.getConnectedPlayersInRoom(actualRoomId);
        const targetPlayer = connectedPlayers.find((p) => p.userId === userId);
        let updatedRoom = room;
        if (targetPlayer?.socketId) {
          updatedRoom = this.roomService.leaveRoom(actualRoomId, targetPlayer.socketId) || room;
        } else {
          // No live socket (it died in the background): still release the seat and ownership,
          // otherwise the player stayed a member of a room they had left.
          const m = this.getMembership(room, userId);
          const tempId = `http_leave_${userId}`;
          this.roomService.registerSocket(tempId, identity, m.isJudge ? 'JUDGE' : m.isSpectator && !m.seated ? 'SPECTATOR' : 'PLAYER');
          updatedRoom = this.roomService.leaveRoom(actualRoomId, tempId) || room;
          this.roomService.unregisterSocket(tempId);
        }

        if (leftSeat !== null && updatedRoom?.matchStatus === 'PLAYING') {
          const botSeat = updatedRoom.seats[leftSeat];
          if (botSeat && botSeat.isBot) {
            this.gameSessionService.updateSeatMetadata(actualRoomId, leftSeat, {
              isBot: true,
              botId: botSeat.botId || 'EL_RAYEQ',
              username: botSeat.username || 'الرايق',
              avatar: botSeat.avatar || 'bot-rayeq',
              playerId: botSeat.playerId || `bot_${leftSeat}`,
              isTemporarilyBotControlled: false,
            });
          }
        }

        if (updatedRoom) {
          this.syncRoomToAll(actualRoomId, updatedRoom);
          if (updatedRoom.matchStatus === 'PLAYING') {
            this.broadcastGameState(actualRoomId);
            this.gameSessionService.checkAndTriggerBotTurn(actualRoomId, true);
          }
        }
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @SubscribeMessage(ClientEvents.SELECT_SEAT)
  handleSelectSeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SelectSeatPayload
  ) {
    try {
      if (!payload || !Number.isInteger(payload.seat) || payload.seat < 0 || payload.seat > 3) {
        throw new Error('Invalid seat index: seat must be 0, 1, 2, or 3');
      }
      const { player, room } = this.validateCallerInRoom(client, payload.roomId, (payload as any)?.user);
      const updatedRoom = this.roomService.selectSeat(
        room.id,
        player.userId,
        payload.seat,
        (payload as any)?.user || player
      );
      player.seat = payload.seat;
      const isAdmin =
        room.currentAdminId === player.userId ||
        room.originalAdminId === player.userId ||
        room.ownerId === player.userId;
      player.role = isAdmin ? 'ADMIN' : 'PLAYER';

      // Immediate 0ms broadcast of ROOM_SYNC to every player in the room
      this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      if (room.code && room.code !== room.id) {
        this.server.to(room.code).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }
      client.emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });

      // Direct fallback to each connected player's socket in this room to guarantee zero lag
      const connectedPlayers = this.roomService.getConnectedPlayersInRoom(room.id);
      for (const cp of connectedPlayers) {
        if (cp.socketId && cp.socketId !== client.id) {
          this.server.to(cp.socketId).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
        }
      }

      // Only broadcast GameState if match is actively PLAYING (never broadcast stale rounds during LOBBY)
      if (room.matchStatus === 'PLAYING') {
        this.broadcastGameState(room.id);
      }
    } catch (err: any) {
      this.logger.warn(`[handleSelectSeat Error] room=${payload?.roomId} seat=${payload?.seat}: ${err.message}`);
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.ADMIN_MOVE_SEAT)
  handleAdminMoveSeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AdminMoveSeatPayload
  ) {
    try {
      if (
        !payload ||
        !Number.isInteger(payload.fromSeat) ||
        payload.fromSeat < 0 ||
        payload.fromSeat > 3 ||
        !Number.isInteger(payload.toSeat) ||
        payload.toSeat < 0 ||
        payload.toSeat > 3
      ) {
        throw new Error('Invalid seat indices: fromSeat and toSeat must be 0, 1, 2, or 3');
      }
      const { player, room } = this.validateCallerInRoom(client, payload.roomId, (payload as any)?.user);
      const isAdmin =
        room.currentAdminId === player.userId ||
        room.originalAdminId === player.userId ||
        room.ownerId === player.userId;
      if (!isAdmin) {
        throw new Error('Unauthorized: Only room admin can move player seats');
      }

      const updatedRoom = this.roomService.adminMoveSeat(
        room.id,
        player.userId,
        payload.fromSeat,
        payload.toSeat
      );
      player.role = 'ADMIN';

      this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      if (room.code && room.code !== room.id) {
        this.server.to(room.code).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }
      client.emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });

      const connectedPlayers = this.roomService.getConnectedPlayersInRoom(room.id);
      for (const cp of connectedPlayers) {
        if (cp.socketId && cp.socketId !== client.id) {
          this.server.to(cp.socketId).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
        }
      }
    } catch (err: any) {
      this.logger.warn(`[handleAdminMoveSeat Error] room=${payload?.roomId}: ${err.message}`);
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.ADMIN_TOGGLE_BOT)
  handleAdminToggleBot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AdminToggleBotPayload
  ) {
    try {
      if (!payload || !Number.isInteger(payload.seat) || payload.seat < 0 || payload.seat > 3) {
        throw new Error('Invalid seat index: seat must be 0, 1, 2, or 3');
      }
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId, (payload as any)?.user);
      const userAuth = this.resolveUser(client, (payload as any)?.user);
      const isAdmin =
        room.currentAdminId === player.userId ||
        room.currentAdminId === userAuth.id ||
        room.originalAdminId === player.userId ||
        room.originalAdminId === userAuth.id ||
        room.ownerId === player.userId ||
        room.ownerId === userAuth.id;
      if (!isAdmin) {
        throw new Error('Unauthorized: Only room admin can toggle bots');
      }

      const adminId = room.currentAdminId || userAuth.id || player.userId;
      const updatedRoom = this.roomService.toggleBot(
        room.id,
        adminId,
        payload.seat,
        payload.enable,
        payload.botId
      );
      this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      if (room.code && room.code !== room.id) {
        this.server.to(room.code).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }
      client.emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });

      const connectedPlayers = this.roomService.getConnectedPlayersInRoom(room.id);
      for (const cp of connectedPlayers) {
        if (cp.socketId && cp.socketId !== client.id) {
          this.server.to(cp.socketId).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
        }
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.ADMIN_UPDATE_SETTINGS)
  handleAdminUpdateSettings(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AdminUpdateSettingsPayload
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId, (payload as any)?.user);
      const userAuth = this.resolveUser(client, (payload as any)?.user);
      const isJudge =
        player?.role === 'JUDGE' ||
        room.judge?.userId === userAuth.id;
      const isAdmin =
        room.currentAdminId === player.userId ||
        room.currentAdminId === userAuth.id ||
        room.ownerId === player.userId ||
        room.ownerId === userAuth.id ||
        room.originalAdminId === player.userId ||
        room.originalAdminId === userAuth.id ||
        isJudge;

      if (!isAdmin) {
        throw new Error('Unauthorized: Only room admin or presiding judge can update settings');
      }

      const effectiveAdminId = room.currentAdminId || userAuth.id || player.userId;
      const updatedRoom = this.roomService.updateSettings(
        payload.roomId,
        effectiveAdminId,
        payload.settings
      );
      this.server.to(payload.roomId).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });

      if (typeof payload.settings?.voiceEnabled === 'boolean') {
        const voiceSession = this.voiceService.getOrCreateVoiceRoom(payload.roomId);
        voiceSession.isRoomVoiceEnabled = payload.settings.voiceEnabled;
        const peers = this.voiceService.getPeers(payload.roomId);
        this.server.to(payload.roomId).emit(ServerEvents.VOICE_PEERS_SYNC, { peers });
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.ADMIN_START_MATCH)
  handleAdminStartMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; user?: any; role?: string }
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId, payload?.user);
      const userAuth = this.resolveUser(client, payload?.user);
      const allBotsOccupied = RoomService.liveSeats(room).filter((s) => s.occupied && !s.isBot).length === 0;

      const isAlreadyJudge = Boolean(room.judge && room.judge.userId === userAuth.id);
      const isJudgeRequest = payload?.role === 'JUDGE' || isAlreadyJudge;

      // Only become judge if not already the judge: joinAsJudge() toggles an existing judge back
      // into a player seat, which used to silently remove the referee when they pressed "start".
      if (payload?.role === 'JUDGE' && !isAlreadyJudge) {
        try {
          this.roomService.joinAsJudge(room.id, client.id, userAuth);
        } catch (err: any) {
          this.logger.log(`joinAsJudge call during start match: ${err.message}`);
        }
      }

      const humanSeats = RoomService.liveSeats(room).filter((s) => s.occupied && !s.isBot);
      const isSoloHuman = humanSeats.length <= 1;

      const isAuthorized =
        room.currentAdminId === player.userId ||
        room.originalAdminId === player.userId ||
        room.ownerId === player.userId ||
        room.currentAdminId === userAuth.id ||
        room.ownerId === userAuth.id ||
        isJudgeRequest ||
        allBotsOccupied ||
        isSoloHuman ||
        RoomService.liveSeats(room).some((s) => s.playerId === userAuth.id || s.playerId === player.userId);

      if (!isAuthorized) {
        this.logger.warn(`Unauthorized start match attempt by ${player.username} in room ${room.id}`);
        throw new Error('Unauthorized: Only room admin or presiding judge can start match');
      }

      // Guarantee room currentAdminId is aligned to caller to prevent downstream authorization errors
      room.currentAdminId = userAuth.id || player.userId;

      this.gameSessionService.startMatch(payload.roomId, userAuth.id || player.userId);
      const updatedRoom = this.roomService.getRoom(payload.roomId);
      if (updatedRoom) {
        this.server.to(payload.roomId).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }
      this.broadcastGameState(payload.roomId, client.id);
    } catch (err: any) {
      this.logger.error(`Error starting match in room ${payload?.roomId}: ${err.message}`);
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.PLAY_TILE)
  handlePlayTile(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PlayTilePayload
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId);
      if (player.seat === null || !Number.isInteger(player.seat) || player.seat < 0 || player.seat > 3) {
        client.emit(ServerEvents.MOVE_REJECTED, { reason: 'Player is not seated in an active slot' });
        return;
      }

      if (
        !payload.tile ||
        !Array.isArray(payload.tile) ||
        payload.tile.length !== 2 ||
        !Number.isInteger(payload.tile[0]) ||
        !Number.isInteger(payload.tile[1]) ||
        payload.tile[0] < 0 ||
        payload.tile[0] > 6 ||
        payload.tile[1] < 0 ||
        payload.tile[1] > 6
      ) {
        client.emit(ServerEvents.MOVE_REJECTED, { reason: 'Malformed tile payload' });
        return;
      }

      if (payload.end && !['LEFT', 'RIGHT', 'START'].includes(payload.end)) {
        client.emit(ServerEvents.MOVE_REJECTED, { reason: 'Invalid chain end specified' });
        return;
      }

      const result = this.gameSessionService.playTile(
        room.id,
        player.seat,
        payload.tile,
        payload.end,
        payload.sequenceNumber
      );

      if (!result.success) {
        client.emit(ServerEvents.MOVE_REJECTED, {
          reason: result.error || 'Illegal move rejected',
          tile: payload.tile,
        });
        this.resyncPlayer(client, room.id);
      }
    } catch (err: any) {
      client.emit(ServerEvents.MOVE_REJECTED, { reason: err.message || 'Action rejected' });
      if (payload?.roomId) this.resyncPlayer(client, payload.roomId);
    }
  }

  @SubscribeMessage(ClientEvents.PASS_TURN)
  handlePassTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PassTurnPayload
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId);
      if (player.seat === null || !Number.isInteger(player.seat) || player.seat < 0 || player.seat > 3) {
        client.emit(ServerEvents.MOVE_REJECTED, { reason: 'Player is not seated in an active slot' });
        return;
      }

      const result = this.gameSessionService.passTurn(room.id, player.seat, payload.sequenceNumber);
      if (!result.success) {
        client.emit(ServerEvents.MOVE_REJECTED, {
          reason: result.error || 'Cannot pass turn',
        });
        this.resyncPlayer(client, room.id);
      }
    } catch (err: any) {
      client.emit(ServerEvents.MOVE_REJECTED, { reason: err.message || 'Pass rejected' });
      if (payload?.roomId) this.resyncPlayer(client, payload.roomId);
    }
  }

  @SubscribeMessage(ClientEvents.JUDGE_REPORT_CHEATING)
  handleJudgeReportCheating(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JudgeReportCheatingPayload
  ) {
    try {
      const { player, room } = this.validateJudgeInRoom(client, payload?.roomId, (payload as any)?.user);
      const offendingSeat = Number(payload?.offendingSeat) as PlayerSeat;
      if (
        !Number.isInteger(offendingSeat) ||
        offendingSeat < 0 ||
        offendingSeat > 3
      ) {
        throw new Error('رقم المقعد غير صالح (0..3)');
      }

      const reason = typeof payload.reason === 'string' && payload.reason.trim()
        ? payload.reason.trim()
        : 'ثبوت واقعة غش صريحة بقرار تحكيمي';

      const result = this.gameSessionService.penalizeCheating(
        payload.roomId,
        player.userId,
        offendingSeat,
        reason
      );

      if (result.success && result.roundResult?.cheatingDetails) {
        const targetPlayer = room.seats[offendingSeat];
        const targetPlayerName = targetPlayer?.username || `لاعب ${offendingSeat + 1}`;
        const targetTeam = (offendingSeat === 0 || offendingSeat === 2 ? 1 : 2) as TeamId;
        const beneficiaryTeam = (offendingSeat === 0 || offendingSeat === 2 ? 2 : 1) as TeamId;

        const broadcastPayload: RefereeDecisionBroadcastPayload = {
          actionType: 'YELLOW_CARD_2_CHEATING',
          judgeName: player.username,
          targetSeat: offendingSeat,
          targetPlayerName,
          targetTeam,
          beneficiaryTeam,
          title: 'احتساب غش وإنهاء الجولة',
          arabicMessage: `أعلن الحكم ثبوت حالة غش على اللاعب ${targetPlayerName}! تم إنهاء الجولة واحتساب نقاطها للفريق المنافس.`,
          reason,
          timestamp: Date.now(),
        };

        this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.broadcastGameState(payload.roomId);
      } else {
        client.emit(ServerEvents.ROOM_ERROR, { message: result.error || 'فشل تطبيق عقوبة الغش' });
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message || 'خطأ في تنفيذ قرار الغش' });
    }
  }

  @SubscribeMessage(ClientEvents.JUDGE_WARN_PLAYER)
  handleJudgeWarnPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JudgeWarnPlayerPayload
  ) {
    try {
      const { player, room } = this.validateJudgeInRoom(client, payload?.roomId, (payload as any)?.user);
      const seat = Number(payload?.seat) as PlayerSeat;
      if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
        throw new Error('رقم المقعد غير صالح');
      }

      const reason = payload.reason?.trim() || 'مخالفة أو تعطيل اللعب';
      const result = this.gameSessionService.warnPlayer(payload.roomId, player.userId, seat, reason);

      if (result.success) {
        const targetPlayer = room.seats[seat];
        const targetPlayerName = targetPlayer?.username || `لاعب ${seat + 1}`;
        const targetTeam = (seat === 0 || seat === 2 ? 1 : 2) as TeamId;
        const beneficiaryTeam = (seat === 0 || seat === 2 ? 2 : 1) as TeamId;
        const isCheating = Boolean(result.isCheatingTriggered);

        const actionType: RefereeActionType = isCheating ? 'YELLOW_CARD_2_CHEATING' : 'YELLOW_CARD_1';
        const title = isCheating ? 'إنذار ثانٍ (كارت أحمر) - إنهاء الجولة' : 'كارت أصفر (إنذار أول)';
        const arabicMessage = isCheating
          ? `حصل اللاعب ${targetPlayerName} على الإنذار الثاني! وبناءً عليه تم احتساب حالة غش وإنهاء الجولة ومنح نقاطها للفريق المنافس.`
          : `أشهر الحكم كارت أصفر (إنذار أول) في وجه اللاعب ${targetPlayerName}.`;

        const broadcastPayload: RefereeDecisionBroadcastPayload = {
          actionType,
          judgeName: player.username,
          targetSeat: seat,
          targetPlayerName,
          targetTeam,
          beneficiaryTeam,
          title,
          arabicMessage,
          reason,
          timestamp: Date.now(),
        };

        this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.notifyWarnedPlayer(room.id, seat, player.username, reason, isCheating);
        this.broadcastGameState(payload.roomId);
        if (RoomService.liveSeats(room).every((s: any) => s.isBot)) {
          this.gameSessionService.checkAndTriggerBotTurn(payload.roomId, true);
        }
      } else {
        client.emit(ServerEvents.ROOM_ERROR, { message: result.error || 'فشل توجيه الإنذار' });
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message || 'خطأ في تنفيذ قرار الإنذار' });
    }
  }

  @SubscribeMessage(ClientEvents.JUDGE_DIRECT_RED_CARD)
  handleJudgeDirectRedCard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JudgeDirectRedCardPayload
  ) {
    try {
      const { player, room } = this.validateJudgeInRoom(client, payload?.roomId, (payload as any)?.user);
      const seat = Number(payload?.seat) as PlayerSeat;
      if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
        throw new Error('رقم المقعد غير صالح');
      }

      const reason = payload.reason?.trim() || 'كارت أحمر مباشر - ثبوت واقعة غش صريحة';
      const result = this.gameSessionService.directRedCard(payload.roomId, player.userId, seat, reason);

      if (result.success) {
        const targetPlayer = room.seats[seat];
        const targetPlayerName = targetPlayer?.username || `لاعب ${seat + 1}`;
        const targetTeam = (seat === 0 || seat === 2 ? 1 : 2) as TeamId;
        const beneficiaryTeam = (seat === 0 || seat === 2 ? 2 : 1) as TeamId;

        const broadcastPayload: RefereeDecisionBroadcastPayload = {
          actionType: 'DIRECT_RED_CARD',
          judgeName: player.username,
          targetSeat: seat,
          targetPlayerName,
          targetTeam,
          beneficiaryTeam,
          title: 'كارت أحمر مباشر',
          arabicMessage: `أشهر الحكم الكارت الأحمر المباشر للاعب ${targetPlayerName}! تم إنهاء الجولة واحتساب نقاطها للفريق المنافس.`,
          reason,
          timestamp: Date.now(),
        };

        this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.broadcastGameState(payload.roomId);
      } else {
        client.emit(ServerEvents.ROOM_ERROR, { message: result.error || 'فشل تطبيق الكارت الأحمر' });
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message || 'خطأ في تنفيذ الكارت الأحمر' });
    }
  }

  @SubscribeMessage(ClientEvents.JUDGE_MUTE_ACTION)
  handleJudgeMuteAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JudgeMuteActionPayload
  ) {
    try {
      const { player, room } = this.validateJudgeInRoom(client, payload?.roomId, (payload as any)?.user);
      let targetName = 'مشارك';
      if (payload.targetType === 'SEAT' && typeof payload.seat === 'number') {
        this.gameSessionService.setPlayerMute(payload.roomId, payload.seat, payload.muteType, payload.mute);
        targetName = room.seats[payload.seat]?.username || `لاعب ${payload.seat + 1}`;
      } else if (payload.targetType === 'SPECTATOR' && payload.userId) {
        this.roomService.setSpectatorMute(payload.roomId, payload.userId, payload.muteType === 'REACTIONS' ? 'CHAT' : payload.muteType, payload.mute);
        const spec = (room.spectators || []).find((s: any) => s.userId === payload.userId) || (room.spectator?.userId === payload.userId ? room.spectator : null);
        targetName = spec?.username || 'مشاهد';
      }

      const typeMap: Record<string, string> = {
        CHAT: 'الدردشة',
        REACTIONS: 'التفاعلات',
        VOICE: 'الصوت',
      };
      const label = typeMap[payload.muteType] || 'الصوت والدردشة';
      const actionTitle = payload.mute ? `كتم ${label}` : `إلغاء كتم ${label}`;
      const reason = payload.mute ? `مخالفة في ${label}` : `إلغاء عقوبة ${label}`;

      let actionType: RefereeActionType = 'MUTE_CHAT';
      if (payload.muteType === 'CHAT') actionType = payload.mute ? 'MUTE_CHAT' : 'UNMUTE_CHAT';
      if (payload.muteType === 'REACTIONS') actionType = payload.mute ? 'MUTE_REACTIONS' : 'UNMUTE_REACTIONS';
      if (payload.muteType === 'VOICE') actionType = payload.mute ? 'MUTE_VOICE' : 'UNMUTE_VOICE';

      this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, {
        actionType,
        judgeName: player.username,
        targetSeat: payload.seat,
        targetPlayerName: targetName,
        title: actionTitle,
        arabicMessage: `قام الحكم ${payload.mute ? 'بكتم' : 'بإلغاء كتم'} ${label} عن ${targetName}.`,
        reason,
        timestamp: Date.now(),
      });

      if (payload.muteType === 'VOICE') {
        const targetUserId =
          payload.targetType === 'SEAT' && typeof payload.seat === 'number'
            ? room.seats[payload.seat]?.playerId
            : payload.userId;
        if (targetUserId) {
          this.voiceService.setMute(payload.roomId, targetUserId, payload.mute);
          const peers = this.voiceService.getPeers(payload.roomId);
          this.server.to(payload.roomId).emit(ServerEvents.VOICE_PEERS_SYNC, { peers });
        }
      }

      const updatedRoom = this.roomService.getRoom(payload.roomId);
      if (updatedRoom) {
        this.server.to(payload.roomId).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }

      this.broadcastGameState(payload.roomId);
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message || 'خطأ في تنفيذ الكتم' });
    }
  }

  @SubscribeMessage(ClientEvents.JUDGE_VOID_ROUND)
  handleJudgeVoidRound(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JudgeVoidRoundPayload
  ) {
    try {
      const { player, room } = this.validateJudgeInRoom(client, payload?.roomId, (payload as any)?.user);
      const voidReason = payload.reason?.trim() || 'إلغاء وإعادة توزيع الجولة بقرار تحكيمي رسمي';
      const result = this.gameSessionService.voidCurrentRound(payload.roomId, player.userId, voidReason);

      if (result.success) {
        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, {
          actionType: 'VOID_ROUND',
          judgeName: player.username,
          targetPlayerName: 'جميع اللاعبين',
          title: 'إلغاء وإعادة الجولة',
          arabicMessage: 'قرر الحكم إلغاء الجولة الحالية وإعادة توزيع الدومينو دون أي تعديل على النقاط!',
          reason: voidReason,
          timestamp: Date.now(),
        });
        this.broadcastGameState(payload.roomId);
      } else {
        client.emit(ServerEvents.ROOM_ERROR, { message: result.error || 'لا يمكن إلغاء الجولة' });
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message || 'خطأ في إلغاء الجولة' });
    }
  }

  @SubscribeMessage(ClientEvents.JUDGE_GRANT_EXTRA_TIME)
  handleJudgeGrantExtraTime(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JudgeGrantExtraTimePayload
  ) {
    try {
      const { player, room } = this.validateJudgeInRoom(client, payload?.roomId, (payload as any)?.user);
      const secs = payload.seconds || 20;
      const result = this.gameSessionService.grantExtraTime(payload.roomId, secs);

      if (result.success) {
        const currentSeat = (result as any).currentSeat ?? (this.gameSessionService.getSession(payload.roomId)?.getCurrentTurnSeat());
        const targetPlayer = room.seats[currentSeat];
        const targetPlayerName = targetPlayer?.username || (currentSeat !== undefined ? `لاعب ${currentSeat + 1}` : 'اللاعب الحالي');

        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, {
          actionType: 'GRANT_EXTRA_TIME',
          judgeName: player.username,
          targetSeat: currentSeat,
          targetPlayerName,
          title: 'منح وقت إضافي (+20ث)',
          arabicMessage: `منح الحكم +${secs} ثانية إضافية للتفكير في الدور الحالي!`,
          reason: `منح +${secs} ثانية وقت تفكير إضافي`,
          timestamp: Date.now(),
        });
        this.broadcastGameState(payload.roomId);
      } else {
        client.emit(ServerEvents.ROOM_ERROR, { message: result.error || 'فشل منح الوقت الإضافي' });
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message || 'خطأ في منح الوقت الإضافي' });
    }
  }

  @SubscribeMessage(ClientEvents.JUDGE_TERMINATE_MATCH)
  handleJudgeTerminateMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JudgeTerminateMatchPayload
  ) {
    try {
      const { player, room } = this.validateJudgeInRoom(client, payload?.roomId, (payload as any)?.user);
      const reason = payload.reason?.trim() || 'إنهاء المباراة بقرار إداري من الحكم';
      const result = this.gameSessionService.terminateMatch(payload.roomId, player.userId, payload.winnerTeam, reason);

      if (result.success) {
        const winner = (result as any).matchResult?.winnerTeam || payload.winnerTeam || 1;
        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, {
          actionType: 'TERMINATE_MATCH',
          judgeName: player.username,
          targetPlayerName: `فريق ${winner === 1 ? 2 : 1}`,
          title: 'إنهاء المباراة بقرار تحكيمي',
          arabicMessage: `أنهى الحكم المباراة رسمياً واحتسب الفوز لفريق ${winner}!`,
          reason,
          timestamp: Date.now(),
        });
        this.broadcastGameState(payload.roomId);
      } else {
        client.emit(ServerEvents.ROOM_ERROR, { message: 'لا يمكن إنهاء المباراة' });
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message || 'خطأ في إنهاء المباراة' });
    }
  }

  @SubscribeMessage(ClientEvents.JUDGE_SUB_SEAT)
  handleJudgeSubSeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JudgeSubSeatPayload
  ) {
    try {
      const { player, room } = this.validateJudgeInRoom(client, payload?.roomId, (payload as any)?.user);
      const seat = Number(payload.seat) as PlayerSeat;
      if (payload.action === 'KICK_TO_SPECTATOR') {
        const targetPlayer = room.seats[seat];
        const targetName = targetPlayer?.username || `لاعب ${seat + 1}`;
        const kickRes = this.roomService.kickSeatToSpectator(payload.roomId, seat, payload.botId);
        if (kickRes.success && kickRes.botConfig) {
          this.gameSessionService.updateSeatMetadata(payload.roomId, seat, {
            isBot: true,
            botId: kickRes.botConfig.botId,
            username: kickRes.botConfig.name,
            avatar: kickRes.botConfig.avatar,
            playerId: `bot_${seat}`,
          });

          const isHumanKick = Boolean(kickRes.kickedUser);
          const broadcastPayload: RefereeDecisionBroadcastPayload = {
            actionType: 'KICK_TO_SPECTATOR',
            judgeName: player.username,
            targetSeat: seat,
            targetPlayerName: targetName,
            title: isHumanKick ? 'طرد للمشاهدين واستبدال ببوت' : 'تغيير البوت',
            arabicMessage: isHumanKick
              ? `قرر الحكم تحويل اللاعب ${targetName} إلى مقاعد المشاهدين واستبداله بالبوت (${kickRes.botConfig.name})!`
              : `قام الحكم باستبدال البوت في المقعد ${seat + 1} بالبوت (${kickRes.botConfig.name}).`,
            reason: `استبدال بالبوت ${kickRes.botConfig.name}`,
            timestamp: Date.now(),
          };

          this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          this.broadcastGameState(payload.roomId, client.id);
          if (RoomService.liveSeats(room).every((s: any) => s.isBot)) {
            this.gameSessionService.checkAndTriggerBotTurn(payload.roomId, true);
          }
        } else {
          client.emit(ServerEvents.ROOM_ERROR, { message: kickRes.error || 'فشل استبدال المقعد ببوت' });
        }
      } else if (payload.action === 'RETURN_FROM_SPECTATOR' || payload.action === 'SUB_SPECTATOR_TO_SEAT') {
        if (!payload.spectatorUserId) {
          throw new Error('معرف المشاهد مطلوب');
        }
        const returnRes = this.roomService.returnSpectatorToSeat(payload.roomId, payload.spectatorUserId, seat);
        if (returnRes.success && returnRes.restoredUser) {
          this.gameSessionService.updateSeatMetadata(payload.roomId, seat, {
            isBot: false,
            playerId: returnRes.restoredUser.userId,
            username: returnRes.restoredUser.username,
            avatar: returnRes.restoredUser.avatar,
            botId: undefined,
          });

          const broadcastPayload: RefereeDecisionBroadcastPayload = {
            actionType: 'RETURN_FROM_SPECTATOR',
            judgeName: player.username,
            targetSeat: seat,
            targetPlayerName: returnRes.restoredUser.username,
            title: 'إعادة مشارك إلى الطاولة',
            arabicMessage: `أعاد الحكم اللاعب ${returnRes.restoredUser.username} من المشاهدين إلى المقعد ${seat + 1}.`,
            reason: 'إعادة اللاعب للمقعد بقرار تحكيمي',
            timestamp: Date.now(),
          };

          this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          this.broadcastGameState(payload.roomId, client.id);
        } else {
          client.emit(ServerEvents.ROOM_ERROR, { message: returnRes.error || 'فشل إعادة اللاعب إلى المقعد' });
        }
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message || 'خطأ في استبدال المقعد' });
    }
  }

  @SubscribeMessage(ClientEvents.VOICE_SIGNAL)
  handleVoiceSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VoiceSignalPayload
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId);
      if (!room.settings.voiceEnabled) return;

      const peers = this.voiceService.getPeers(payload.roomId);
      const targetPeer = peers.find((p) => p.userId === payload.targetUserId);

      if (targetPeer) {
        this.server.to(targetPeer.socketId).emit(ServerEvents.VOICE_SIGNAL, {
          fromUserId: player.userId,
          signal: payload.signal,
        });
      }
    } catch {
      // Ignore unauthorized voice signals silently
    }
  }

  private broadcastVoicePeers(roomId: string) {
    try {
      const peers = this.voiceService.getPeers(roomId);
      this.server.to(roomId).emit(ServerEvents.VOICE_PEERS_SYNC, { peers });
    } catch {
      // Ignore
    }
  }

  @SubscribeMessage(ClientEvents.VOICE_MUTE)
  handleVoiceMute(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VoiceMutePayload
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId);
      if (!room.settings.voiceEnabled) return;

      this.voiceService.setMute(payload.roomId, player.userId, !!payload.isMuted);
      this.broadcastVoicePeers(payload.roomId);
    } catch {
      // Ignore
    }
  }


  @SubscribeMessage(ClientEvents.REQUEST_NEXT_ROUND)
  handleRequestNextRound(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; user?: any }
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId, (payload as any)?.user);
      const userId = player.userId;
      payload.roomId = room.id;
      const result = this.gameSessionService.requestNextRound(payload.roomId, userId);
      if (result.success) {
        this.broadcastGameState(payload.roomId);
      }
    } catch (err: any) {
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(ClientEvents.REMATCH_REQUEST)
  handleRematchRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any
  ) {
    try {
      this.logger.log(`[GATEWAY] REMATCH_REQUEST received from ${client.id}`);

      const playerLookup = this.roomService.getPlayerBySocket(client.id);
      const targetRoomId =
        (typeof payload === 'string' ? payload : payload?.roomId) ||
        playerLookup?.roomId;

      if (payload?.user) {
        this.resolveUser(client, payload.user);
      }

      const room = targetRoomId ? this.roomService.getRoom(targetRoomId) : null;
      if (!room) {
        // Auto-recover for quick match / bot game if room expired or server restarted
        this.logger.warn(`Room ${targetRoomId || 'unknown'} not found for rematch, auto-creating a fresh Quick Match room`);
        const user = client.data.user || payload?.user || {
          id: `user_${Date.now()}`,
          username: 'Player',
          avatar: 'avatar-1',
        };
        const initialRole = (playerLookup?.role === 'JUDGE' || payload?.user?.role === 'JUDGE')
          ? 'JUDGE'
          : (playerLookup?.role === 'SPECTATOR' || payload?.user?.role === 'SPECTATOR')
          ? 'SPECTATOR'
          : 'ADMIN';

        const newRoom = this.roomService.createRoom(
          client.id,
          user,
          'Quick Match (Ahwa)',
          {
            targetScore: 101,
            fillWithBots: true,
            maxPlayers: 4,
            allowJudge: true,
            allowSpectator: true,
            voiceEnabled: true,
            selectedBotId: 'EL_SAMY',
          },
          initialRole
        );
        client.join(newRoom.id);
        client.emit(ServerEvents.ROOM_SYNC, { room: newRoom });

        this.gameSessionService.startRematch(newRoom.id, user.id, {
          userId: user.id,
          username: user.username,
          avatar: user.avatar,
        });

        client.emit(ServerEvents.REMATCH_STARTED, { roomId: newRoom.id });
        this.server.to(newRoom.id).emit(ServerEvents.REMATCH_STARTED, { roomId: newRoom.id });
        this.broadcastGameState(newRoom.id, client.id);
        return;
      }

      const { player } = this.validateCallerInRoom(client, targetRoomId, payload?.user);
      client.join(targetRoomId);

      const adminId = room.currentAdminId || player.userId;
      this.logger.log(`[GATEWAY] Calling startRematch for room ${targetRoomId}, admin ${adminId}, user ${player.username}`);

      this.gameSessionService.startRematch(targetRoomId, adminId, {
        userId: player.userId,
        username: player.username,
        avatar: player.avatar,
      });

      this.logger.log(`Rematch started successfully in room ${targetRoomId} by user ${player.username}`);

      client.emit(ServerEvents.REMATCH_STARTED, { roomId: targetRoomId });
      this.server.to(targetRoomId).emit(ServerEvents.REMATCH_STARTED, { roomId: targetRoomId });
      this.broadcastGameState(targetRoomId, client.id);
    } catch (err: any) {
      this.logger.error(`Rematch request failed: ${err.message}`);
      client.emit(ServerEvents.ROOM_ERROR, { message: err.message });
    }
  }

  public startRematchForRoom(targetRoomId: string | undefined, identity: HttpIdentity) {
    let room = targetRoomId ? this.findRoom(targetRoomId) : undefined;
    if (room && !this.getMembership(room, identity.id).isMember) {
      return { success: false, error: 'Not a participant in this room' };
    }
    if (!room) {
      room = this.roomService.createRoom(
        `http_${identity.id}`,
        identity,
        'Quick Match (Ahwa)',
        {
          targetScore: 101,
          fillWithBots: true,
          maxPlayers: 4,
          allowJudge: true,
          allowSpectator: true,
          voiceEnabled: true,
          selectedBotId: 'EL_SAMY',
        },
        'ADMIN'
      );
    }

    const adminId = room.currentAdminId || identity.id;
    this.gameSessionService.startRematch(room.id, adminId, {
      userId: identity.id,
      username: identity.username,
      avatar: identity.avatar,
    });

    this.emitToRoom(room.id, ServerEvents.REMATCH_STARTED, { roomId: room.id });
    this.broadcastGameState(room.id);
    return { success: true, roomId: room.id };
  }

  public startMatchForRoom(targetRoomId: string | undefined, identity: HttpIdentity) {
    const room = targetRoomId ? this.findRoom(targetRoomId) : undefined;
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    const m = this.getMembership(room, identity.id);
    if (!m.isMember) {
      return { success: false, error: 'Not a participant in this room' };
    }

    const existingEngine = this.gameSessionService.getSession(room.id);
    if (existingEngine && existingEngine.getStatus() === 'PLAYING') {
      this.gameSessionService.checkAndTriggerBotTurn(room.id);
      this.broadcastGameState(room.id);
      return { success: true, roomId: room.id };
    }

    const humanSeats = RoomService.liveSeats(room).filter((s) => s.occupied && !s.isBot);
    const isAuthorized = m.isAdmin || m.isJudge || Boolean(m.seated) || humanSeats.length <= 1;
    if (!isAuthorized) {
      return { success: false, error: 'Only the room admin or presiding judge can start the match' };
    }

    try {
      this.gameSessionService.startMatch(room.id, room.currentAdminId || identity.id);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
    this.broadcastGameState(room.id);
    return { success: true, roomId: room.id };
  }

  public triggerBotForRoom(targetRoomId: string | undefined, forceImmediate: boolean | undefined, identity: HttpIdentity) {
    const room = targetRoomId ? this.findRoom(targetRoomId) : undefined;
    if (!room) return { success: false, error: 'Room ID is required' };
    if (!this.getMembership(room, identity.id).isMember) {
      return { success: false, error: 'Not a participant in this room' };
    }
    const canForce = Boolean(forceImmediate) && room.judge?.userId === identity.id;
    this.gameSessionService.checkAndTriggerBotTurn(room.id, false, canForce);
    return { success: true, roomId: room.id };
  }

  public executeJudgeDecision(payload: {
    roomId: string;
    action: 'WARN' | 'RED_CARD' | 'CHEATING' | 'MUTE' | 'VOID' | 'EXTRA_TIME' | 'TERMINATE' | 'SUB';
    seat?: number;
    reason?: string;
    user?: any;
    muteType?: 'CHAT' | 'REACTIONS' | 'VOICE';
    mute?: boolean;
    winnerTeam?: 1 | 2;
  }, identity: HttpIdentity) {
    const room = payload?.roomId ? this.findRoom(payload.roomId) : undefined;
    if (!room) return { success: false, error: 'Room not found' };
    payload.roomId = room.id;

    // Only the room's presiding judge may issue referee decisions.
    if (!room.judge || room.judge.userId !== identity.id) {
      return { success: false, error: 'غير مسموح: هذا الإجراء متاح لحكم الغرفة فقط' };
    }
    const seatNum = Number(payload.seat);
    if (['WARN', 'RED_CARD', 'CHEATING', 'MUTE', 'SUB'].includes(payload.action) &&
        (!Number.isInteger(seatNum) || seatNum < 0 || seatNum > 3)) {
      return { success: false, error: 'رقم المقعد غير صالح' };
    }

    const judgeName = room.judge.username || 'الحكم';
    const judgeId = room.judge.userId;

    if (payload.action === 'WARN') {
      const seat = Number(payload.seat) as PlayerSeat;
      const reason = payload.reason?.trim() || 'مخالفة أو تعطيل اللعب';
      const result = this.gameSessionService.warnPlayer(payload.roomId, judgeId, seat, reason);
      if (result.success) {
        const targetPlayer = room.seats[seat];
        const targetPlayerName = targetPlayer?.username || `لاعب ${seat + 1}`;
        const isCheating = Boolean(result.isCheatingTriggered);
        const actionType: RefereeActionType = isCheating ? 'YELLOW_CARD_2_CHEATING' : 'YELLOW_CARD_1';
        const title = isCheating ? 'إنذار ثانٍ (كارت أحمر) - إنهاء الجولة' : 'كارت أصفر (إنذار أول)';
        const arabicMessage = isCheating
          ? `حصل اللاعب ${targetPlayerName} على الإنذار الثاني! وبناءً عليه تم احتساب حالة غش وإنهاء الجولة ومنح نقاطها للفريق المنافس.`
          : `أشهر الحكم كارت أصفر (إنذار أول) في وجه اللاعب ${targetPlayerName}.`;

        const broadcastPayload: RefereeDecisionBroadcastPayload = {
          actionType,
          judgeName,
          targetSeat: seat,
          targetPlayerName,
          targetTeam: (seat === 0 || seat === 2 ? 1 : 2) as TeamId,
          beneficiaryTeam: (seat === 0 || seat === 2 ? 2 : 1) as TeamId,
          title,
          arabicMessage,
          reason,
          timestamp: Date.now(),
        };
        this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.notifyWarnedPlayer(room.id, seat, judgeName, reason, isCheating);
        this.broadcastGameState(payload.roomId);
        if (RoomService.liveSeats(room).every((s: any) => s.isBot)) {
          this.gameSessionService.checkAndTriggerBotTurn(payload.roomId, true);
        }
        return { success: true, result: broadcastPayload };
      }
      return { success: false, error: result.error };
    }

    if (payload.action === 'RED_CARD' || payload.action === 'CHEATING') {
      const seat = Number(payload.seat) as PlayerSeat;
      const reason = payload.reason?.trim() || 'كارت أحمر مباشر - احتساب حالة غش صريحة';
      const result = this.gameSessionService.directRedCard(payload.roomId, judgeId, seat, reason);
      if (result.success) {
        const targetPlayer = room.seats[seat];
        const targetPlayerName = targetPlayer?.username || `لاعب ${seat + 1}`;
        const broadcastPayload: RefereeDecisionBroadcastPayload = {
          actionType: 'DIRECT_RED_CARD',
          judgeName,
          targetSeat: seat,
          targetPlayerName,
          targetTeam: (seat === 0 || seat === 2 ? 1 : 2) as TeamId,
          beneficiaryTeam: (seat === 0 || seat === 2 ? 2 : 1) as TeamId,
          title: 'كارت أحمر مباشر',
          arabicMessage: `أشهر الحكم الكارت الأحمر المباشر للاعب ${targetPlayerName}! تم إنهاء الجولة واحتساب نقاطها للفريق المنافس.`,
          reason,
          timestamp: Date.now(),
        };
        this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.broadcastGameState(payload.roomId);
        return { success: true, result: broadcastPayload };
      }
      return { success: false, error: result.error };
    }

    if (payload.action === 'VOID') {
      const reason = payload.reason?.trim() || 'إلغاء وإعادة توزيع الجولة بقرار تحكيمي رسمي';
      const result = this.gameSessionService.voidCurrentRound(payload.roomId, judgeId, reason);
      if (result.success) {
        const broadcastPayload: RefereeDecisionBroadcastPayload = {
          actionType: 'VOID_ROUND',
          judgeName,
          targetPlayerName: 'جميع اللاعبين (كافة المقاعد)',
          title: 'إلغاء وإعادة الجولة',
          arabicMessage: 'قرر الحكم إلغاء الجولة الحالية وإعادة توزيع الدومينو دون أي تعديل على النقاط!',
          reason,
          timestamp: Date.now(),
        };
        this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.broadcastGameState(payload.roomId);
        return { success: true, result: broadcastPayload };
      }
      return { success: false, error: result.error };
    }

    if (payload.action === 'EXTRA_TIME') {
      const secs = 20;
      const result = this.gameSessionService.grantExtraTime(payload.roomId, secs);
      if (result.success) {
        const currentSeat = ((result as any).currentSeat ?? (this.gameSessionService.getSession(payload.roomId)?.getCurrentTurnSeat())) as PlayerSeat;
        const targetPlayer = room.seats[currentSeat];
        const targetPlayerName = targetPlayer?.username || (currentSeat !== undefined ? `لاعب ${Number(currentSeat) + 1}` : 'اللاعب الحالي');
        const broadcastPayload: RefereeDecisionBroadcastPayload = {
          actionType: 'GRANT_EXTRA_TIME',
          judgeName,
          targetSeat: currentSeat,
          targetPlayerName,
          title: 'منح وقت إضافي (+20ث)',
          arabicMessage: `منح الحكم +${secs} ثانية إضافية للتفكير في الدور الحالي!`,
          reason: `منح +${secs} ثانية وقت تفكير إضافي`,
          timestamp: Date.now(),
        };
        this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.broadcastGameState(payload.roomId);
        return { success: true, result: broadcastPayload };
      }
      return { success: false, error: result.error };
    }

    if (payload.action === 'TERMINATE') {
      const reason = payload.reason?.trim() || 'إنهاء المباراة بقرار إداري من الحكم';
      const result = this.gameSessionService.terminateMatch(payload.roomId, judgeId, payload.winnerTeam || 1, reason);
      if (result.success) {
        const winner = payload.winnerTeam || 1;
        const broadcastPayload: RefereeDecisionBroadcastPayload = {
          actionType: 'TERMINATE_MATCH',
          judgeName,
          targetPlayerName: `فريق ${winner === 1 ? 2 : 1} (لصالح فريق ${winner})`,
          title: 'إنهاء المباراة بقرار تحكيمي',
          arabicMessage: `أنهى الحكم المباراة رسمياً واحتسب الفوز لفريق ${winner}!`,
          reason,
          timestamp: Date.now(),
        };
        this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.broadcastGameState(payload.roomId);
        return { success: true, result: broadcastPayload };
      }
      return { success: false, error: result.error };
    }

    if (payload.action === 'MUTE') {
      const seat = Number(payload.seat) as PlayerSeat;
      const muteType = payload.muteType || 'VOICE';
      const mute = payload.mute ?? true;
      this.gameSessionService.setPlayerMute(payload.roomId, seat, muteType, mute);
      const targetName = room.seats[seat]?.username || `لاعب ${Number(seat) + 1}`;
      const typeMap: Record<string, string> = { CHAT: 'الدردشة', REACTIONS: 'التفاعلات', VOICE: 'الصوت' };
      const label = typeMap[muteType] || 'الصوت والدردشة';
      const broadcastPayload: RefereeDecisionBroadcastPayload = {
        actionType: muteType === 'CHAT' ? (mute ? 'MUTE_CHAT' : 'UNMUTE_CHAT') : (mute ? 'MUTE_VOICE' : 'UNMUTE_VOICE'),
        judgeName,
        targetSeat: seat,
        targetPlayerName: targetName,
        title: mute ? `كتم ${label}` : `إلغاء كتم ${label}`,
        arabicMessage: `قام الحكم ${mute ? 'بكتم' : 'بإلغاء كتم'} ${label} عن ${targetName}.`,
        reason: mute ? `مخالفة في ${label}` : `إلغاء عقوبة ${label}`,
        timestamp: Date.now(),
      };
      this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
      this.broadcastGameState(payload.roomId);
      return { success: true, result: broadcastPayload };
    }

    if (payload.action === 'SUB') {
      const seat = Number(payload.seat) as PlayerSeat;
      const subAction = (payload as any).subAction || 'KICK_TO_SPECTATOR';
      if (subAction === 'KICK_TO_SPECTATOR') {
        const targetPlayer = room.seats[seat];
        const targetName = targetPlayer?.username || `لاعب ${seat + 1}`;
        const kickRes = this.roomService.kickSeatToSpectator(payload.roomId, seat, (payload as any).botId);
        if (kickRes.success && kickRes.botConfig) {
          this.gameSessionService.updateSeatMetadata(payload.roomId, seat, {
            isBot: true,
            botId: kickRes.botConfig.botId,
            username: kickRes.botConfig.name,
            avatar: kickRes.botConfig.avatar,
            playerId: `bot_${seat}`,
          });
          const isHumanKick = Boolean(kickRes.kickedUser);
          const broadcastPayload: RefereeDecisionBroadcastPayload = {
            actionType: 'KICK_TO_SPECTATOR',
            judgeName,
            targetSeat: seat,
            targetPlayerName: targetName,
            title: isHumanKick ? 'طرد للمشاهدين واستبدال ببوت' : 'تغيير البوت',
            arabicMessage: isHumanKick
              ? `قرر الحكم تحويل اللاعب ${targetName} إلى مقاعد المشاهدين واستبداله بالبوت (${kickRes.botConfig.name})!`
              : `قام الحكم باستبدال البوت في المقعد ${Number(seat) + 1} بالبوت (${kickRes.botConfig.name}).`,
            reason: `استبدال بالبوت ${kickRes.botConfig.name}`,
            timestamp: Date.now(),
          };
          this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          this.broadcastGameState(payload.roomId);
          if (RoomService.liveSeats(room).every((s: any) => s.isBot)) {
            this.gameSessionService.checkAndTriggerBotTurn(payload.roomId, true);
          }
          return { success: true, result: broadcastPayload };
        }
        return { success: false, error: kickRes.error };
      } else if (subAction === 'RETURN_FROM_SPECTATOR') {
        const specId = (payload as any).spectatorUserId;
        if (!specId) return { success: false, error: 'معرف المشاهد مطلوب' };
        const returnRes = this.roomService.returnSpectatorToSeat(payload.roomId, specId, seat);
        if (returnRes.success && returnRes.restoredUser) {
          this.gameSessionService.updateSeatMetadata(payload.roomId, seat, {
            isBot: false,
            playerId: returnRes.restoredUser.userId,
            username: returnRes.restoredUser.username,
            avatar: returnRes.restoredUser.avatar,
            botId: undefined,
          });
          const broadcastPayload: RefereeDecisionBroadcastPayload = {
            actionType: 'RETURN_FROM_SPECTATOR',
            judgeName,
            targetSeat: seat,
            targetPlayerName: returnRes.restoredUser.username,
            title: 'إعادة مشارك إلى الطاولة',
            arabicMessage: `أعاد الحكم اللاعب ${returnRes.restoredUser.username} من المشاهدين إلى المقعد ${Number(seat) + 1}.`,
            reason: 'إعادة اللاعب للمقعد بقرار تحكيمي',
            timestamp: Date.now(),
          };
          this.emitToRoom(payload.roomId, ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          this.broadcastGameState(payload.roomId);
          return { success: true, result: broadcastPayload };
        }
        return { success: false, error: returnRes.error };
      }
    }

    return { success: false, error: 'Unknown action' };
  }

  public getActiveGameStateForRoom(roomId: string, identity: HttpIdentity) {
    const room = this.findRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    const m = this.getMembership(room, identity.id);
    if (!m.isMember) {
      return { success: false, error: 'Not a participant in this room' };
    }

    if (m.seated && m.seated.presence === 'AWAY') {
      m.seated.presence = 'ONLINE';
    }

    const role: UserRole = m.isJudge ? 'JUDGE' : m.seated ? (m.isAdmin ? 'ADMIN' : 'PLAYER') : m.isSpectator ? 'SPECTATOR' : 'PLAYER';
    const seat = m.isJudge ? null : m.seated ? m.seated.seat : null;
    const sanitized = this.gameSessionService.getSanitizedState(room.id, seat, role);
    return {
      success: true,
      room,
      gameState: sanitized,
    };
  }

  public handleNextRoundHttp(roomId: string | undefined, identity: HttpIdentity) {
    const room = roomId ? this.findRoom(roomId) : undefined;
    if (!room) return { success: false, error: 'Room not found' };
    if (!this.getMembership(room, identity.id).isMember) {
      return { success: false, error: 'Not a participant in this room' };
    }
    const result = this.gameSessionService.requestNextRound(room.id, identity.id);
    if (result.success) this.broadcastGameState(room.id);
    return result;
  }

  public handlePlayTileHttp(
    payload: { roomId?: string; tile?: DominoTile; end?: ChainEnd; sequenceNumber?: number },
    identity: HttpIdentity
  ) {
    if (!payload?.roomId || !this.isValidTile(payload.tile)) return { success: false, error: 'Invalid payload' };
    if (payload.end && !['LEFT', 'RIGHT', 'START'].includes(payload.end)) {
      return { success: false, error: 'Invalid chain end specified' };
    }
    const room = this.findRoom(payload.roomId);
    if (!room) return { success: false, error: 'Room not found' };
    const m = this.getMembership(room, identity.id);
    if (!m.seated) return { success: false, error: 'Player is not seated in this room' };
    // The seat always comes from the verified identity (the old endpoint trusted a "seat" field).
    return this.gameSessionService.playTile(room.id, m.seated.seat, payload.tile as DominoTile, payload.end, payload.sequenceNumber);
  }

  public handlePassTurnHttp(payload: { roomId?: string; sequenceNumber?: number }, identity: HttpIdentity) {
    if (!payload?.roomId) return { success: false, error: 'Invalid payload' };
    const room = this.findRoom(payload.roomId);
    if (!room) return { success: false, error: 'Room not found' };
    const m = this.getMembership(room, identity.id);
    if (!m.seated) return { success: false, error: 'Player is not seated in this room' };
    return this.gameSessionService.passTurn(room.id, m.seated.seat, payload.sequenceNumber);
  }

  private isValidTile(tile: any): tile is DominoTile {
    return (
      Array.isArray(tile) &&
      tile.length === 2 &&
      Number.isInteger(tile[0]) &&
      Number.isInteger(tile[1]) &&
      tile[0] >= 0 &&
      tile[0] <= 6 &&
      tile[1] >= 0 &&
      tile[1] <= 6
    );
  }

  /** Resolves a verified identity from an HTTP Authorization header (account or guest token). */
  public identityFromAuthHeader(authHeader?: string): HttpIdentity | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const payload = this.authService.validateGameToken(authHeader.substring(7));
    if (!payload) return null;
    if (payload.isGuest) {
      return { id: payload.sub, username: payload.username || 'ضيف', avatar: 'avatar-1', isGuest: true };
    }
    const persisted = this.persistence.getUserById(payload.sub);
    const name = ((persisted?.displayName || persisted?.username || payload.username || '').trim().replace(/_\d{3,4}$/, '')) || 'لاعب';
    return {
      id: payload.sub,
      username: name,
      avatar: this.publicAvatar(payload.sub, persisted?.customAvatarUrl || persisted?.avatarUrl || 'avatar-1'),
      isGuest: false,
    };
  }

  @SubscribeMessage('client:trigger_bot')
  handleTriggerBot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId?: string; forceImmediate?: boolean }
  ) {
    try {
      if (!payload?.roomId) return;
      const { player, room } = this.validateCallerInRoom(client, payload.roomId);
      // Watchdog nudge: schedules the bot only if one is due and not already scheduled.
      // Skipping the bot's thinking time is reserved for the room's judge.
      const canForce = Boolean(payload.forceImmediate) && room.judge?.userId === player.userId;
      this.gameSessionService.checkAndTriggerBotTurn(room.id, false, canForce);
    } catch {
      // Not a member of this room: ignore.
    }
  }

  @SubscribeMessage(ClientEvents.QUICK_CHAT)
  handleQuickChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: QuickChatPayload
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId);
      
      if (!room.settings.quickChatEnabled) {
        return; // Silently ignore if disabled
      }

      // Check role - players, admins, judges, and spectators can chat
      if (player.role !== 'PLAYER' && player.role !== 'ADMIN' && player.role !== 'JUDGE' && player.role !== 'SPECTATOR') {
         return;
      }

      // Check if muted by Judge
      if (typeof player.seat === 'number') {
        const gameState = this.gameSessionService.getSanitizedState(room.id, player.seat, player.role);
        const mySeatState = gameState?.players.find((p) => p.seat === player.seat);
        if (mySeatState?.isChatMuted) {
          client.emit(ServerEvents.ROOM_ERROR, { message: 'تم كتم الشات والرسائل عنك بقرار من حكم المباراة' });
          return;
        }
      } else if (player.role === 'SPECTATOR') {
        const spec =
          (room.spectators || []).find((s) => s.userId === player.userId) ||
          (room.spectator?.userId === player.userId ? room.spectator : null);
        if (spec?.isMuted) {
          client.emit(ServerEvents.ROOM_ERROR, { message: 'تم كتم الشات عنك بقرار من حكم المباراة' });
          return;
        }
      }

      if (typeof payload.messageId !== 'string' || !payload.messageId.trim() || payload.messageId.length > 200) return;
      if (this.isChatFlooding(client)) return;
      this.emitToRoom(room.id, ServerEvents.QUICK_CHAT_BROADCAST, {
        userId: player.userId,
        messageId: payload.messageId,
        senderName: player.username,
        seat: player.seat,
        timestamp: Date.now(),
      });
    } catch {
      // Ignore unauthorized attempts
    }
  }

  @SubscribeMessage(ClientEvents.EMOTE_REACTION)
  handleEmoteReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EmoteReactionPayload
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId);
      
      if (!room.settings.reactionsEnabled) {
        return; // Silently ignore if disabled
      }

      // Check role - players, admins, judges, and spectators can react
      if (player.role !== 'PLAYER' && player.role !== 'ADMIN' && player.role !== 'JUDGE' && player.role !== 'SPECTATOR') {
         return;
      }

      // Check if reactions muted by Judge
      if (typeof player.seat === 'number') {
        const gameState = this.gameSessionService.getSanitizedState(room.id, player.seat, player.role);
        const mySeatState = gameState?.players.find((p) => p.seat === player.seat);
        if (mySeatState?.isReactionsMuted) {
          client.emit(ServerEvents.ROOM_ERROR, { message: 'تم كتم التفاعلات عنك بقرار من حكم المباراة' });
          return;
        }
      }

      if (typeof payload.emoji !== 'string' || !payload.emoji || payload.emoji.length > 32) return;
      if (this.isChatFlooding(client)) return;
      this.emitToRoom(room.id, ServerEvents.EMOTE_REACTION_BROADCAST, {
        userId: player.userId,
        emoji: payload.emoji,
        senderName: player.username,
        seat: player.seat,
        timestamp: Date.now(),
      });
    } catch {
      // Ignore unauthorized attempts
    }
  }

  /**
   * Handle real-time profile update: updates rooms, active game sessions, and broadcasts to all clients
   */
  public handleProfileUpdated(profile: any): void {
    if (!profile || !profile.id) return;
    const freshAvatar = this.publicAvatar(
      profile.id,
      profile.customAvatarUrl || profile.avatarUrl || profile.avatarId || 'avatar-1'
    );
    const freshName = profile.displayName || profile.username;
    const affectedRooms = new Set<string>();

    // 1. Update rooms in RoomService
    if (this.roomService) {
      const allRooms = (this.roomService as any).rooms as Map<string, any>;
      if (allRooms) {
        for (const [roomId, room] of allRooms.entries()) {
          let updated = false;
          if (room.seats && Array.isArray(room.seats)) {
            for (const seat of room.seats) {
              if (seat.playerId === profile.id) {
                seat.avatar = freshAvatar;
                if (freshName) seat.username = freshName;
                updated = true;
              }
            }
          }
          if (room.judge?.userId === profile.id) {
            room.judge.avatar = freshAvatar;
            if (freshName) room.judge.username = freshName;
            updated = true;
          }
          if (room.spectator?.userId === profile.id) {
            room.spectator.avatar = freshAvatar;
            if (freshName) room.spectator.username = freshName;
            updated = true;
          }
          if (updated && this.server) {
            affectedRooms.add(roomId);
            this.server.to(roomId).emit(ServerEvents.ROOM_SYNC, { room });
          }
        }
      }
    }

    // 2. Update active game session in GameSessionService
    if (this.gameSessionService) {
      const allSessions = (this.gameSessionService as any).sessions as Map<string, any>;
      if (allSessions) {
        for (const [roomId, engine] of allSessions.entries()) {
          const players = (engine as any).players;
          if (Array.isArray(players)) {
            let sessionUpdated = false;
            for (const p of players) {
              if (p.playerId === profile.id) {
                p.avatar = freshAvatar;
                if (freshName) p.username = freshName;
                sessionUpdated = true;
              }
            }
            if (sessionUpdated) {
              this.broadcastGameState(roomId);
            }
          }
        }
      }
    }

    // 3. Notify the user's own sockets and the rooms they are in (previously this was sent to
    //    every connected socket on the server, including the full base64 photo).
    if (this.server) {
      const targets: string[] = Array.from(affectedRooms);
      for (const s of this.server.sockets.sockets.values()) {
        if (s.data?.user?.id === profile.id) targets.push(s.id);
      }
      if (targets.length > 0) {
        const publicCustom = profile.customAvatarUrl ? freshAvatar : null;
        this.server.to(targets).emit('server:profile_updated', {
          userId: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: publicCustom || profile.avatarUrl,
          avatarId: profile.avatarId,
          customAvatarUrl: publicCustom,
          bio: profile.bio,
          gender: profile.gender,
        });
      }
    }
  }
}

