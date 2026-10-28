import { PlayerSeat, TeamId, MatchStatus } from './domino';
import { BotId } from './bot';

export type UserRole = 'PLAYER' | 'ADMIN' | 'JUDGE' | 'SPECTATOR';

export type PresenceStatus =
  | 'ONLINE'
  | 'IN_ROOM'
  | 'PLAYING'
  | 'AWAY'
  | 'DISCONNECTED'
  | 'BOT_CONTROLLED';

/**
 * Who referees the match, chosen in the lobby before it starts:
 * - HUMAN:  a person sits as referee (until one joins, the server referees)
 * - SERVER: the server's automatic referee (warnings, cheating, leaving the screen)
 * - NONE:   no referee at all, no penalties (illegal moves are simply refused)
 */
export type RefereeMode = 'HUMAN' | 'SERVER' | 'NONE';

export interface RoomSettings {
  targetScore: 101 | 151;
  /** 4 = زوجي (2 vs 2). 2 = فردي (1 vs 1 with a draw pile). */
  maxPlayers: 2 | 4;
  fillWithBots: boolean;
  roundTimerSeconds: number;
  isPrivate: boolean;
  allowJudge: boolean;
  allowSpectator: boolean;
  voiceEnabled: boolean;
  quickChatEnabled: boolean;
  reactionsEnabled: boolean;
  selectedBotId?: BotId;
  roomName?: string;
  refereeMode?: RefereeMode;
}

export interface RoomSeatInfo {
  seat: PlayerSeat;
  team: TeamId;
  occupied: boolean;
  playerId: string | null;
  username: string | null;
  avatar: string | null;
  isBot: boolean;
  botId?: BotId;
  isReady: boolean;
  isConnected: boolean;
  presence: PresenceStatus;
  isTemporarilyBotControlled?: boolean;
  /** SOLO rooms (maxPlayers 2): seats 2 and 3 are not part of the table. */
  disabled?: boolean;
}

export interface JudgeInfo {
  userId: string;
  username: string;
  avatar: string;
  isConnected: boolean;
  isMuted: boolean;
}

export interface SpectatorInfo {
  userId: string;
  username: string;
  avatar: string;
  isConnected: boolean;
  isMuted: boolean;
  isVoiceMuted?: boolean;
  isChatMuted?: boolean;
  isReactionsMuted?: boolean;
}

export interface DisconnectGraceInfo {
  seat: PlayerSeat;
  userId: string;
  username: string;
  disconnectedAt: number;
  gracePeriodSeconds: number; // 120 seconds
  botTakeoverActive: boolean;
}

export interface RoomDetails {
  id: string;
  code: string;
  name: string;
  ownerId: string;
  currentAdminId: string;
  originalAdminId: string;
  settings: RoomSettings;
  seats: RoomSeatInfo[];
  judge: JudgeInfo | null;
  spectator: SpectatorInfo | null;
  spectators?: SpectatorInfo[];
  disconnectGraces: DisconnectGraceInfo[];
  matchStatus: MatchStatus;
  createdAt: number;
}
