import {
  ChainEnd,
  CheatingEvent,
  DominoTile,
  MatchStatus,
  PlayerSeat,
  SanitizedGameState,
  TeamId,
} from './domino';
import { PresenceStatus, RoomDetails, RoomSettings, UserRole } from './room';
import { UserProfile } from './auth';
import { BotChatMessage, BotId } from './bot';

export enum ClientEvents {
  JOIN_LOBBY = 'client:join_lobby',
  LEAVE_LOBBY = 'client:leave_lobby',
  CREATE_ROOM = 'client:create_room',
  JOIN_ROOM = 'client:join_room',
  JOIN_AS_JUDGE = 'client:join_as_judge',
  JOIN_AS_SPECTATOR = 'client:join_as_spectator',
  LEAVE_ROOM = 'client:leave_room',
  SELECT_SEAT = 'client:select_seat',
  TOGGLE_READY = 'client:toggle_ready',
  ADMIN_MOVE_SEAT = 'client:admin_move_seat',
  ADMIN_UPDATE_SETTINGS = 'client:admin_update_settings',
  ADMIN_KICK_PLAYER = 'client:admin_kick_player',
  ADMIN_TOGGLE_BOT = 'client:admin_toggle_bot',
  ADMIN_SELECT_BOT_TYPE = 'client:admin_select_bot_type',
  ADMIN_START_MATCH = 'client:admin_start_match',
  ADMIN_DECIDE_DISCONNECT_GRACE = 'client:admin_decide_disconnect_grace',
  PLAY_TILE = 'client:play_tile',
  PASS_TURN = 'client:pass_turn',
  REQUEST_NEXT_ROUND = 'client:request_next_round',
  JUDGE_REPORT_CHEATING = 'client:judge_report_cheating',
  JUDGE_WARN_PLAYER = 'client:judge_warn_player',
  JUDGE_DIRECT_RED_CARD = 'client:judge_direct_red_card',
  JUDGE_MUTE_ACTION = 'client:judge_mute_action',
  JUDGE_VOID_ROUND = 'client:judge_void_round',
  JUDGE_GRANT_EXTRA_TIME = 'client:judge_grant_extra_time',
  JUDGE_TERMINATE_MATCH = 'client:judge_terminate_match',
  JUDGE_SUB_SEAT = 'client:judge_sub_seat',
  VOICE_SIGNAL = 'client:voice_signal',
  VOICE_MUTE = 'client:voice_mute',
  APP_VISIBILITY_CHANGED = 'client:app_visibility_changed',
  REMATCH_REQUEST = 'client:rematch_request',
  QUICK_CHAT = 'client:quick_chat',
  EMOTE_REACTION = 'client:emote_reaction',
}

export enum ServerEvents {
  ROOM_SYNC = 'server:room_sync',
  ROOM_ERROR = 'server:room_error',
  GAME_STATE_SYNC = 'server:game_state_sync',
  GAME_STARTED = 'server:game_started',
  TILE_PLAYED = 'server:tile_played',
  TURN_CHANGED = 'server:turn_changed',
  PLAYER_PASSED = 'server:player_passed',
  ROUND_ENDED = 'server:round_ended',
  MATCH_ENDED = 'server:match_ended',
  MOVE_REJECTED = 'server:move_rejected',
  CHEATING_DECLARED = 'server:cheating_declared',
  BOT_MESSAGE = 'server:bot_message',
  NOTIFICATION = 'server:notification',
  REFEREE_DECISION_BROADCAST = 'server:referee_decision_broadcast',
  VOICE_SIGNAL = 'server:voice_signal',
  VOICE_PEERS_SYNC = 'server:voice_peers_sync',
  DISCONNECT_GRACE_UPDATE = 'server:disconnect_grace_update',
  ADMIN_TRANSFERRED = 'server:admin_transferred',
  STATS_UPDATED = 'server:stats_updated',
  REMATCH_STARTED = 'server:rematch_started',
  QUICK_CHAT_BROADCAST = 'server:quick_chat_broadcast',
  EMOTE_REACTION_BROADCAST = 'server:emote_reaction_broadcast',
}

// Client event payloads
export interface CreateRoomPayload {
  name: string;
  settings: Partial<RoomSettings>;
  user: {
    id: string;
    username: string;
    avatar: string;
  };
  initialRole?: UserRole;
}

export interface JoinRoomPayload {
  roomId: string;
  user: {
    id: string;
    username: string;
    avatar: string;
  };
}

export interface SelectSeatPayload {
  roomId: string;
  seat: PlayerSeat;
  user?: {
    id: string;
    username: string;
    avatar: string;
  };
}

export interface AdminMoveSeatPayload {
  roomId: string;
  fromSeat: PlayerSeat;
  toSeat: PlayerSeat;
}

export interface AdminUpdateSettingsPayload {
  roomId: string;
  settings: Partial<RoomSettings>;
}

export interface AdminToggleBotPayload {
  roomId: string;
  seat: PlayerSeat;
  enable: boolean;
  botId?: BotId;
}

export interface PlayTilePayload {
  roomId: string;
  tile: DominoTile;
  end?: ChainEnd;
  sequenceNumber?: number;
}

export interface PassTurnPayload {
  roomId: string;
  sequenceNumber?: number;
}

export interface JudgeReportCheatingPayload {
  roomId: string;
  offendingSeat: PlayerSeat;
  reason: string;
}

export interface VoiceSignalPayload {
  roomId: string;
  targetUserId: string;
  signal: any;
}

export interface VoiceMutePayload {
  roomId: string;
  isMuted: boolean;
}

export interface AppVisibilityChangedPayload {
  roomId: string;
  isVisible: boolean;
  hasWindowFocus: boolean;
}

export interface QuickChatPayload {
  roomId: string;
  messageId: string;
}

export interface EmoteReactionPayload {
  roomId: string;
  emoji: string;
}

// Server event payloads
export interface RoomSyncPayload {
  room: RoomDetails;
}

export interface GameStateSyncPayload {
  gameState: SanitizedGameState;
}

export interface MoveRejectedPayload {
  reason: string;
  tile?: DominoTile;
}

export interface CheatingDeclaredPayload {
  cheatingEvent: CheatingEvent;
  gameState: SanitizedGameState;
}

export interface NotificationPayload {
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  message: string;
  arabicMessage?: string;
  timestamp: number;
  userId?: string;
  username?: string;
  persistent?: boolean;
}

export interface QuickChatBroadcastPayload {
  userId: string;
  messageId: string;
  timestamp: number;
  senderName?: string;
  seat?: PlayerSeat | null;
}

export interface EmoteReactionBroadcastPayload {
  userId: string;
  emoji: string;
  timestamp: number;
  senderName?: string;
  seat?: PlayerSeat | null;
}

export type RefereeActionType =
  | 'YELLOW_CARD_1'
  | 'YELLOW_CARD_2_CHEATING'
  | 'DIRECT_RED_CARD'
  | 'MUTE_CHAT'
  | 'UNMUTE_CHAT'
  | 'MUTE_REACTIONS'
  | 'UNMUTE_REACTIONS'
  | 'MUTE_VOICE'
  | 'UNMUTE_VOICE'
  | 'VOID_ROUND'
  | 'GRANT_EXTRA_TIME'
  | 'TERMINATE_MATCH'
  | 'KICK_TO_SPECTATOR'
  | 'RETURN_FROM_SPECTATOR'
  | 'SUB_SPECTATOR_TO_SEAT';

export interface JudgeWarnPlayerPayload {
  roomId: string;
  seat: PlayerSeat;
  reason?: string;
}

export interface JudgeDirectRedCardPayload {
  roomId: string;
  seat: PlayerSeat;
  reason?: string;
}

export interface JudgeMuteActionPayload {
  roomId: string;
  targetType: 'SEAT' | 'SPECTATOR';
  seat?: PlayerSeat;
  userId?: string;
  muteType: 'CHAT' | 'REACTIONS' | 'VOICE';
  mute: boolean;
}

export interface JudgeVoidRoundPayload {
  roomId: string;
  reason?: string;
}

export interface JudgeGrantExtraTimePayload {
  roomId: string;
  seconds?: number; // default +20s
}

export interface JudgeTerminateMatchPayload {
  roomId: string;
  winnerTeam?: TeamId;
  reason?: string;
}

export interface JudgeSubSeatPayload {
  roomId: string;
  action: 'KICK_TO_SPECTATOR' | 'RETURN_FROM_SPECTATOR' | 'SUB_SPECTATOR_TO_SEAT';
  seat: PlayerSeat;
  spectatorUserId?: string;
  botId?: BotId;
}

export interface RefereeDecisionBroadcastPayload {
  actionType: RefereeActionType;
  judgeName: string;
  targetSeat?: PlayerSeat;
  targetPlayerName?: string;
  targetTeam?: TeamId;
  beneficiaryTeam?: TeamId;
  title: string;
  arabicMessage: string;
  reason?: string;
  timestamp: number;
}


