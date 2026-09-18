import { BotId } from './bot';

export type PipValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DominoTile = [PipValue, PipValue];

export type PlayerSeat = 0 | 1 | 2 | 3;

export type TeamId = 1 | 2;

export type ChainEnd = 'LEFT' | 'RIGHT';

export type MatchTarget = 101 | 151;

export interface BoardTilePlacement {
  tile: DominoTile;
  playedBySeat: PlayerSeat;
  end: ChainEnd | 'START';
  flipped: boolean;
  isDouble: boolean;
  order: number;
}

export interface DominoChainState {
  tiles: BoardTilePlacement[];
  leftEndValue: PipValue | null;
  rightEndValue: PipValue | null;
}

export type MatchStatus =
  | 'LOBBY'
  | 'READY'
  | 'STARTING'
  | 'DEALING'
  | 'PLAYING'
  | 'ROUND_FINISHED'
  | 'NEXT_ROUND'
  | 'MATCH_FINISHED'
  | 'PAUSED';

export type RoundEndReason = 'EMPTY_HAND' | 'BLOCKED' | 'JUDGE_CHEATING_PENALTY';

export interface CheatingEvent {
  id: string;
  judgeId: string;
  offendingSeat: PlayerSeat;
  offendingTeam: TeamId;
  beneficiaryTeam: TeamId;
  penaltyScore: number;
  timestamp: number;
  reason: string;
}

export interface RevealedHand {
  seat: PlayerSeat;
  tiles: DominoTile[];
  pips: number;
}

export interface RoundResult {
  roundNumber: number;
  winnerTeam: TeamId;
  roundScore: number;
  reason: RoundEndReason;
  finishingSeat: PlayerSeat | null;
  team1Pips: number;
  team2Pips: number;
  team1ScoreTotal: number;
  team2ScoreTotal: number;
  starterSeat: PlayerSeat;
  cheatingDetails?: CheatingEvent;
  revealedHands?: RevealedHand[];
}

export interface MatchResult {
  matchId: string;
  winnerTeam: TeamId;
  finalTeam1Score: number;
  finalTeam2Score: number;
  targetScore: number;
  roundsPlayed: number;
  finishedAt: number;
}

export interface LegalMove {
  tileIndex: number;
  tile: DominoTile;
  validEnds: ChainEnd[];
}

export interface SanitizedPlayerState {
  seat: PlayerSeat;
  team: TeamId;
  playerId: string;
  username: string;
  avatar: string;
  isBot: boolean;
  botId?: BotId;
  isConnected: boolean;
  isReady: boolean;
  hiddenTilesCount: number;
  lastAction?: 'PLAY' | 'PASS' | 'START';
  isTemporarilyBotControlled?: boolean;
  warnings?: number; // 0, 1, or 2
  isChatMuted?: boolean;
  isReactionsMuted?: boolean;
  isVoiceMuted?: boolean;
  originalPlayerId?: string | null;
}

export interface SanitizedGameState {
  matchId: string;
  roomId: string;
  status: MatchStatus;
  roundNumber: number;
  targetScore: number;
  team1Score: number;
  team2Score: number;
  currentTurnSeat: PlayerSeat;
  starterSeat: PlayerSeat;
  chain: DominoChainState;
  players: SanitizedPlayerState[];
  myHand: DominoTile[];
  mySeat: PlayerSeat | null;
  myRole: 'PLAYER' | 'ADMIN' | 'JUDGE' | 'SPECTATOR';
  myLegalMoves: LegalMove[];
  canPass: boolean;
  lastRoundResult: RoundResult | null;
  matchResult: MatchResult | null;
  consecutivePassCount: number;
  sequenceNumber: number;
  cheatingEvent: CheatingEvent | null;
  turnTimeLimit?: number;
  turnStartTime?: number;
}
