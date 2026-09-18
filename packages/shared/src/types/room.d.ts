import { PlayerSeat, TeamId, MatchStatus } from './domino';
export interface RoomSettings {
    targetScore: 101 | 151;
    maxPlayers: 2 | 4;
    fillWithBots: boolean;
    roundTimerSeconds: number;
    isPrivate: boolean;
}
export interface RoomSeatInfo {
    seat: PlayerSeat;
    team: TeamId;
    occupied: boolean;
    playerId: string | null;
    username: string | null;
    avatar: string | null;
    isBot: boolean;
    isReady: boolean;
    isConnected: boolean;
}
export interface RoomDetails {
    id: string;
    code: string;
    name: string;
    ownerId: string;
    settings: RoomSettings;
    seats: RoomSeatInfo[];
    matchStatus: MatchStatus;
    createdAt: number;
}
