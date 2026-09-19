import { Injectable, Logger } from '@nestjs/common';
import {
  BotId,
  DisconnectGraceInfo,
  JudgeInfo,
  MatchStatus,
  PlayerSeat,
  PresenceStatus,
  RoomDetails,
  RoomSeatInfo,
  RoomSettings,
  SpectatorInfo,
  TeamId,
  UserRole,
} from '@baffa/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConnectedPlayer {
  socketId: string;
  userId: string;
  username: string;
  avatar: string;
  role: UserRole;
  seat: PlayerSeat | null;
  roomId: string | null;
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private rooms: Map<string, RoomDetails> = new Map();
  private socketPlayers: Map<string, ConnectedPlayer> = new Map();
  private graceTimers: Map<string, NodeJS.Timeout> = new Map(); // `${roomId}_${seat}` -> Timeout
  private lobbyDisconnectTimers: Map<string, NodeJS.Timeout> = new Map(); // `${roomId}_${userId}` -> Timeout

  constructor(private prisma: PrismaService) {}

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private createDefaultSeats(): RoomSeatInfo[] {
    return [
      { seat: 0, team: 1, occupied: false, playerId: null, username: null, avatar: null, isBot: false, isReady: false, isConnected: false, presence: 'ONLINE' },
      { seat: 1, team: 2, occupied: false, playerId: null, username: null, avatar: null, isBot: false, isReady: false, isConnected: false, presence: 'ONLINE' },
      { seat: 2, team: 1, occupied: false, playerId: null, username: null, avatar: null, isBot: false, isReady: false, isConnected: false, presence: 'ONLINE' },
      { seat: 3, team: 2, occupied: false, playerId: null, username: null, avatar: null, isBot: false, isReady: false, isConnected: false, presence: 'ONLINE' },
    ];
  }

  public registerSocket(
    socketId: string,
    user: { id: string; username: string; avatar: string },
    role: UserRole = 'PLAYER'
  ) {
    this.socketPlayers.set(socketId, {
      socketId,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      role,
      seat: null,
      roomId: null,
    });
  }

  public unregisterSocket(socketId: string) {
    this.socketPlayers.delete(socketId);
  }

  public getPlayerBySocket(socketId: string): ConnectedPlayer | undefined {
    return this.socketPlayers.get(socketId);
  }

  public getConnectedPlayersInRoom(roomId: string): ConnectedPlayer[] {
    const players: ConnectedPlayer[] = [];
    const room = this.rooms.get(roomId);
    for (const player of this.socketPlayers.values()) {
      if (player.roomId === roomId) {
        players.push(player);
      } else if (room) {
        const isSeated = room.seats.some((s) => s.playerId === player.userId && s.occupied);
        const isAdmin = room.currentAdminId === player.userId || room.originalAdminId === player.userId;
        const isJudge = room.judge?.userId === player.userId;
        const isSpectator = room.spectator?.userId === player.userId;
        if (isSeated || isAdmin || isJudge || isSpectator) {
          player.roomId = roomId;
          if (isJudge) {
            player.role = 'JUDGE';
            player.seat = null;
          } else if (isSpectator) {
            player.role = 'SPECTATOR';
            player.seat = null;
          }
          players.push(player);
        }
      }
    }
    return players;
  }

  public getAllRooms(): RoomDetails[] {
    return Array.from(this.rooms.values());
  }

  public getRoom(roomId: string): RoomDetails | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomByCode(code: string): RoomDetails | undefined {
    for (const room of this.rooms.values()) {
      if (room.code.toUpperCase() === code.toUpperCase()) {
        return room;
      }
    }
    return undefined;
  }

  public createRoom(
    ownerSocketId: string,
    ownerUser: { id: string; username: string; avatar: string },
    name: string,
    settings?: Partial<RoomSettings>,
    initialRole: UserRole = 'ADMIN'
  ): RoomDetails {
    const id = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const code = this.generateCode();

    const mergedSettings: RoomSettings = {
      targetScore: settings?.targetScore === 151 ? 151 : 101,
      maxPlayers: settings?.maxPlayers === 2 ? 2 : 4,
      fillWithBots: settings?.fillWithBots ?? true,
      roundTimerSeconds: settings?.roundTimerSeconds || 20,
      isPrivate: settings?.isPrivate ?? false,
      allowJudge: settings?.allowJudge ?? true,
      allowSpectator: settings?.allowSpectator ?? true,
      voiceEnabled: settings?.voiceEnabled ?? true,
      quickChatEnabled: settings?.quickChatEnabled ?? true,
      reactionsEnabled: settings?.reactionsEnabled ?? true,
      selectedBotId: settings?.selectedBotId || 'EL_SAMY',
    };

    const seats = this.createDefaultSeats();
    const isJudge = initialRole === 'JUDGE';
    const isSpectator = initialRole === 'SPECTATOR';

    if (!isJudge && !isSpectator) {
      // Assign owner to Seat 0 (Team 1)
      seats[0] = {
        seat: 0,
        team: 1,
        occupied: true,
        playerId: ownerUser.id,
        username: ownerUser.username,
        avatar: ownerUser.avatar,
        isBot: false,
        isReady: true,
        isConnected: true,
        presence: 'IN_ROOM',
      };
    } else {
      // Assign Seat 0 to a Bot!
      const botConfig = { name: 'الرايق', botId: 'EL_RAYEQ' as BotId, avatar: 'bot-rayeq' };
      seats[0] = {
        seat: 0,
        team: 1,
        occupied: true,
        playerId: 'bot_0',
        username: botConfig.name,
        avatar: botConfig.avatar,
        isBot: true,
        botId: botConfig.botId,
        isReady: true,
        isConnected: true,
        presence: 'ONLINE',
      };
    }

    // If fillWithBots is enabled or judge/spectator mode, automatically configure bots for empty seats
    if (mergedSettings.fillWithBots || isJudge || isSpectator) {
      mergedSettings.fillWithBots = true;
      const defaultBots: { name: string; botId: BotId; avatar: string }[] = [
        { name: 'القط', botId: 'EL_QETT', avatar: 'bot-qett' },
        { name: 'السامي', botId: 'EL_SAMY', avatar: 'bot-samy' },
        { name: 'رقم واحد', botId: 'RAQAM_WAHED', avatar: 'bot-raqam-wahed' },
      ];
      for (let s = 1; s < 4; s++) {
        const botConfig = defaultBots[s - 1];
        seats[s] = {
          seat: s as PlayerSeat,
          team: s === 2 ? 1 : 2,
          occupied: true,
          playerId: `bot_${s}`,
          username: botConfig.name,
          avatar: botConfig.avatar,
          isBot: true,
          botId: botConfig.botId,
          isReady: true,
          isConnected: true,
          presence: 'ONLINE',
        };
      }
    }

    const room: RoomDetails = {
      id,
      code,
      name: name || `Room ${code}`,
      ownerId: ownerUser.id,
      currentAdminId: ownerUser.id,
      originalAdminId: ownerUser.id,
      settings: mergedSettings,
      seats,
      judge: isJudge
        ? {
            userId: ownerUser.id,
            username: ownerUser.username,
            avatar: ownerUser.avatar,
            isConnected: true,
            isMuted: false,
          }
        : null,
      spectator: isSpectator
        ? {
            userId: ownerUser.id,
            username: ownerUser.username,
            avatar: ownerUser.avatar,
            isConnected: true,
            isMuted: false,
          }
        : null,
      spectators: isSpectator
        ? [
            {
              userId: ownerUser.id,
              username: ownerUser.username,
              avatar: ownerUser.avatar,
              isConnected: true,
              isMuted: false,
            },
          ]
        : [],
      disconnectGraces: [],
      matchStatus: 'LOBBY',
      createdAt: Date.now(),
    };

    this.rooms.set(id, room);

    const connected = this.socketPlayers.get(ownerSocketId);
    if (connected) {
      connected.roomId = id;
      connected.seat = isJudge || isSpectator ? null : 0;
      connected.role = isJudge ? 'JUDGE' : isSpectator ? 'SPECTATOR' : 'ADMIN';
    }

    return room;
  }

  public joinRoom(
    roomId: string,
    socketId: string,
    user: { id: string; username: string; avatar: string }
  ): RoomDetails {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Check if player is already seated (e.g. reconnecting)
    let playerSeat = room.seats.find(
      (s) => !s.isBot && s.occupied && Boolean(user.id && s.playerId === user.id)
    );

    // Fallback: if only 1 human seat exists and user matches admin, restore to that seat
    if (!playerSeat) {
      const humanSeats = room.seats.filter((s) => s.occupied && !s.isBot);
      if (humanSeats.length === 1 && (room.currentAdminId === user.id || room.originalAdminId === user.id)) {
        playerSeat = humanSeats[0];
      }
    }

    const isJudge = Boolean(
      room.judge && room.judge.userId === user.id
    );
    const isSpectator = Boolean(
      room.spectator?.userId === user.id ||
      room.spectators?.some((sp) => sp.userId === user.id)
    );

    const connected = this.socketPlayers.get(socketId);

    if (playerSeat) {
      playerSeat.isConnected = true;
      playerSeat.presence = 'IN_ROOM';
      playerSeat.isTemporarilyBotControlled = false;
      if (user.avatar) playerSeat.avatar = user.avatar;
      if (user.username) playerSeat.username = user.username;

      // Clear disconnect grace and lobby disconnect timer if active
      this.cancelDisconnectGrace(roomId, playerSeat.seat);
      this.cancelLobbyDisconnect(roomId, user.id);

      // Restore original admin if returning
      if (room.originalAdminId === user.id && room.currentAdminId !== user.id) {
        room.currentAdminId = user.id;
        this.logger.log(`Restored admin status to original creator ${user.username} in room ${roomId}`);
      }

      if (connected) {
        connected.roomId = roomId;
        connected.seat = playerSeat.seat;
        connected.role = (room.currentAdminId === user.id || room.originalAdminId === user.id || room.ownerId === user.id) ? 'ADMIN' : 'PLAYER';
      }
      return room;
    }

    if (isJudge) {
      this.cancelLobbyDisconnect(roomId, user.id);
      if (room.judge) room.judge.isConnected = true;
      if (connected) {
        connected.roomId = roomId;
        connected.seat = null;
        connected.role = 'JUDGE';
      }
      return room;
    }

    if (isSpectator) {
      this.cancelLobbyDisconnect(roomId, user.id);
      const spec = room.spectators?.find((s) => s.userId === user.id);
      if (spec) spec.isConnected = true;
      if (room.spectator && room.spectator.userId === user.id) {
        room.spectator.isConnected = true;
      }
      if (connected) {
        connected.roomId = roomId;
        connected.seat = null;
        connected.role = 'SPECTATOR';
      }
      return room;
    }

    // New unseated user
    if (room.matchStatus !== 'LOBBY') {
      // Check if there is an available BOT seat that the joining player can take over to PLAY!
      let availableBotSeat = room.seats.find((s) => s.isBot && s.occupied);
      if (!availableBotSeat) {
        availableBotSeat = room.seats.find((s) => !s.occupied);
      }

      if (availableBotSeat) {
        availableBotSeat.occupied = true;
        availableBotSeat.playerId = user.id;
        availableBotSeat.username = user.username;
        availableBotSeat.avatar = user.avatar;
        availableBotSeat.isBot = false;
        delete availableBotSeat.botId;
        availableBotSeat.isReady = true;
        availableBotSeat.isConnected = true;
        availableBotSeat.presence = 'IN_ROOM';
        availableBotSeat.isTemporarilyBotControlled = false;
        playerSeat = availableBotSeat;

        if (connected) {
          connected.roomId = roomId;
          connected.seat = playerSeat.seat;
          connected.role = 'PLAYER';
        }
        this.logger.log(`Live match takeover: ${user.username} took over seat ${playerSeat.seat} in room ${roomId}`);
        return room;
      }

      // If all 4 seats are already occupied by human players, join as spectator
      if (room.settings.allowSpectator) {
        try {
          return this.joinAsSpectator(roomId, socketId, user);
        } catch {
          if (connected) {
            connected.roomId = roomId;
            connected.seat = null;
            connected.role = 'SPECTATOR';
          }
          return room;
        }
      }
      if (connected) {
        connected.roomId = roomId;
        connected.seat = null;
        connected.role = 'SPECTATOR';
      }
      return room;
    }

    // Prioritize empty seats first; if none empty, take a bot's seat!
    let availableSeat = room.seats.find((s) => !s.occupied);
    if (!availableSeat) {
      availableSeat = room.seats.find((s) => s.isBot);
    }
    if (!availableSeat) {
      throw new Error('All 4 playing seats are occupied by human players');
    }

    availableSeat.occupied = true;
    availableSeat.playerId = user.id;
    availableSeat.username = user.username;
    availableSeat.avatar = user.avatar;
    availableSeat.isBot = false;
    delete availableSeat.botId;
    availableSeat.isReady = true;
    availableSeat.isConnected = true;
    availableSeat.presence = 'IN_ROOM';
    availableSeat.isTemporarilyBotControlled = false;
    playerSeat = availableSeat;

    if (connected) {
      connected.roomId = roomId;
      connected.seat = playerSeat.seat;
      connected.role = (room.currentAdminId === user.id || room.originalAdminId === user.id) ? 'ADMIN' : 'PLAYER';
    }

    return room;
  }

  public joinAsJudge(
    roomId: string,
    socketId: string,
    user: { id: string; username: string; avatar: string }
  ): RoomDetails {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const isAdmin =
      room.currentAdminId === user.id ||
      room.originalAdminId === user.id ||
      room.ownerId === user.id;

    if (isAdmin) {
      room.settings.allowJudge = true;
    } else if (!room.settings.allowJudge) {
      throw new Error('Judge mode is disabled for this room');
    }

    const isCurrentJudge =
      room.judge &&
      (room.judge.userId === user.id || (room.judge.username && room.judge.username === user.username));

    if (room.judge && !isCurrentJudge && !isAdmin && room.judge.isConnected) {
      throw new Error('A Judge is already presiding over this room (Max 1)');
    }

    if (room.spectator?.userId === user.id || room.spectator?.username === user.username) {
      room.spectator = null;
    }

    room.settings.fillWithBots = true;
    const defaultBots: { name: string; botId: BotId; avatar: string }[] = [
      { name: 'الرايق', botId: 'EL_RAYEQ', avatar: 'bot-rayeq' },
      { name: 'القط', botId: 'EL_QETT', avatar: 'bot-qett' },
      { name: 'السامي', botId: 'EL_SAMY', avatar: 'bot-samy' },
      { name: 'رقم واحد', botId: 'RAQAM_WAHED', avatar: 'bot-raqam-wahed' },
    ];

    // When joining as Judge: replace the user's vacated seat with a bot.
    // If no other human players are seated, guarantee ALL 4 seats are active Egyptian bots!
    const otherHumanSeats = room.seats.filter(
      (s) => !s.isBot && s.occupied && s.playerId !== user.id && s.username !== user.username
    );
    const noOtherHumans = otherHumanSeats.length === 0;

    if (room.matchStatus !== 'PLAYING') {
      room.seats.forEach((seat, idx) => {
        const isVacatingUser =
          !seat.isBot &&
          (seat.playerId === user.id || (user.username && seat.username === user.username));

        if (noOtherHumans || isVacatingUser || !seat.occupied) {
          const botConfig = defaultBots[idx % defaultBots.length];
          room.seats[idx] = {
            seat: idx as PlayerSeat,
            team: (idx === 0 || idx === 2 ? 1 : 2) as TeamId,
            occupied: true,
            playerId: `bot_${idx}`,
            username: botConfig.name,
            avatar: botConfig.avatar,
            isBot: true,
            botId: botConfig.botId,
            isReady: true,
            isConnected: true,
            presence: 'ONLINE',
          };
        }
      });
    }

    room.judge = {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      isConnected: true,
      isMuted: false,
    };

    const connected = this.socketPlayers.get(socketId);
    if (connected) {
      connected.roomId = roomId;
      connected.role = 'JUDGE';
      connected.seat = null;
    }

    return room;
  }

  public joinAsSpectator(
    roomId: string,
    socketId: string,
    user: { id: string; username: string; avatar: string }
  ): RoomDetails {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const isAdmin =
      room.currentAdminId === user.id ||
      room.originalAdminId === user.id ||
      room.ownerId === user.id;

    if (isAdmin) {
      room.settings.allowSpectator = true;
    } else if (!room.settings.allowSpectator) {
      throw new Error('Spectator mode is disabled for this room');
    }

    const isCurrentSpectator =
      room.spectator &&
      (room.spectator.userId === user.id || (room.spectator.username && room.spectator.username === user.username));

    if (room.spectator && !isCurrentSpectator && room.spectator.isConnected) {
      throw new Error('A Spectator is already watching this room (Max 1)');
    }

    if (room.judge?.userId === user.id || room.judge?.username === user.username) {
      room.judge = null;
    }

    room.settings.fillWithBots = true;
    const defaultBots: { name: string; botId: BotId; avatar: string }[] = [
      { name: 'الرايق', botId: 'EL_RAYEQ', avatar: 'bot-rayeq' },
      { name: 'القط', botId: 'EL_QETT', avatar: 'bot-qett' },
      { name: 'السامي', botId: 'EL_SAMY', avatar: 'bot-samy' },
      { name: 'رقم واحد', botId: 'RAQAM_WAHED', avatar: 'bot-raqam-wahed' },
    ];

    // Vacate seat occupied by this user and guarantee all empty seats are populated with bots
    const otherHumanSeats = room.seats.filter(
      (s) => !s.isBot && s.occupied && s.playerId !== user.id && s.username !== user.username
    );
    const noOtherHumans = otherHumanSeats.length === 0;

    room.seats.forEach((seat, idx) => {
      const isVacatingUser =
        !seat.isBot &&
        (seat.playerId === user.id || (user.username && seat.username === user.username));

      if (noOtherHumans || !seat.occupied || isVacatingUser) {
        const botConfig = defaultBots[idx % defaultBots.length];
        room.seats[idx] = {
          seat: idx as PlayerSeat,
          team: (idx === 0 || idx === 2 ? 1 : 2) as TeamId,
          occupied: true,
          playerId: `bot_${idx}`,
          username: botConfig.name,
          avatar: botConfig.avatar,
          isBot: true,
          botId: botConfig.botId,
          isReady: true,
          isConnected: true,
          presence: 'ONLINE',
        };
      }
    });

    const specInfo: SpectatorInfo = {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      isConnected: true,
      isMuted: false,
    };
    room.spectator = specInfo;
    if (!room.spectators) room.spectators = [];
    const existingIdx = room.spectators.findIndex((s) => s.userId === user.id);
    if (existingIdx >= 0) {
      room.spectators[existingIdx] = specInfo;
    } else {
      room.spectators.push(specInfo);
    }

    const connected = this.socketPlayers.get(socketId);
    if (connected) {
      connected.roomId = roomId;
      connected.role = 'SPECTATOR';
      connected.seat = null;
    }

    return room;
  }

  public selectSeat(
    roomId: string,
    userId: string,
    targetSeat: PlayerSeat,
    userPayload?: { id?: string; username?: string; avatar?: string }
  ): RoomDetails {
    if (!Number.isInteger(targetSeat) || targetSeat < 0 || targetSeat > 3) {
      throw new Error('Invalid seat index: seat must be between 0 and 3');
    }

    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.matchStatus !== 'LOBBY') throw new Error('Cannot change seats during a match');

    const effectiveUserId = userPayload?.id || userId;
    const effectiveUsername = userPayload?.username;

    const isJudge =
      room.judge?.userId === effectiveUserId ||
      room.judge?.userId === userId;
    const isSpectator =
      room.spectator?.userId === effectiveUserId ||
      room.spectator?.userId === userId ||
      room.spectators?.some((s) => s.userId === effectiveUserId || s.userId === userId);

    const currentSeatObj = room.seats.find(
      (s) =>
        !s.isBot &&
        s.occupied &&
        ((effectiveUserId && s.playerId === effectiveUserId) ||
          (userId && s.playerId === userId))
    );

    const targetSeatObj = room.seats[targetSeat];
    if (!targetSeatObj) {
      throw new Error(`Target seat ${targetSeat} is invalid`);
    }

    // Do not allow taking a seat occupied by another real human
    if (
      targetSeatObj.occupied &&
      !targetSeatObj.isBot &&
      targetSeatObj.playerId !== effectiveUserId &&
      targetSeatObj.playerId !== userId
    ) {
      throw new Error(`Seat ${targetSeat} is already occupied by another player`);
    }

    const userInfo = {
      playerId: effectiveUserId,
      username:
        userPayload?.username ||
        currentSeatObj?.username ||
        effectiveUsername ||
        (isJudge ? room.judge?.username : room.spectator?.username) ||
        'Player',
      avatar:
        userPayload?.avatar ||
        currentSeatObj?.avatar ||
        (isJudge ? room.judge?.avatar : room.spectator?.avatar) ||
        '1',
    };

    if (isJudge) {
      room.judge = null;
    }
    if (isSpectator) {
      room.spectator = null;
      if (room.spectators) {
        room.spectators = room.spectators.filter(
          (s) => s.userId !== effectiveUserId && s.userId !== userId
        );
      }
    }

    // Capture target seat state before modifying
    const displacedBot = targetSeatObj.isBot ? { ...targetSeatObj } : null;

    // Clear or swap any seats previously held by this human player in this room
    let swappedSeat = false;
    for (let i = 0; i < room.seats.length; i++) {
      if (i !== targetSeat) {
        const s = room.seats[i];
        const isThisPlayer = !s.isBot && s.occupied && (
          (effectiveUserId && s.playerId === effectiveUserId) ||
          (userId && s.playerId === userId)
        );

        if (isThisPlayer) {
          if (displacedBot && !swappedSeat) {
            room.seats[i] = {
              ...displacedBot,
              seat: i as PlayerSeat,
              team: (i === 0 || i === 2 ? 1 : 2) as TeamId,
              playerId: `bot_${i}`,
            };
            swappedSeat = true;
          } else {
            room.seats[i] = {
              seat: i as PlayerSeat,
              team: (i === 0 || i === 2 ? 1 : 2) as TeamId,
              occupied: false,
              playerId: null,
              username: null,
              avatar: null,
              isBot: false,
              isReady: false,
              isConnected: false,
              presence: 'ONLINE',
            };
          }
        }
      }
    }

    // Place the user in the target seat
    room.seats[targetSeat] = {
      seat: targetSeat,
      team: (targetSeat === 0 || targetSeat === 2 ? 1 : 2) as TeamId,
      occupied: true,
      playerId: userInfo.playerId,
      username: userInfo.username,
      avatar: userInfo.avatar,
      isBot: false,
      isReady: true,
      isConnected: true,
      presence: 'IN_ROOM',
      isTemporarilyBotControlled: false,
    };
    delete room.seats[targetSeat].botId;

    this.cancelLobbyDisconnect(roomId, effectiveUserId);

    for (const p of this.socketPlayers.values()) {
      if (
        (p.userId === effectiveUserId || p.userId === userId) &&
        p.roomId === roomId
      ) {
        p.seat = targetSeat;
        const isAdmin = room.currentAdminId === effectiveUserId || room.originalAdminId === effectiveUserId || room.ownerId === effectiveUserId;
        p.role = isAdmin ? 'ADMIN' : 'PLAYER';
      }
    }

    this.logger.log(`User ${userInfo.username} (${effectiveUserId}) selected seat ${targetSeat} in room ${roomId}`);
    return room;
  }

  public adminMoveSeat(
    roomId: string,
    adminId: string,
    fromSeat: PlayerSeat,
    toSeat: PlayerSeat
  ): RoomDetails {
    if (
      !Number.isInteger(fromSeat) ||
      fromSeat < 0 ||
      fromSeat > 3 ||
      !Number.isInteger(toSeat) ||
      toSeat < 0 ||
      toSeat > 3
    ) {
      throw new Error('Invalid seat indices: fromSeat and toSeat must be between 0 and 3');
    }

    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.currentAdminId !== adminId) throw new Error('Only the room admin can reassign seats');
    if (room.matchStatus !== 'LOBBY') throw new Error('Cannot reassign seats during a match');

    const from = room.seats[fromSeat];
    const to = room.seats[toSeat];

    const tempFrom: RoomSeatInfo = {
      ...from,
      seat: toSeat,
      team: (toSeat === 0 || toSeat === 2 ? 1 : 2) as TeamId,
    };
    const tempTo: RoomSeatInfo = {
      ...to,
      seat: fromSeat,
      team: (fromSeat === 0 || fromSeat === 2 ? 1 : 2) as TeamId,
    };

    room.seats[fromSeat] = tempTo;
    room.seats[toSeat] = tempFrom;

    // Keep socketPlayers seat in sync for human players
    for (const player of this.socketPlayers.values()) {
      if (player.roomId === roomId) {
        if (from.playerId && player.userId === from.playerId) {
          player.seat = toSeat;
        } else if (to.playerId && player.userId === to.playerId) {
          player.seat = fromSeat;
        }
      }
    }

    return room;
  }

  public toggleBot(
    roomId: string,
    adminId: string,
    seat: PlayerSeat,
    enable: boolean,
    botId?: BotId
  ): RoomDetails {
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
      throw new Error('Invalid seat index: seat must be between 0 and 3');
    }

    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.currentAdminId !== adminId) throw new Error('Only room admin can toggle bots');
    if (room.matchStatus !== 'LOBBY') throw new Error('Cannot toggle bots while match is in progress');

    const seatObj = room.seats[seat];
    if (enable) {
      const selectedId = botId || 'EL_SAMY';
      seatObj.occupied = true;
      seatObj.playerId = `bot_${seat}`;
      seatObj.username = selectedId;
      seatObj.avatar = `bot-${selectedId.toLowerCase()}`;
      seatObj.isBot = true;
      seatObj.botId = selectedId;
      seatObj.isReady = true;
      seatObj.isConnected = true;
      seatObj.presence = 'ONLINE';
    } else {
      seatObj.occupied = false;
      seatObj.playerId = null;
      seatObj.username = null;
      seatObj.avatar = null;
      seatObj.isBot = false;
      delete seatObj.botId;
      seatObj.isReady = false;
      seatObj.isConnected = false;
      seatObj.presence = 'ONLINE';
    }

    return room;
  }

  public updateSettings(
    roomId: string,
    adminId: string,
    settings: Partial<RoomSettings>
  ): RoomDetails {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    const isAuthorized =
      room.currentAdminId === adminId ||
      room.ownerId === adminId ||
      room.originalAdminId === adminId ||
      (room.judge && room.judge.userId === adminId);
    if (!isAuthorized) throw new Error('Only room admin or presiding judge can update settings');
    if (room.matchStatus !== 'LOBBY') {
      const allowedDuringMatch = ['voiceEnabled', 'quickChatEnabled', 'reactionsEnabled'];
      const hasDisallowed = Object.keys(settings).some((key) => !allowedDuringMatch.includes(key));
      if (hasDisallowed) {
        throw new Error('Cannot update gameplay settings while match is in progress');
      }
    }

    room.settings = {
      ...room.settings,
      ...settings,
    };

    return room;
  }

  /**
   * Starts a 120-second disconnect grace period with automatic bot takeover.
   */
  public startDisconnectGrace(
    roomId: string,
    seat: PlayerSeat,
    onExpiry: () => void
  ): DisconnectGraceInfo | null {
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
      return null;
    }

    const room = this.rooms.get(roomId);
    if (!room || room.matchStatus !== 'PLAYING') return null;

    const seatObj = room.seats[seat];
    if (!seatObj || seatObj.isBot || !seatObj.playerId) return null;

    seatObj.isConnected = false;
    seatObj.presence = 'DISCONNECTED';
    seatObj.isTemporarilyBotControlled = true;

    const grace: DisconnectGraceInfo = {
      seat,
      userId: seatObj.playerId,
      username: seatObj.username || 'Player',
      disconnectedAt: Date.now(),
      gracePeriodSeconds: 120,
      botTakeoverActive: true,
    };

    // Remove existing if any
    room.disconnectGraces = room.disconnectGraces.filter((g) => g.seat !== seat);
    room.disconnectGraces.push(grace);

    const timerKey = `${roomId}_${seat}`;
    if (this.graceTimers.has(timerKey)) {
      clearTimeout(this.graceTimers.get(timerKey)!);
    }

    const timer = setTimeout(() => {
      onExpiry();
    }, 120000);

    this.graceTimers.set(timerKey, timer);

    // If disconnected user is room admin -> transfer admin
    if (room.currentAdminId === seatObj.playerId) {
      this.transferAdmin(room, seat);
    }

    return grace;
  }

  public cancelDisconnectGrace(roomId: string, seat: PlayerSeat): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.disconnectGraces = room.disconnectGraces.filter((g) => g.seat !== seat);
    }
    const timerKey = `${roomId}_${seat}`;
    const timer = this.graceTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(timerKey);
    }
  }

  private transferAdmin(room: RoomDetails, disconnectedSeat: PlayerSeat): void {
    // 1. Prefer teammate (Seat 0 <-> 2, Seat 1 <-> 3) if connected human
    const teammateSeat = ((disconnectedSeat + 2) % 4) as PlayerSeat;
    const teammate = room.seats[teammateSeat];

    if (teammate && !teammate.isBot && teammate.isConnected && teammate.playerId) {
      room.currentAdminId = teammate.playerId;
      this.logger.log(`Transferred admin to teammate ${teammate.username} in room ${room.id}`);
      return;
    }

    // 2. Find any connected human player
    const anyConnectedHuman = room.seats.find((s) => !s.isBot && s.isConnected && s.playerId);
    if (anyConnectedHuman && anyConnectedHuman.playerId) {
      room.currentAdminId = anyConnectedHuman.playerId;
      this.logger.log(`Transferred admin to player ${anyConnectedHuman.username} in room ${room.id}`);
    }
  }

  public handleLobbyDisconnect(
    roomId: string,
    userId: string,
    onExpiry: () => void
  ): RoomDetails | null {
    const room = this.rooms.get(roomId);
    if (!room || room.matchStatus !== 'LOBBY') return null;

    const seatObj = room.seats.find((s) => !s.isBot && s.occupied && s.playerId === userId);
    if (seatObj) {
      seatObj.isConnected = false;
      seatObj.presence = 'DISCONNECTED';
    }
    if (room.judge?.userId === userId) {
      room.judge.isConnected = false;
    }
    if (room.spectator?.userId === userId) {
      room.spectator.isConnected = false;
    }
    const sp = room.spectators?.find((s) => s.userId === userId);
    if (sp) {
      sp.isConnected = false;
    }

    const timerKey = `${roomId}_${userId}`;
    if (this.lobbyDisconnectTimers.has(timerKey)) {
      clearTimeout(this.lobbyDisconnectTimers.get(timerKey)!);
    }

    const timer = setTimeout(() => {
      this.lobbyDisconnectTimers.delete(timerKey);
      this.removeLobbyPlayer(roomId, userId);
      onExpiry();
    }, 60000);

    this.lobbyDisconnectTimers.set(timerKey, timer);
    this.logger.log(`Scheduled 60s lobby disconnect grace for user ${userId} in room ${roomId}`);
    return room;
  }

  public cancelLobbyDisconnect(roomId: string, userId: string): void {
    const timerKey = `${roomId}_${userId}`;
    const timer = this.lobbyDisconnectTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.lobbyDisconnectTimers.delete(timerKey);
    }

    const room = this.rooms.get(roomId);
    if (room) {
      const seatObj = room.seats.find((s) => !s.isBot && s.occupied && s.playerId === userId);
      if (seatObj) {
        seatObj.isConnected = true;
        seatObj.presence = 'IN_ROOM';
      }
      if (room.judge?.userId === userId) {
        room.judge.isConnected = true;
      }
      if (room.spectator?.userId === userId) {
        room.spectator.isConnected = true;
      }
      const sp = room.spectators?.find((s) => s.userId === userId);
      if (sp) {
        sp.isConnected = true;
      }
    }
  }

  public removeLobbyPlayer(roomId: string, userId: string): RoomDetails | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    if (room.matchStatus !== 'LOBBY') return room;

    if (room.judge?.userId === userId) {
      room.judge = null;
    }
    if (room.spectator?.userId === userId) {
      room.spectator = null;
    }
    if (room.spectators) {
      room.spectators = room.spectators.filter((s) => s.userId !== userId);
    }

    const seat = room.seats.find((s) => !s.isBot && s.occupied && s.playerId === userId);
    if (seat) {
      seat.occupied = false;
      seat.playerId = null;
      seat.username = null;
      seat.avatar = null;
      seat.isBot = false;
      delete seat.botId;
      seat.isReady = false;
      seat.isConnected = false;
      seat.presence = 'ONLINE';
    }

    if (room.currentAdminId === userId) {
      const remainingHuman = room.seats.find((s) => !s.isBot && s.occupied && s.playerId && s.playerId !== userId);
      if (remainingHuman?.playerId) {
        room.currentAdminId = remainingHuman.playerId;
        this.logger.log(`Transferred lobby admin to player ${remainingHuman.username} (${remainingHuman.playerId}) in room ${room.id}`);
      } else if (room.judge) {
        room.currentAdminId = room.judge.userId;
      } else if (room.spectator) {
        room.currentAdminId = room.spectator.userId;
      }
    }

    return room;
  }

  public leaveRoom(roomId: string, socketId: string): RoomDetails | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const player = this.socketPlayers.get(socketId);
    if (!player) return room;

    this.cancelLobbyDisconnect(roomId, player.userId);

    if (player.role === 'JUDGE' && room.judge?.userId === player.userId) {
      if (room.matchStatus !== 'PLAYING') {
        room.judge = null;
      } else {
        room.judge.isConnected = false;
      }
    } else if (player.role === 'SPECTATOR') {
      if (room.matchStatus !== 'PLAYING') {
        if (room.spectators) {
          room.spectators = room.spectators.filter((s) => s.userId !== player.userId);
        }
        if (room.spectator?.userId === player.userId) {
          room.spectator = room.spectators && room.spectators.length > 0 ? room.spectators[0] : null;
        }
      } else {
        if (room.spectator?.userId === player.userId) {
          room.spectator.isConnected = false;
        }
      }
    } else {
      const seat = room.seats.find((s) => s.playerId === player.userId);
      if (seat && !seat.isBot) {
        if (room.matchStatus === 'LOBBY') {
          seat.occupied = false;
          seat.playerId = null;
          seat.username = null;
          seat.avatar = null;
          seat.isBot = false;
          delete seat.botId;
          seat.isReady = false;
          seat.isConnected = false;
          seat.presence = 'ONLINE';
        } else {
          // Player explicitly left during a live match: convert seat to a random Egyptian bot so human is unlinked and match continues
          const egyptianBots: { botId: BotId; name: string; avatar: string }[] = [
            { botId: 'EL_RAYEQ', name: 'الرايق', avatar: 'bot-rayeq' },
            { botId: 'EL_QETT', name: 'القط', avatar: 'bot-qett' },
            { botId: 'EL_SAMY', name: 'السامي', avatar: 'bot-samy' },
            { botId: 'RAQAM_WAHED', name: 'رقم واحد', avatar: 'bot-raqam-wahed' },
          ];
          const existingBotIds = new Set(room.seats.filter((s) => s.isBot && s.botId).map((s) => s.botId));
          const availableBots = egyptianBots.filter((b) => !existingBotIds.has(b.botId));
          const chosenBot = (availableBots.length > 0 ? availableBots : egyptianBots)[
            Math.floor(Math.random() * (availableBots.length > 0 ? availableBots.length : egyptianBots.length))
          ];

          seat.occupied = true;
          seat.playerId = `bot_${seat.seat}`;
          seat.username = chosenBot.name;
          seat.avatar = chosenBot.avatar;
          seat.isBot = true;
          seat.botId = chosenBot.botId;
          seat.isReady = true;
          seat.isConnected = true;
          seat.presence = 'ONLINE';
          seat.isTemporarilyBotControlled = false;
        }
      }
    }

    // If departing player is current admin, transfer admin to remaining participant
    if (room.currentAdminId === player.userId) {
      const remainingHuman = room.seats.find(
        (s) => !s.isBot && s.occupied && s.playerId && s.playerId !== player.userId
      );
      if (remainingHuman?.playerId) {
        room.currentAdminId = remainingHuman.playerId;
        this.logger.log(`Transferred room admin to player ${remainingHuman.username} (${remainingHuman.playerId}) in room ${room.id}`);
      } else if (room.judge && room.judge.userId !== player.userId) {
        room.currentAdminId = room.judge.userId;
      } else if (room.spectator && room.spectator.userId !== player.userId) {
        room.currentAdminId = room.spectator.userId;
      }
    }

    player.roomId = null;
    player.seat = null;

    return room;
  }

  public countHumanPlayers(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    return room.seats.filter((s) => s.occupied && !s.isBot && s.playerId).length;
  }

  /**
   * Judge kicks a player to the spectator pool and replaces the seat with a bot.
   */
  public kickSeatToSpectator(
    roomId: string,
    seat: PlayerSeat,
    chosenBotId?: BotId
  ): {
    success: boolean;
    kickedUser?: { userId: string; username: string; avatar: string; seat: PlayerSeat };
    botConfig?: { name: string; botId: BotId; avatar: string };
    error?: string;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'الغرفة غير موجودة' };
    const seatObj = room.seats[seat];
    if (!seatObj) return { success: false, error: 'المقعد غير صالح' };

    const botMap: Record<BotId, { name: string; botId: BotId; avatar: string }> = {
      EL_RAYEQ: { name: 'الرايق', botId: 'EL_RAYEQ', avatar: 'bot-rayeq' },
      EL_QETT: { name: 'القط', botId: 'EL_QETT', avatar: 'bot-qett' },
      EL_TITO: { name: 'التيتو', botId: 'EL_TITO', avatar: 'bot-tito' },
      RAQAM_WAHED: { name: 'رقم واحد في العزبة', botId: 'RAQAM_WAHED', avatar: 'bot-raqam-wahed' },
      EL_HEMA: { name: 'الهيما', botId: 'EL_HEMA', avatar: 'bot-hema' },
      EL_HOBA: { name: 'الهوبا', botId: 'EL_HOBA', avatar: 'bot-hoba' },
      EL_SAMY: { name: 'السامي', botId: 'EL_SAMY', avatar: 'bot-samy' },
    };

    const fallbackBots = [botMap.EL_RAYEQ, botMap.EL_QETT, botMap.EL_SAMY, botMap.RAQAM_WAHED];
    const botConfig = (chosenBotId && botMap[chosenBotId]) || fallbackBots[seat % fallbackBots.length];

    let kickedUser: { userId: string; username: string; avatar: string; seat: PlayerSeat } | undefined;

    // Only if seat is occupied by a real human player, move him to spectators pool:
    if (!seatObj.isBot && seatObj.playerId && !seatObj.playerId.startsWith('bot_')) {
      const activeUser = {
        userId: seatObj.playerId,
        username: seatObj.username || 'لاعب',
        avatar: seatObj.avatar || '1',
        seat,
      };
      kickedUser = activeUser;

      if (!room.spectators) room.spectators = [];
      const specInfo: SpectatorInfo = {
        userId: activeUser.userId,
        username: activeUser.username,
        avatar: activeUser.avatar,
        isConnected: seatObj.isConnected,
        isMuted: false,
      };
      if (!room.spectators.some((s) => s.userId === activeUser.userId)) {
        room.spectators.push(specInfo);
      }
      room.spectator = room.spectators[0];

      for (const p of this.socketPlayers.values()) {
        if (p.userId === activeUser.userId && p.roomId === roomId) {
          p.role = 'SPECTATOR';
          p.seat = null;
        }
      }
    }
    // Note: If seatObj.isBot is true, do NOT add to spectators pool as requested.

    seatObj.occupied = true;
    seatObj.isBot = true;
    seatObj.botId = botConfig.botId;
    seatObj.username = botConfig.name;
    seatObj.avatar = botConfig.avatar;
    seatObj.playerId = `bot_${seat}`;
    seatObj.isReady = true;
    seatObj.isConnected = true;
    seatObj.presence = 'ONLINE';

    return { success: true, kickedUser, botConfig };
  }

  /**
   * Judge returns a spectator back into a seat (or substitutes a spectator into a bot seat).
   */
  public returnSpectatorToSeat(
    roomId: string,
    spectatorUserId: string,
    seat: PlayerSeat
  ): {
    success: boolean;
    restoredUser?: { userId: string; username: string; avatar: string };
    error?: string;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'الغرفة غير موجودة' };
    const seatObj = room.seats[seat];
    if (!seatObj) return { success: false, error: 'المقعد غير صالح' };

    const specIndex = (room.spectators || []).findIndex((s) => s.userId === spectatorUserId);
    const specInfo =
      specIndex >= 0
        ? room.spectators![specIndex]
        : room.spectator?.userId === spectatorUserId
        ? room.spectator
        : null;

    if (!specInfo) return { success: false, error: 'المشاهد غير متواجد' };

    if (room.spectators && specIndex >= 0) {
      room.spectators.splice(specIndex, 1);
      room.spectator = room.spectators[0] || null;
    } else if (room.spectator?.userId === spectatorUserId) {
      room.spectator = null;
    }

    seatObj.occupied = true;
    seatObj.isBot = false;
    seatObj.botId = undefined;
    seatObj.playerId = specInfo.userId;
    seatObj.username = specInfo.username;
    seatObj.avatar = specInfo.avatar;
    seatObj.isConnected = specInfo.isConnected;
    seatObj.presence = 'IN_ROOM';
    seatObj.isReady = true;

    for (const p of this.socketPlayers.values()) {
      if (p.userId === specInfo.userId && p.roomId === roomId) {
        p.role = 'PLAYER';
        p.seat = seat;
      }
    }

    return {
      success: true,
      restoredUser: {
        userId: specInfo.userId,
        username: specInfo.username,
        avatar: specInfo.avatar,
      },
    };
  }

  /**
   * Mute or unmute spectator chat / voice.
   */
  public setSpectatorMute(
    roomId: string,
    spectatorUserId: string,
    muteType: 'CHAT' | 'VOICE',
    isMuted: boolean
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const spec =
      (room.spectators || []).find((s) => s.userId === spectatorUserId) ||
      (room.spectator?.userId === spectatorUserId ? room.spectator : null);
    if (spec) {
      if (muteType === 'CHAT') spec.isMuted = isMuted;
      if (muteType === 'VOICE') spec.isVoiceMuted = isMuted;
      return true;
    }
    return false;
  }

  public deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
    for (const [key, timer] of this.graceTimers.entries()) {
      if (key.startsWith(roomId)) {
        clearTimeout(timer);
        this.graceTimers.delete(key);
      }
    }
    this.logger.log(`Room ${roomId} has been deleted.`);
  }

  public updateMatchStatus(roomId: string, status: MatchStatus): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.matchStatus = status;
    }
  }
}
