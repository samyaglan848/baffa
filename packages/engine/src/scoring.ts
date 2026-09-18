import {
  CheatingEvent,
  DominoTile,
  MatchResult,
  MatchTarget,
  PlayerSeat,
  RevealedHand,
  RoundResult,
  TeamId,
} from '@baffa/shared';
import { calculatePipSum, getTeamForSeat } from './rules';

export interface ScoreResolution {
  roundResult: RoundResult;
  isMatchFinished: boolean;
  matchResult: MatchResult | null;
}

/**
 * Calculates the score and round outcome when a player finishes all their tiles.
 */
export function resolveEmptyHandRound(
  finishingSeat: PlayerSeat,
  hands: DominoTile[][],
  roundNumber: number,
  starterSeat: PlayerSeat,
  currentTeam1Total: number,
  currentTeam2Total: number,
  targetScore: 101 | 151,
  matchId: string
): ScoreResolution {
  const winnerTeam = getTeamForSeat(finishingSeat);
  const losingTeam: TeamId = winnerTeam === 1 ? 2 : 1;

  // Calculate remaining pips for each team
  const team1Pips = calculatePipSum(hands[0]) + calculatePipSum(hands[2]);
  const team2Pips = calculatePipSum(hands[1]) + calculatePipSum(hands[3]);

  // Egyptian Domino scoring: Winning team receives the sum of the losing team's pips
  const roundScore = losingTeam === 1 ? team1Pips : team2Pips;

  const newTeam1Total = currentTeam1Total + (winnerTeam === 1 ? roundScore : 0);
  const newTeam2Total = currentTeam2Total + (winnerTeam === 2 ? roundScore : 0);

  const revealedHands: RevealedHand[] = hands.map((h, s) => ({
    seat: s as PlayerSeat,
    tiles: [...h],
    pips: calculatePipSum(h),
  }));

  const roundResult: RoundResult = {
    roundNumber,
    winnerTeam,
    roundScore,
    reason: 'EMPTY_HAND',
    finishingSeat,
    team1Pips,
    team2Pips,
    team1ScoreTotal: newTeam1Total,
    team2ScoreTotal: newTeam2Total,
    starterSeat,
    revealedHands,
  };

  const isMatchFinished =
    newTeam1Total >= targetScore || newTeam2Total >= targetScore;

  let matchResult: MatchResult | null = null;
  if (isMatchFinished) {
    const matchWinner: TeamId =
      newTeam1Total >= targetScore && newTeam1Total > newTeam2Total ? 1 : 2;

    matchResult = {
      matchId,
      winnerTeam: matchWinner,
      finalTeam1Score: newTeam1Total,
      finalTeam2Score: newTeam2Total,
      targetScore,
      roundsPlayed: roundNumber,
      finishedAt: Date.now(),
    };
  }

  return {
    roundResult,
    isMatchFinished,
    matchResult,
  };
}

/**
 * Calculates the score and round outcome when the game is locked/blocked (قفلة).
 */
export function resolveBlockedRound(
  hands: DominoTile[][],
  roundNumber: number,
  starterSeat: PlayerSeat,
  currentTeam1Total: number,
  currentTeam2Total: number,
  targetScore: 101 | 151,
  matchId: string
): ScoreResolution {
  const team1Pips = calculatePipSum(hands[0]) + calculatePipSum(hands[2]);
  const team2Pips = calculatePipSum(hands[1]) + calculatePipSum(hands[3]);

  let winnerTeam: TeamId;
  let roundScore = 0;

  if (team1Pips < team2Pips) {
    winnerTeam = 1;
    roundScore = team2Pips;
  } else if (team2Pips < team1Pips) {
    winnerTeam = 2;
    roundScore = team1Pips;
  } else {
    winnerTeam = 1;
    roundScore = 0;
  }

  const newTeam1Total = currentTeam1Total + (winnerTeam === 1 ? roundScore : 0);
  const newTeam2Total = currentTeam2Total + (winnerTeam === 2 ? roundScore : 0);

  const revealedHands: RevealedHand[] = hands.map((h, s) => ({
    seat: s as PlayerSeat,
    tiles: [...h],
    pips: calculatePipSum(h),
  }));

  const roundResult: RoundResult = {
    roundNumber,
    winnerTeam,
    roundScore,
    reason: 'BLOCKED',
    finishingSeat: null,
    team1Pips,
    team2Pips,
    team1ScoreTotal: newTeam1Total,
    team2ScoreTotal: newTeam2Total,
    starterSeat,
    revealedHands,
  };

  const isMatchFinished =
    newTeam1Total >= targetScore || newTeam2Total >= targetScore;

  let matchResult: MatchResult | null = null;
  if (isMatchFinished) {
    const matchWinner: TeamId =
      newTeam1Total >= targetScore && newTeam1Total > newTeam2Total ? 1 : 2;

    matchResult = {
      matchId,
      winnerTeam: matchWinner,
      finalTeam1Score: newTeam1Total,
      finalTeam2Score: newTeam2Total,
      targetScore,
      roundsPlayed: roundNumber,
      finishedAt: Date.now(),
    };
  }

  return {
    roundResult,
    isMatchFinished,
    matchResult,
  };
}

/**
 * Calculates the score and round outcome when a Judge declares a confirmed cheating penalty.
 * The round terminates immediately and the opposing team is awarded the offending team's remaining pips.
 */
export function resolveCheatingPenaltyRound(
  offendingSeat: PlayerSeat,
  judgeId: string,
  reason: string,
  hands: DominoTile[][],
  roundNumber: number,
  starterSeat: PlayerSeat,
  currentTeam1Total: number,
  currentTeam2Total: number,
  targetScore: 101 | 151,
  matchId: string
): ScoreResolution {
  const offendingTeam = getTeamForSeat(offendingSeat);
  const beneficiaryTeam: TeamId = offendingTeam === 1 ? 2 : 1;

  const team1Pips = calculatePipSum(hands[0]) + calculatePipSum(hands[2]);
  const team2Pips = calculatePipSum(hands[1]) + calculatePipSum(hands[3]);

  // Penalty score awarded to beneficiary team: sum of offending team's pips
  const roundScore = offendingTeam === 1 ? team1Pips : team2Pips;

  const newTeam1Total = currentTeam1Total + (beneficiaryTeam === 1 ? roundScore : 0);
  const newTeam2Total = currentTeam2Total + (beneficiaryTeam === 2 ? roundScore : 0);

  const cheatingEvent: CheatingEvent = {
    id: `cheat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    judgeId,
    offendingSeat,
    offendingTeam,
    beneficiaryTeam,
    penaltyScore: roundScore,
    timestamp: Date.now(),
    reason,
  };

  const revealedHands: RevealedHand[] = hands.map((h, s) => ({
    seat: s as PlayerSeat,
    tiles: [...h],
    pips: calculatePipSum(h),
  }));

  const roundResult: RoundResult = {
    roundNumber,
    winnerTeam: beneficiaryTeam,
    roundScore,
    reason: 'JUDGE_CHEATING_PENALTY',
    finishingSeat: null,
    team1Pips,
    team2Pips,
    team1ScoreTotal: newTeam1Total,
    team2ScoreTotal: newTeam2Total,
    starterSeat,
    cheatingDetails: cheatingEvent,
    revealedHands,
  };

  const isMatchFinished =
    newTeam1Total >= targetScore || newTeam2Total >= targetScore;

  let matchResult: MatchResult | null = null;
  if (isMatchFinished) {
    const matchWinner: TeamId =
      newTeam1Total >= targetScore && newTeam1Total > newTeam2Total ? 1 : 2;

    matchResult = {
      matchId,
      winnerTeam: matchWinner,
      finalTeam1Score: newTeam1Total,
      finalTeam2Score: newTeam2Total,
      targetScore,
      roundsPlayed: roundNumber,
      finishedAt: Date.now(),
    };
  }

  return {
    roundResult,
    isMatchFinished,
    matchResult,
  };
}
