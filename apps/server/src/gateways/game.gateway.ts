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
import { AuthService } from '../modules/auth/auth.service';
import { VoiceService } from '../modules/voice/voice.service';
import { AnticheatService } from '../modules/anticheat/anticheat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  private readonly playerAwaySince = new Map<string, number>();
  private readonly recentlyLeftUsers = new Map<string, { timestamp: number; username: string }>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly roomService: RoomService,
    private readonly gameSessionService: GameSessionService,
    private readonly authService: AuthService,
    private readonly voiceService: VoiceService,
    private readonly anticheatService: AnticheatService
  ) {}

  afterInit() {
    this.logger.log('Authenticated GameGateway initialized');
    this.gameSessionService.setCallbacks({
      broadcastStateToRoom: (roomId: string) => this.broadcastGameState(roomId),
      emitErrorToPlayer: (socketId: string, error: string) => {
        this.server.to(socketId).emit(ServerEvents.MOVE_REJECTED, { reason: error });
      },
      broadcastBotChat: (roomId: string, chat: BotChatMessage) => {
        this.server.to(roomId).emit(ServerEvents.BOT_MESSAGE, chat);
      },
      broadcastStatsUpdated: (roomId: string) => {
        this.server.to(roomId).emit(ServerEvents.STATS_UPDATED, { timestamp: Date.now() });
      },
      broadcastNotification: (roomId: string, notification: NotificationPayload) => {
        this.broadcastNotificationToRoom(roomId, notification);
      },
    });
  }

  public broadcastNotificationToRoom(roomId: string, notif: NotificationPayload, excludeSocketId?: string) {
    const room = this.roomService.getRoom(roomId) || this.roomService.getRoomByCode(roomId);
    const actualRoomId = room ? room.id : roomId;
    const roomCode = room?.code;

    // 1. Native socket.io broadcast to room channels
    if (excludeSocketId) {
      this.server.to(actualRoomId).except(excludeSocketId).emit(ServerEvents.NOTIFICATION, notif);
      if (roomCode && roomCode !== actualRoomId) {
        this.server.to(roomCode).except(excludeSocketId).emit(ServerEvents.NOTIFICATION, notif);
      }
    } else {
      this.server.to(actualRoomId).emit(ServerEvents.NOTIFICATION, notif);
      if (roomCode && roomCode !== actualRoomId) {
        this.server.to(roomCode).emit(ServerEvents.NOTIFICATION, notif);
      }
    }

    // 2. Direct fallback to any known individual sockets
    const targetSockets = new Set<string>();
    const inRoom = this.server.sockets.adapter.rooms.get(actualRoomId);
    if (inRoom) for (const s of inRoom) targetSockets.add(s);
    if (roomCode) {
      const inCode = this.server.sockets.adapter.rooms.get(roomCode);
      if (inCode) for (const s of inCode) targetSockets.add(s);
    }
    const connected = this.roomService.getConnectedPlayersInRoom(actualRoomId);
    for (const cp of connected) {
      if (cp.socketId) targetSockets.add(cp.socketId);
    }
    if (excludeSocketId) targetSockets.delete(excludeSocketId);

    for (const socketId of targetSockets) {
      this.server.to(socketId).emit(ServerEvents.NOTIFICATION, notif);
    }

    try {
      require('fs').appendFileSync('debug.log', `[NOTIFICATION_BROADCAST] room=${actualRoomId} targets=${targetSockets.size} msg=${notif.arabicMessage}\n`);
    } catch (e) {}
  }

  public syncRoomToAll(roomId: string, room: any, excludeSocketId?: string) {
    const actualRoomId = room?.id || roomId;
    const roomCode = room?.code;

    // 1. Native socket.io broadcast to room channels
    if (excludeSocketId) {
      this.server.to(actualRoomId).except(excludeSocketId).emit(ServerEvents.ROOM_SYNC, { room });
      if (roomCode && roomCode !== actualRoomId) {
        this.server.to(roomCode).except(excludeSocketId).emit(ServerEvents.ROOM_SYNC, { room });
      }
    } else {
      this.server.to(actualRoomId).emit(ServerEvents.ROOM_SYNC, { room });
      if (roomCode && roomCode !== actualRoomId) {
        this.server.to(roomCode).emit(ServerEvents.ROOM_SYNC, { room });
      }
    }

    // 2. Direct fallback to known individual sockets
    const targetSockets = new Set<string>();
    const inRoom = this.server.sockets.adapter.rooms.get(actualRoomId);
    if (inRoom) for (const s of inRoom) targetSockets.add(s);
    if (roomCode) {
      const inCode = this.server.sockets.adapter.rooms.get(roomCode);
      if (inCode) for (const s of inCode) targetSockets.add(s);
    }
    const connected = this.roomService.getConnectedPlayersInRoom(actualRoomId);
    for (const cp of connected) {
      if (cp.socketId) targetSockets.add(cp.socketId);
    }
    if (excludeSocketId) targetSockets.delete(excludeSocketId);

    for (const socketId of targetSockets) {
      this.server.to(socketId).emit(ServerEvents.ROOM_SYNC, { room });
    }
  }

  handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ||
      (client.handshake.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.substring(7)
        : null);

    client.on('disconnect', (reason: string) => {
      try {
        require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[DISCONNECT] id=${client.id} user=${client.data?.user?.username} reason=${reason} transport=${(client as any).conn?.transport?.name}\n`);
      } catch(e) {}
    });

    let resolvedUser: { id: string; username: string; avatar: string; isAuthenticated: boolean } | null = null;

    if (token) {
      const userPayload = this.authService.validateToken(token);
      if (userPayload) {
        resolvedUser = {
          id: userPayload.sub,
          username: userPayload.username,
          avatar: 'avatar-1',
          isAuthenticated: true,
        };
        this.logger.log(`Authenticated client connected: ${userPayload.username} (${client.id})`);
      }
    }

    if (!resolvedUser) {
      // Check if client provided persistent guest info from local state
      const authUserId = client.handshake.auth?.userId;
      const authUsername = client.handshake.auth?.username;
      const authAvatar = client.handshake.auth?.avatar;

      const shortId = client.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6) || 'guest';
      const guestId = (typeof authUserId === 'string' && authUserId.length > 0)
        ? authUserId
        : `guest_${client.id}`;
      const guestUsername = (typeof authUsername === 'string' && authUsername.trim().length > 0)
        ? authUsername.trim()
        : `Guest_${shortId}`;
      const guestAvatar = typeof authAvatar === 'string' ? authAvatar : 'avatar-1';

      resolvedUser = {
        id: guestId,
        username: guestUsername,
        avatar: guestAvatar,
        isAuthenticated: false,
      };
      this.logger.log(`Client connected: ${resolvedUser.username} (${resolvedUser.id}) [${client.id}]`);
    }

    client.data.user = resolvedUser;

    try {
      this.rebindConnectingClient(client, resolvedUser);
    } catch (err: any) {
      this.logger.warn(`Auto-rebind error for ${client.id}: ${err.message}`);
    }
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
    this.voiceService.removeSocket(client.id);

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
            this.server.to(roomId).emit(ServerEvents.DISCONNECT_GRACE_UPDATE, { grace });
            const notif: NotificationPayload = {
              type: 'WARNING',
              message: `${username} disconnected. Waiting for turn timer before auto-play (2-min grace).`,
              arabicMessage: `انقطع اتصال اللاعب ${username} (خرج من الموقع). سيتم انتظار انتهاء وقت تفكيره بالكامل قبل لعب كارت عشوائي لحين عودته.`,
              timestamp: Date.now(),
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
      const seated = room.seats.find(
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

          const hadGrace = seated && room.disconnectGraces?.some((g) => g.seat === seated.seat);
          if (seated) {
            seated.isConnected = true;
            seated.presence = 'ONLINE';
            seated.isTemporarilyBotControlled = false;
            this.roomService.cancelDisconnectGrace(room.id, seated.seat);
            this.gameSessionService.setBotTakeover(room.id, seated.seat, false);
            this.gameSessionService.clearBotTimeout(room.id);
          }

          if (hadGrace) {
            const returnNotif: NotificationPayload = {
              type: 'SUCCESS',
              message: `Player ${user.username} has returned to the game!`,
              arabicMessage: `عَادَ اللاعب ${user.username} إلى اللعبة واستلم دوره!`,
              timestamp: Date.now(),
            };
            this.broadcastNotificationToRoom(room.id, returnNotif);
          }

          this.syncRoomToAll(room.id, room);
          client.emit(ServerEvents.ROOM_SYNC, { room });
          this.broadcastGameState(room.id, client.id);
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
   * Resolves caller identity. Guarantees that guests cannot spoof registered user UUIDs.
   */
  private resolveUser(client: Socket, payloadUser?: any): { id: string; username: string; avatar: string } {
    if (client.data.user?.isAuthenticated) {
      return {
        id: client.data.user.id,
        username: client.data.user.username,
        avatar: client.data.user.avatar || 'avatar-1',
      };
    }

    // Guest user: Respect consistent ID provided by client
    const guestId =
      payloadUser?.id &&
      typeof payloadUser.id === 'string' &&
      payloadUser.id.length > 0 &&
      payloadUser.id !== 'default_user'
        ? payloadUser.id
        : client.data.user?.id || `guest_${client.id}`;

    let customName = payloadUser?.username;
    if (typeof customName === 'string' && customName.trim().length >= 2 && customName.trim().length <= 24) {
      customName = customName.trim();
    } else {
      customName = client.data.user?.username || `Guest_${client.id.substring(0, 4)}`;
    }

    const resolved = {
      id: guestId,
      username: customName,
      avatar: payloadUser?.avatar || 'avatar-1',
    };

    client.data.user = { ...resolved, isAuthenticated: false };
    return resolved;
  }

  /**
   * Validates room existence and caller membership in the target room.
   */
  private validateCallerInRoom(client: Socket, roomId: string, payloadUser?: any) {
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Invalid roomId provided');
    }
    let player = this.roomService.getPlayerBySocket(client.id);
    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Always ensure socket has joined both the room ID and room code Socket.io channels
    client.join(roomId);
    if (room.id && room.id !== roomId) client.join(room.id);
    if (room.code && room.code !== roomId) client.join(room.code);

    // Resolve caller identity with priority to authenticated credentials
    const userAuth = this.resolveUser(client, payloadUser);
    const userId = userAuth.id || player?.userId;
    const username = userAuth.username || player?.username;

    if (!player || player.roomId !== roomId) {
      if (userId || username) {
        const seated = room.seats.find(
          (s) => (userId && s.playerId === userId) || (!s.isBot && username && s.username === username)
        );
        const isAdmin = Boolean(
          (userId && (room.currentAdminId === userId || room.originalAdminId === userId || room.ownerId === userId)) ||
          (username && (room.currentAdminId === username || room.ownerId === username))
        );
        const isSpectator = Boolean(
          (userId && room.spectator?.userId === userId) ||
          (username && room.spectator?.username === username) ||
          room.spectators?.some((sp) => (userId && sp.userId === userId) || (username && sp.username === username))
        );
        const isJudge = Boolean(
          (userId && room.judge?.userId === userId) ||
          (username && room.judge?.username === username)
        );

        if (!player) {
          const user = {
            id: userId || `recovered_${client.id}`,
            username: seated?.username || username || 'Player',
            avatar: payloadUser?.avatar || seated?.avatar || client.data.user?.avatar || 'avatar-1',
          };
          const role = isJudge
            ? 'JUDGE'
            : isSpectator
            ? 'SPECTATOR'
            : isAdmin
            ? 'ADMIN'
            : seated
            ? 'PLAYER'
            : 'PLAYER';
          this.roomService.registerSocket(client.id, user, role);
          player = this.roomService.getPlayerBySocket(client.id);
        }
        if (player) {
          player.roomId = roomId;
          if (isJudge || isSpectator || player.role === 'JUDGE' || player.role === 'SPECTATOR') {
            player.seat = null;
            player.role = (isJudge || player.role === 'JUDGE') ? 'JUDGE' : 'SPECTATOR';
          } else if (seated) {
            player.seat = seated.seat;
            player.role = isAdmin ? 'ADMIN' : 'PLAYER';
          } else {
            player.seat = null;
            player.role = isAdmin ? 'ADMIN' : 'PLAYER';
          }
        }
      }
    }

    if (!player) {
      throw new Error('Client is not registered in any room');
    }
    if (player.roomId !== roomId) {
      player.roomId = roomId;
    }
    return { player, room };
  }

  /**
   * Authoritatively validates and authorizes the presiding Judge/Referee in a room.
   * Auto-joins the room channel and guarantees player registration with JUDGE role.
   */
  private validateJudgeInRoom(client: Socket, roomId: string, payloadUser?: any): { player: any; room: any } {
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Invalid roomId provided');
    }
    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    client.join(roomId);
    const userAuth = this.resolveUser(client, payloadUser);
    let player = this.roomService.getPlayerBySocket(client.id);

    if (!player) {
      this.roomService.registerSocket(client.id, userAuth, 'JUDGE');
      player = this.roomService.getPlayerBySocket(client.id);
    }

    if (player) {
      player.roomId = roomId;
      player.role = 'JUDGE';
    }

    if (!room.judge) {
      room.judge = {
        userId: userAuth.id || player?.userId || 'judge_user',
        username: userAuth.username || player?.username || 'الحكم',
        avatar: userAuth.avatar || player?.avatar || 'avatar-1',
        isConnected: true,
        isMuted: false,
      };
    }

    return { player: player!, room };
  }

  private broadcastGameState(roomId: string, directSocketId?: string) {
    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    this.server.to(roomId).emit(ServerEvents.ROOM_SYNC, { room });

    const socketIds = new Set<string>();
    if (directSocketId) {
      socketIds.add(directSocketId);
    }
    const socketsInRoom = this.server.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
      for (const socketId of socketsInRoom) {
        socketIds.add(socketId);
      }
    }
    const playersInRoom = this.roomService.getConnectedPlayersInRoom(roomId);
    for (const p of playersInRoom) {
      if (p.socketId) {
        socketIds.add(p.socketId);
      }
    }

    for (const socketId of socketIds) {
      this.server.to(socketId).emit(ServerEvents.ROOM_SYNC, { room });

      const player = this.roomService.getPlayerBySocket(socketId);
      const isJudge =
        player?.role === 'JUDGE' ||
        room.judge?.userId === player?.userId ||
        Boolean(room.judge && player?.username && room.judge.username === player.username);
      const isSpectator =
        player?.role === 'SPECTATOR' ||
        room.spectator?.userId === player?.userId ||
        Boolean(room.spectator && player?.username && room.spectator.username === player.username);

      const seated = (isJudge || isSpectator)
        ? undefined
        : room.seats.find((s) => s.playerId === player?.userId || (!s.isBot && s.username === player?.username));
      const seat = (isJudge || isSpectator) ? null : (seated ? seated.seat : (player?.seat ?? null));
      const role = isJudge
        ? 'JUDGE'
        : isSpectator
        ? 'SPECTATOR'
        : (player?.role ?? (room.currentAdminId === player?.userId ? 'ADMIN' : 'PLAYER'));

      // Sanitized state strictly masks private hands for opponents, judges, and spectators
      const sanitized = this.gameSessionService.getSanitizedState(roomId, seat, role);
      if (sanitized) {
        this.server.to(socketId).emit(ServerEvents.GAME_STATE_SYNC, { gameState: sanitized });
      }
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
      client.emit(ServerEvents.ROOM_SYNC, { room });

      if (room.settings.voiceEnabled) {
        this.voiceService.joinVoice(room.id, user.id, client.id, initialRole);
      }

      this.logger.log(`Room created: ${room.id} (${room.code}) by ${user.username} with role ${initialRole}`);

      // If room is created as a Judge with 4 Egyptian bots, auto-start match immediately so the referee presides directly over the game
      if (initialRole === 'JUDGE' && room.seats.every((s) => s.isBot)) {
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
      const updatedRoom = this.roomService.joinRoom(room.id, client.id, user);
      client.join(room.id);
      if (room.code && room.code !== room.id) {
        client.join(room.code);
      }

      if (updatedRoom.settings.voiceEnabled) {
        this.voiceService.joinVoice(room.id, user.id, client.id, 'PLAYER');
      }

      this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      if (room.code && room.code !== room.id) {
        this.server.to(room.code).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
      }
      client.emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });

      // If returning player from disconnect grace during an active match
      const player = this.roomService.getPlayerBySocket(client.id);
      const hasActiveGrace = player && player.seat !== null && room.disconnectGraces?.some((g) => g.seat === player.seat);
      if (room.matchStatus === 'PLAYING' && hasActiveGrace && player && player.seat !== null) {
        this.roomService.cancelDisconnectGrace(room.id, player.seat);
        this.gameSessionService.setBotTakeover(room.id, player.seat, false);
        const returnNotif: NotificationPayload = {
          type: 'SUCCESS',
          message: `Player ${user.username} has returned to the game!`,
          arabicMessage: `عَادَ اللاعب ${user.username} إلى اللعبة واستلم دوره!`,
          timestamp: Date.now(),
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
        ? room.seats.filter((s) => s.occupied && !s.isBot && s.playerId && s.playerId !== userId).length
        : 0;
      const judgeHuman = room.judge && room.judge.userId !== userId && room.judge.isConnected ? 1 : 0;
      const spectatorHuman = (room.spectator && room.spectator.userId !== userId && room.spectator.isConnected ? 1 : 0) +
        (room.spectators ? room.spectators.filter((s) => s.userId !== userId && s.isConnected).length : 0);
      const otherConnected = this.roomService
        .getConnectedPlayersInRoom(actualRoomId)
        .filter((cp) => cp.socketId !== client.id && cp.userId !== userId).length;

      const totalRemainingHumans = seatedHumans + judgeHuman + spectatorHuman + otherConnected;

      const leftPlayerUsername = player?.username || client.data?.user?.username || 'أحد اللاعبين';
      const leftPlayerSeat = player?.seat ?? room.seats.find((s) => s.playerId === userId)?.seat ?? null;

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

      this.voiceService.removeSocket(client.id);

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

      let player = this.roomService.getPlayerBySocket(client.id);
      let userId = (payload as any)?.userId || (payload as any)?.user?.id || client.data?.user?.id || player?.userId;
      let username = (payload as any)?.username || (payload as any)?.user?.username || player?.username || client.data?.user?.username;

      if (!userId) {
        const seated = room.seats.find((s) => s.occupied && !s.isBot && s.playerId === client.data?.user?.id);
        if (seated) {
          userId = seated.playerId!;
          username = seated.username || 'أحد اللاعبين';
        }
      }
      if (!userId) return;
      if (!username) username = 'أحد اللاعبين';

      client.join(roomId);

      const isAway = !payload.isVisible || !payload.hasWindowFocus;
      const awayKey = `${roomId}_${userId}`;

      try {
        require('fs').appendFileSync('debug.log', `[APP_VISIBILITY_RECEIVED] client=${client.id} room=${roomId} user=${userId} (${username}) isAway=${isAway}\n`);
      } catch (e) {}

      if (isAway) {
        if (this.playerAwaySince.has(awayKey)) return;
        this.playerAwaySince.set(awayKey, Date.now());

        const notif: NotificationPayload = {
          type: 'WARNING',
          message: `Anti-cheat: ${username} switched away from the game screen.`,
          arabicMessage: `⚠️ تنبيه نزاهة: اللاعب ${username} خرج من شاشة اللعبة (انتقل لنافذة أو تطبيق آخر).`,
          timestamp: Date.now(),
          userId,
          username,
          persistent: true,
        };
        this.broadcastNotificationToRoom(roomId, notif);

        const seatObj = room.seats.find((s) => s.playerId === userId && !s.isBot);
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

        const seatObj = room.seats.find((s) => s.playerId === userId && !s.isBot);
        if (seatObj) {
          seatObj.presence = 'ONLINE';
          seatObj.isTemporarilyBotControlled = false;
          this.gameSessionService.setBotTakeover(roomId, seatObj.seat, false);
          this.gameSessionService.clearBotTimeout(roomId);
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
    userId?: string;
    username?: string;
    isVisible?: boolean;
    hasWindowFocus?: boolean;
  }) {
    try {
      if (!payload?.roomId) return { success: false, error: 'roomId required' };
      const room = this.roomService.getRoom(payload.roomId) || this.roomService.getRoomByCode(payload.roomId);
      if (!room) return { success: false, error: 'Room not found' };
      const roomId = room.id;

      let userId = payload.userId;
      let username = payload.username;
      if (!userId) {
        const seated = room.seats.find((s) => s.occupied && !s.isBot && s.playerId);
        if (seated) {
          userId = seated.playerId!;
          username = seated.username || 'أحد اللاعبين';
        }
      }
      if (!userId) return { success: false, error: 'userId not found' };
      if (!username) username = 'أحد اللاعبين';

      const isAway = !payload.isVisible || !payload.hasWindowFocus;
      const awayKey = `${roomId}_${userId}`;

      try {
        require('fs').appendFileSync('debug.log', `[APP_VISIBILITY_HTTP] room=${roomId} user=${userId} (${username}) isAway=${isAway}\n`);
      } catch (e) {}

      if (isAway) {
        if (this.playerAwaySince.has(awayKey)) return { success: true, isAway: true };
        this.playerAwaySince.set(awayKey, Date.now());

        const notif: NotificationPayload = {
          type: 'WARNING',
          message: `Anti-cheat: ${username} switched away from the game screen.`,
          arabicMessage: `⚠️ تنبيه نزاهة: اللاعب ${username} خرج من شاشة اللعبة (انتقل لنافذة أو تطبيق آخر).`,
          timestamp: Date.now(),
          userId,
          username,
          persistent: true,
        };
        this.broadcastNotificationToRoom(roomId, notif);

        const seatObj = room.seats.find((s) => s.playerId === userId && !s.isBot);
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

        const seatObj = room.seats.find((s) => s.playerId === userId && !s.isBot);
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

  public handleLeaveRoomDirect(roomId?: string, userId?: string) {
    try {
      if (!roomId) return { success: false, error: 'roomId required' };
      const room = this.roomService.getRoom(roomId) || this.roomService.getRoomByCode(roomId);
      if (!room) return { success: false, error: 'Room not found' };
      const actualRoomId = room.id;

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
        const seated = room.seats.find((s) => s.playerId === userId);
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
        ? room.seats.filter((s) => s.occupied && !s.isBot && s.playerId && s.playerId !== userId).length
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
        const updatedRoom = targetPlayer?.socketId
          ? this.roomService.leaveRoom(actualRoomId, targetPlayer.socketId)
          : room;

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
      const { player, room } = this.validateCallerInRoom(client, payload.roomId);
      if (room.currentAdminId !== player.userId) {
        throw new Error('Unauthorized: Only room admin can toggle bots');
      }

      const updatedRoom = this.roomService.toggleBot(
        room.id,
        player.userId,
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
        room.judge?.userId === userAuth.id ||
        room.judge?.username === userAuth.username ||
        room.judge?.userId === player?.userId;
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
    try { require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[ADMIN_START_MATCH] received payload=${JSON.stringify(payload)}\n`); } catch(e) {}
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId, payload?.user);
      const userAuth = this.resolveUser(client, payload?.user);
      try { require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[ADMIN_START_MATCH] validated player=${player?.userId} role=${player?.role}\n`); } catch(e) {}
      const allBotsOccupied = room.seats.filter((s) => s.occupied && !s.isBot).length === 0;

      const isJudgeRequest =
        payload?.role === 'JUDGE' ||
        player.role === 'JUDGE' ||
        Boolean(
          room.judge &&
            (room.judge.userId === userAuth.id ||
              room.judge.username === userAuth.username ||
              room.judge.userId === player.userId)
        );

      if (isJudgeRequest) {
        try {
          this.roomService.joinAsJudge(room.id, client.id, userAuth);
        } catch (err: any) {
          this.logger.log(`joinAsJudge call during start match: ${err.message}`);
        }
      }

      const humanSeats = room.seats.filter((s) => s.occupied && !s.isBot);
      const isSoloHuman = humanSeats.length <= 1;

      const isAuthorized =
        room.currentAdminId === player.userId ||
        room.originalAdminId === player.userId ||
        room.ownerId === player.userId ||
        room.currentAdminId === userAuth.id ||
        room.ownerId === userAuth.id ||
        player.role === 'JUDGE' ||
        player.role === 'ADMIN' ||
        isJudgeRequest ||
        allBotsOccupied ||
        isSoloHuman ||
        room.seats.some((s) => s.playerId === userAuth.id || s.playerId === player.userId);

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
      try { require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[ADMIN_START_MATCH] error: ${err.message}\n`); } catch(e) {}
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
      const { player } = this.validateCallerInRoom(client, payload?.roomId);
      if (player.seat === null || !Number.isInteger(player.seat) || player.seat < 0 || player.seat > 3) {
        client.emit(ServerEvents.MOVE_REJECTED, { reason: 'Player is not seated in an active slot' });
        return;
      }

      if (
        !payload.tile ||
        !Array.isArray(payload.tile) ||
        payload.tile.length !== 2 ||
        typeof payload.tile[0] !== 'number' ||
        typeof payload.tile[1] !== 'number' ||
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
        payload.roomId,
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
      }
    } catch (err: any) {
      client.emit(ServerEvents.MOVE_REJECTED, { reason: err.message || 'Action rejected' });
    }
  }

  @SubscribeMessage(ClientEvents.PASS_TURN)
  handlePassTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PassTurnPayload
  ) {
    try {
      const { player } = this.validateCallerInRoom(client, payload?.roomId);
      if (player.seat === null || !Number.isInteger(player.seat) || player.seat < 0 || player.seat > 3) {
        client.emit(ServerEvents.MOVE_REJECTED, { reason: 'Player is not seated in an active slot' });
        return;
      }

      const result = this.gameSessionService.passTurn(payload.roomId, player.seat, payload.sequenceNumber);
      if (!result.success) {
        client.emit(ServerEvents.MOVE_REJECTED, {
          reason: result.error || 'Cannot pass turn',
        });
      }
    } catch (err: any) {
      client.emit(ServerEvents.MOVE_REJECTED, { reason: err.message || 'Pass rejected' });
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

        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        client.emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
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

        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        client.emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.broadcastGameState(payload.roomId);
        if (room.seats.every((s: any) => s.isBot)) {
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

        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        client.emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
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

          this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          client.emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          this.broadcastGameState(payload.roomId, client.id);
          if (room.seats.every((s: any) => s.isBot)) {
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

          this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          client.emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
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

  @SubscribeMessage(ClientEvents.VOICE_MUTE)
  handleVoiceMute(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VoiceMutePayload
  ) {
    try {
      const { player, room } = this.validateCallerInRoom(client, payload?.roomId);
      if (!room.settings.voiceEnabled) return;

      this.voiceService.setMute(payload.roomId, player.userId, !!payload.isMuted);
      const peers = this.voiceService.getPeers(payload.roomId);
      this.server.to(payload.roomId).emit(ServerEvents.VOICE_PEERS_SYNC, { peers });
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
      let userId: string | undefined = payload?.user?.id;
      try {
        const { player } = this.validateCallerInRoom(client, payload?.roomId, (payload as any)?.user);
        userId = player.userId;
      } catch {
        const room = this.roomService.getRoom(payload?.roomId);
        userId = userId || room?.currentAdminId || 'user';
      }
      const result = this.gameSessionService.requestNextRound(payload.roomId, userId || 'user');
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

  public startRematchForRoom(targetRoomId?: string, userId?: string, username?: string) {
    this.logger.log(`[HTTP REMATCH TRIGGERED] targetRoomId=${targetRoomId}, userId=${userId}, username=${username}`);

    let room = targetRoomId ? this.roomService.getRoom(targetRoomId) : null;
    if (!room) {
      const user = {
        id: userId || `user_${Date.now()}`,
        username: username || 'Player',
        avatar: 'avatar-1',
      };
      room = this.roomService.createRoom(
        'system_rematch',
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
        'ADMIN'
      );
    }

    const adminId = room.currentAdminId || userId || 'admin';
    this.gameSessionService.startRematch(room.id, adminId, {
      userId: userId || adminId,
      username: username || 'Player',
      avatar: 'avatar-1',
    });

    this.server.to(room.id).emit(ServerEvents.REMATCH_STARTED, { roomId: room.id });
    this.broadcastGameState(room.id);
    return { success: true, roomId: room.id };
  }

  public startMatchForRoom(targetRoomId?: string, userId?: string, username?: string, role?: string) {
    try { require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[HTTP_START_MATCH] received targetRoomId=${targetRoomId} userId=${userId} role=${role}\n`); } catch(e) {}
    this.logger.log(`[HTTP START MATCH TRIGGERED] targetRoomId=${targetRoomId}, userId=${userId}, username=${username}, role=${role}`);
    if (!targetRoomId) {
      throw new Error('Room ID is required');
    }
    const room = this.roomService.getRoom(targetRoomId);
    if (!room) {
      try { require('fs').appendFileSync('c:/Users/AlHuda/Desktop/baffa/debug.log', `[HTTP_START_MATCH] error: Room ${targetRoomId} not found\n`); } catch(e) {}
      throw new Error(`Room ${targetRoomId} not found`);
    }

    const isJudge =
      role === 'JUDGE' ||
      Boolean(room.judge && (room.judge.userId === userId || room.judge.username === username));

    const existingEngine = this.gameSessionService.getSession(room.id);
    if (existingEngine && existingEngine.getStatus() === 'PLAYING') {
      this.gameSessionService.checkAndTriggerBotTurn(room.id, true);
      this.broadcastGameState(room.id);
      return { success: true, roomId: room.id };
    }

    if (isJudge && userId && !room.judge) {
      try {
        const updated = this.roomService.joinAsJudge(room.id, `http_${userId}`, {
          id: userId,
          username: username || 'Judge',
          avatar: 'avatar-1',
        });
        this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updated });
      } catch (err: any) {
        this.logger.warn(`Could not join as judge via HTTP start: ${err.message}`);
      }
    }

    const adminId = room.currentAdminId || userId || 'admin';
    this.gameSessionService.startMatch(room.id, adminId);
    const updatedRoom = this.roomService.getRoom(room.id);
    if (updatedRoom) {
      this.server.to(room.id).emit(ServerEvents.ROOM_SYNC, { room: updatedRoom });
    }
    this.broadcastGameState(room.id);
    return { success: true, roomId: room.id };
  }

  public triggerBotForRoom(targetRoomId?: string, forceImmediate?: boolean) {
    if (!targetRoomId) return { success: false, error: 'Room ID is required' };
    this.gameSessionService.checkAndTriggerBotTurn(targetRoomId, false, Boolean(forceImmediate));
    return { success: true, roomId: targetRoomId };
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
  }) {
    const room = this.roomService.getRoom(payload.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const judgeName = payload.user?.username || room.judge?.username || 'الحكم';
    const judgeId = payload.user?.id || room.judge?.userId || 'judge';

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
        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
        this.broadcastGameState(payload.roomId);
        if (room.seats.every((s: any) => s.isBot)) {
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
        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
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
        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
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
        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
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
        this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
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
      this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
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
          this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          this.broadcastGameState(payload.roomId);
          if (room.seats.every((s: any) => s.isBot)) {
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
          this.server.to(payload.roomId).emit(ServerEvents.REFEREE_DECISION_BROADCAST, broadcastPayload);
          this.broadcastGameState(payload.roomId);
          return { success: true, result: broadcastPayload };
        }
        return { success: false, error: returnRes.error };
      }
    }

    return { success: false, error: 'Unknown action' };
  }

  public getActiveGameStateForRoom(roomId: string, userId?: string, reqRole?: string, username?: string) {
    const room = this.roomService.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const isJudge =
      reqRole === 'JUDGE' ||
      (userId && room.judge?.userId === userId) ||
      (username && room.judge?.username === username);
    const isSpectator =
      reqRole === 'SPECTATOR' ||
      (userId && room.spectator?.userId === userId) ||
      (username && room.spectator?.username === username) ||
      Boolean(room.spectators?.some((s) => (userId && s.userId === userId) || (username && s.username === username)));

    let seated = (isJudge || isSpectator)
      ? undefined
      : room.seats.find((s) => !s.isBot && ((userId && s.playerId === userId) || (username && s.username === username)));

    // Fallback: if only 1 human player exists in room, bind to that seat
    if (!seated && !isJudge && !isSpectator) {
      const humanSeats = room.seats.filter((s) => s.occupied && !s.isBot);
      if (humanSeats.length === 1 && (room.currentAdminId === userId || room.originalAdminId === userId || (username && humanSeats[0].username === username))) {
        seated = humanSeats[0];
      }
    }

    const seat = (isJudge || isSpectator) ? null : (seated ? seated.seat : null);
    const role: UserRole = isJudge
      ? 'JUDGE'
      : isSpectator
      ? 'SPECTATOR'
      : (seated ? 'PLAYER' : (room.currentAdminId === userId ? 'ADMIN' : 'PLAYER'));

    const sanitized = this.gameSessionService.getSanitizedState(roomId, seat, role);
    return {
      success: true,
      room,
      gameState: sanitized,
    };
  }

  public handleNextRoundHttp(roomId?: string, userId?: string) {
    if (!roomId) return { success: false, error: 'roomId required' };
    const room = this.roomService.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    const effectiveUserId = userId || room.currentAdminId || 'user';
    const result = this.gameSessionService.requestNextRound(roomId, effectiveUserId);
    this.broadcastGameState(roomId);
    return result;
  }

  public handlePlayTileHttp(payload: { roomId?: string; seat?: number; tile?: DominoTile; end?: ChainEnd; userId?: string }) {
    if (!payload?.roomId || !payload?.tile) return { success: false, error: 'Invalid payload' };
    const room = this.roomService.getRoom(payload.roomId);
    if (!room) return { success: false, error: 'Room not found' };
    let seat = payload.seat;
    if (seat === undefined || seat === null) {
      const seated = room.seats.find((s) => s.playerId === payload.userId || (!s.isBot && s.playerId));
      seat = seated ? seated.seat : 0;
    }
    const result = this.gameSessionService.playTile(payload.roomId, seat as PlayerSeat, payload.tile, payload.end);
    this.broadcastGameState(payload.roomId);
    return result;
  }

  public handlePassTurnHttp(payload: { roomId?: string; seat?: number; userId?: string }) {
    if (!payload?.roomId) return { success: false, error: 'Invalid payload' };
    const room = this.roomService.getRoom(payload.roomId);
    if (!room) return { success: false, error: 'Room not found' };
    let seat = payload.seat;
    if (seat === undefined || seat === null) {
      const seated = room.seats.find((s) => s.playerId === payload.userId || (!s.isBot && s.playerId));
      seat = seated ? seated.seat : 0;
    }
    const result = this.gameSessionService.passTurn(payload.roomId, seat as PlayerSeat);
    this.broadcastGameState(payload.roomId);
    return result;
  }

  @SubscribeMessage('client:trigger_bot')
  handleTriggerBot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId?: string; forceImmediate?: boolean }
  ) {
    if (payload?.roomId) {
      this.gameSessionService.checkAndTriggerBotTurn(
        payload.roomId,
        false,
        Boolean(payload?.forceImmediate)
      );
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

      this.server.to(payload.roomId).emit(ServerEvents.QUICK_CHAT_BROADCAST, {
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

      this.server.to(payload.roomId).emit(ServerEvents.EMOTE_REACTION_BROADCAST, {
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
}

