import { MatchTarget, PlayerSeat, RoundEndReason, TeamId } from './domino';
import { BotId } from './bot';

export interface MatchParticipantSummary {
  userId: string | null;
  username: string;
  avatar: string;
  seat: PlayerSeat;
  team: TeamId;
  isBot: boolean;
  botId?: BotId | null;
  pipsScored: number;
}

export interface RoundDetailItem {
  roundNumber: number;
  starterSeat: PlayerSeat;
  winningTeam: TeamId;
  roundScore: number;
  reason: RoundEndReason;
  team1Pips: number;
  team2Pips: number;
  cheatingReason?: string | null;
  createdAt: string;
}

export interface MatchHistoryItem {
  id: string;
  roomId?: string | null;
  targetScore: MatchTarget;
  winningTeam: TeamId;
  team1Score: number;
  team2Score: number;
  hasBots: boolean;
  roundsCount: number;
  participants: MatchParticipantSummary[];
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
}

export interface MatchDetailsResponse extends MatchHistoryItem {
  rounds: RoundDetailItem[];
}

export interface PaginatedMatchHistory {
  matches: MatchHistoryItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface HeadToHeadStats {
  user1: { id: string; username: string; avatar: string };
  user2: { id: string; username: string; avatar: string };
  totalMatches: number;
  user1Wins: number;
  user2Wins: number;
  user1WinRate: number;
  user2WinRate: number;
  totalRounds: number;
  user1RoundsWon: number;
  user2RoundsWon: number;
  lastMatches: MatchHistoryItem[];
}

export interface UserStatistics {
  userId: string;
  username: string;
  // Overall Competitive
  totalMatches: number;
  matchesWon: number;
  matchesLost: number;
  winRate: number;
  totalRounds: number;
  roundsWon: number;
  roundsLost: number;
  roundWinRate: number;
  totalPipsScored: number;
  // Streaks
  currentStreak: number;
  bestStreak: number;
  // Human vs Human Only
  humanMatchesWon: number;
  humanMatchesLost: number;
  humanWinRate: number;
  // Bot Matches Only
  botMatchesWon: number;
  botMatchesLost: number;
  botWinRate: number;
  // Performance
  averageMatchDurationSeconds: number;
  averageRoundsPerMatch: number;
}
