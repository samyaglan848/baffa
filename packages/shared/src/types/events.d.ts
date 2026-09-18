import { ChainEnd, DominoTile, PlayerSeat, SanitizedGameState } from './domino';
import { RoomDetails, RoomSettings } from './room';
export declare enum ClientEvents {
    JOIN_LOBBY = "client:join_lobby",
    LEAVE_LOBBY = "client:leave_lobby",
    CREATE_ROOM = "client:create_room",
    JOIN_ROOM = "client:join_room",
    LEAVE_ROOM = "client:leave_room",
    SELECT_SEAT = "client:select_seat",
    TOGGLE_READY = "client:toggle_ready",
    ADMIN_MOVE_SEAT = "client:admin_move_seat",
    ADMIN_UPDATE_SETTINGS = "client:admin_update_settings",
    ADMIN_KICK_PLAYER = "client:admin_kick_player",
    ADMIN_TOGGLE_BOT = "client:admin_toggle_bot",
    ADMIN_START_MATCH = "client:admin_start_match",
    PLAY_TILE = "client:play_tile",
    PASS_TURN = "client:pass_turn",
    REQUEST_NEXT_ROUND = "client:request_next_round"
}
export declare enum ServerEvents {
    ROOM_SYNC = "server:room_sync",
    ROOM_ERROR = "server:room_error",
    GAME_STATE_SYNC = "server:game_state_sync",
    GAME_STARTED = "server:game_started",
    TILE_PLAYED = "server:tile_played",
    TURN_CHANGED = "server:turn_changed",
    PLAYER_PASSED = "server:player_passed",
    ROUND_ENDED = "server:round_ended",
    MATCH_ENDED = "server:match_ended",
    MOVE_REJECTED = "server:move_rejected"
}
export interface CreateRoomPayload {
    name: string;
    settings: Partial<RoomSettings>;
    user: {
        id: string;
        username: string;
        avatar: string;
    };
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
}
export interface PlayTilePayload {
    roomId: string;
    tile: DominoTile;
    end?: ChainEnd;
}
export interface PassTurnPayload {
    roomId: string;
}
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
export interface ErrorNotificationPayload {
    message: string;
    code?: string;
}
