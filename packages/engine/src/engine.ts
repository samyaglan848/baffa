import {
  BoardTilePlacement,
  BotId,
  ChainEnd,
  CheatingEvent,
  DominoTile,
  LegalMove,
  MatchResult,
  MatchStatus,
  PlayerSeat,
  RoundResult,
  SanitizedGameState,
  SanitizedPlayerState,
  TeamId,
  UserRole,
} from '@baffa/shared';
import { DominoChainManager } from './chain';
import { dealHands, generateDeck, shuffleDeck } from './deck';
import {
  areTilesEqual,
  determineStartingSeat,
  getLegalMovesForHand,
  getNextSeat,
  getTeamForSeat,
} from './rules';
import {
  resolveBlockedRound,
  resolveCheatingPenaltyRound,
  resolveEmptyHandRound,
} from './scoring';

export interface GameEngineOptions {
  matchId: string;
  roomId: string;
  targetScore?: 101 | 151;
  turnTimeLimit?: number;
  players: {
    seat: PlayerSeat;
    playerId: string;
    username: string;
    avatar: string;
    isBot: boolean;
    botId?: BotId;
    isConnected: boolean;
    isReady: boolean;
  }[];
  rng?: () => number;
}

export class DominoGameEngine {
  private matchId: string;
  private roomId: string;
  private status: MatchStatus = 'LOBBY';
  private targetScore: 101 | 151 = 101;
  private turnTimeLimit = 20;
  private turnStartTime = Date.now();
  private roundNumber = 0;
  private team1Score = 0;
  private team2Score = 0;
  private currentTurnSeat: PlayerSeat = 0;
  private starterSeat: PlayerSeat = 0;
  private chain: DominoChainManager;
  private hands: DominoTile[][] = [[], [], [], []];
  private players: SanitizedPlayerState[] = [];
  private consecutivePassCount = 0;
  private lastRoundResult: RoundResult | null = null;
  private matchResult: MatchResult | null = null;
  private cheatingEvent: CheatingEvent | null = null;
  private sequenceNumber = 0;
  private rng: () => number;
  private playerWarnings = new Map<PlayerSeat, number>();

  constructor(options: GameEngineOptions) {
    this.matchId = options.matchId;
    this.roomId = options.roomId;
    this.targetScore = options.targetScore || 101;
    this.turnTimeLimit = options.turnTimeLimit || 20;
    this.turnStartTime = Date.now();
    this.chain = new DominoChainManager();
    this.rng = options.rng || Math.random;

    ([0, 1, 2, 3] as PlayerSeat[]).forEach((s) => this.playerWarnings.set(s, 0));

    this.players = options.players.map((p) => ({
      seat: p.seat,
      team: getTeamForSeat(p.seat),
      playerId: p.playerId,
      username: p.username,
      avatar: p.avatar,
      isBot: p.isBot,
      botId: p.botId,
      isConnected: p.isConnected,
      isReady: p.isReady,
      hiddenTilesCount: 0,
      isTemporarilyBotControlled: false,
      warnings: 0,
      isChatMuted: false,
      isReactionsMuted: false,
      isVoiceMuted: false,
    }));
  }

  public getMatchId(): string {
    return this.matchId;
  }

  public getRoomId(): string {
    return this.roomId;
  }

  public getStatus(): MatchStatus {
    return this.status;
  }

  public getTargetScore(): 101 | 151 {
    return this.targetScore;
  }

  public getRoundNumber(): number {
    return this.roundNumber;
  }

  public getCurrentTurnSeat(): PlayerSeat {
    return this.currentTurnSeat;
  }

  public getTeamScores(): { team1: number; team2: number } {
    return { team1: this.team1Score, team2: this.team2Score };
  }

  public getChain(): DominoChainManager {
    return this.chain;
  }

  public getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  public getRawHands(): DominoTile[][] {
    return this.hands.map((h) => [...h]);
  }

  /**
   * Toggles bot takeover on a seat when a player disconnects or reconnects.
   * STRICT CONSTRAINT: Does NOT mutate, reset, or alter the player's private tiles array.
   */
  public setBotTakeover(seat: PlayerSeat, active: boolean): void {
    if (this.players[seat]) {
      this.players[seat].isTemporarilyBotControlled = active;
      this.sequenceNumber++;
    }
  }

  /**
   * Starts a new match and deals the first round.
   */
  public startMatch(): void {
    if (this.status !== 'LOBBY' && this.status !== 'READY') {
      throw new Error(`Cannot start match in status: ${this.status}`);
    }

    this.roundNumber = 0;
    this.team1Score = 0;
    this.team2Score = 0;
    this.matchResult = null;
    this.lastRoundResult = null;
    this.cheatingEvent = null;
    this.sequenceNumber = 1;
    this.playerWarnings.clear();
    ([0, 1, 2, 3] as PlayerSeat[]).forEach((s) => this.playerWarnings.set(s, 0));
    this.players.forEach((p) => {
      p.warnings = 0;
    });

    this.dealRound();
  }

  /**
   * Deals tiles and starts the next round.
   */
  public dealRound(): void {
    this.roundNumber++;
    this.status = 'DEALING';
    this.chain.reset();
    this.consecutivePassCount = 0;
    this.cheatingEvent = null;
    this.sequenceNumber++;

    // Reset player disciplinary warnings for the fresh round so penalised players start clean
    this.playerWarnings.clear();
    ([0, 1, 2, 3] as PlayerSeat[]).forEach((s) => this.playerWarnings.set(s, 0));
    this.players.forEach((p) => {
      p.warnings = 0;
    });

    // Generate, shuffle, and deal full 28 tiles
    const deck = generateDeck();
    const shuffled = shuffleDeck(deck, this.rng);
    const dealtHands = dealHands(shuffled);

    this.hands = dealtHands;

    // Update player hidden tile counts
    this.players.forEach((p) => {
      p.hiddenTilesCount = this.hands[p.seat].length;
      delete p.lastAction;
    });

    // Determine starter
    const prevWinnerSeat = this.lastRoundResult?.finishingSeat ?? null;
    this.starterSeat = determineStartingSeat(
      this.hands,
      this.roundNumber,
      prevWinnerSeat
    );
    this.currentTurnSeat = this.starterSeat;
    this.turnStartTime = Date.now();

    this.status = 'PLAYING';
  }

  /**
   * Evaluates legal moves for a specific seat.
   */
  public getLegalMovesForSeat(seat: PlayerSeat): LegalMove[] {
    if (this.status !== 'PLAYING') {
      return [];
    }
    const hand = this.hands[seat] || [];
    return getLegalMovesForHand(hand, this.chain, this.roundNumber);
  }

  /**
   * Plays a tile from the player's private hand onto the board chain.
   */
  public playTile(
    seat: PlayerSeat,
    tile: DominoTile,
    preferredEnd?: ChainEnd
  ): {
    success: boolean;
    error?: string;
    placement?: BoardTilePlacement;
    roundResult?: RoundResult;
    matchResult?: MatchResult;
  } {
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
      return { success: false, error: 'Invalid seat index: seat must be between 0 and 3' };
    }

    if (
      !tile ||
      !Array.isArray(tile) ||
      tile.length !== 2 ||
      typeof tile[0] !== 'number' ||
      typeof tile[1] !== 'number' ||
      tile[0] < 0 ||
      tile[0] > 6 ||
      tile[1] < 0 ||
      tile[1] > 6
    ) {
      return { success: false, error: 'Malformed or invalid domino tile provided' };
    }

    if (this.status !== 'PLAYING') {
      return { success: false, error: `Cannot play tile: Match status is ${this.status}` };
    }

    if (seat !== this.currentTurnSeat) {
      return {
        success: false,
        error: `Not your turn. Current turn belongs to Seat ${this.currentTurnSeat}`,
      };
    }

    const hand = this.hands[seat];
    const tileIndex = hand.findIndex((t) => areTilesEqual(t, tile));
    if (tileIndex === -1) {
      return {
        success: false,
        error: `Tile [${tile[0]}|${tile[1]}] is not present in player's hand`,
      };
    }

    const actualTile = hand[tileIndex];
    const validEnds = this.chain.getValidEnds(actualTile);

    if (this.chain.isEmpty()) {
      if (this.roundNumber === 1 && (actualTile[0] !== 6 || actualTile[1] !== 6)) {
        return {
          success: false,
          error: 'Round 1 opening move MUST be 6|6',
        };
      }
    } else {
      if (validEnds.length === 0) {
        return {
          success: false,
          error: `Tile [${actualTile[0]}|${actualTile[1]}] cannot be connected to open ends (${this.chain.getLeftEnd()}|${this.chain.getRightEnd()})`,
        };
      }
    }

    let targetEnd: ChainEnd;
    if (this.chain.isEmpty()) {
      targetEnd = 'LEFT';
    } else if (preferredEnd && validEnds.includes(preferredEnd)) {
      targetEnd = preferredEnd;
    } else {
      targetEnd = validEnds[0];
    }

    const placement = this.chain.placeTile(actualTile, seat, targetEnd);
    hand.splice(tileIndex, 1);
    this.players[seat].hiddenTilesCount = hand.length;
    this.players[seat].lastAction = 'PLAY';
    this.consecutivePassCount = 0;
    this.sequenceNumber++;

    // Check Round Win (Empty Hand)
    if (hand.length === 0) {
      const resolution = resolveEmptyHandRound(
        seat,
        this.hands,
        this.roundNumber,
        this.starterSeat,
        this.team1Score,
        this.team2Score,
        this.targetScore,
        this.matchId
      );

      this.lastRoundResult = resolution.roundResult;
      this.team1Score = resolution.roundResult.team1ScoreTotal;
      this.team2Score = resolution.roundResult.team2ScoreTotal;

      if (resolution.isMatchFinished && resolution.matchResult) {
        this.status = 'MATCH_FINISHED';
        this.matchResult = resolution.matchResult;
        return {
          success: true,
          placement,
          roundResult: resolution.roundResult,
          matchResult: resolution.matchResult,
        };
      } else {
        this.status = 'ROUND_FINISHED';
        return {
          success: true,
          placement,
          roundResult: resolution.roundResult,
        };
      }
    }

    // Advance Turn Counter-Clockwise
    this.currentTurnSeat = getNextSeat(this.currentTurnSeat);
    this.turnStartTime = Date.now();

    return {
      success: true,
      placement,
    };
  }

  /**
   * Passes the player's turn ("فوت" / "عدي").
   */
  public passTurn(seat: PlayerSeat): {
    success: boolean;
    error?: string;
    isBlocked?: boolean;
    roundResult?: RoundResult;
    matchResult?: MatchResult;
  } {
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
      return { success: false, error: 'Invalid seat index: seat must be between 0 and 3' };
    }

    if (this.status !== 'PLAYING') {
      return { success: false, error: `Cannot pass: Match status is ${this.status}` };
    }

    if (seat !== this.currentTurnSeat) {
      return {
        success: false,
        error: `Not your turn. Current turn belongs to Seat ${this.currentTurnSeat}`,
      };
    }

    const legalMoves = this.getLegalMovesForSeat(seat);
    if (legalMoves.length > 0) {
      return {
        success: false,
        error: 'Cannot pass: You have legal moves available in your hand',
      };
    }

    this.players[seat].lastAction = 'PASS';
    this.consecutivePassCount++;
    this.sequenceNumber++;

    if (this.consecutivePassCount >= 4) {
      const resolution = resolveBlockedRound(
        this.hands,
        this.roundNumber,
        this.starterSeat,
        this.team1Score,
        this.team2Score,
        this.targetScore,
        this.matchId
      );

      this.lastRoundResult = resolution.roundResult;
      this.team1Score = resolution.roundResult.team1ScoreTotal;
      this.team2Score = resolution.roundResult.team2ScoreTotal;

      if (resolution.isMatchFinished && resolution.matchResult) {
        this.status = 'MATCH_FINISHED';
        this.matchResult = resolution.matchResult;
        return {
          success: true,
          isBlocked: true,
          roundResult: resolution.roundResult,
          matchResult: resolution.matchResult,
        };
      } else {
        this.status = 'ROUND_FINISHED';
        return {
          success: true,
          isBlocked: true,
          roundResult: resolution.roundResult,
        };
      }
    }

    this.currentTurnSeat = getNextSeat(this.currentTurnSeat);
    this.turnStartTime = Date.now();

    return {
      success: true,
      isBlocked: false,
    };
  }

  /**
   * Penalizes cheating declared by an authorized Judge.
   * Terminates the round and awards penalty score to the opposing team.
   */
  public penalizeCheating(
    judgeId: string,
    offendingSeat: PlayerSeat,
    reason: string
  ): {
    success: boolean;
    error?: string;
    roundResult?: RoundResult;
    matchResult?: MatchResult;
  } {
    if (!Number.isInteger(offendingSeat) || offendingSeat < 0 || offendingSeat > 3) {
      return { success: false, error: 'Invalid offending seat index: seat must be between 0 and 3' };
    }

    if (this.status !== 'PLAYING') {
      return { success: false, error: 'Cannot penalize cheating: Game is not in PLAYING state' };
    }

    const resolution = resolveCheatingPenaltyRound(
      offendingSeat,
      judgeId,
      reason,
      this.hands,
      this.roundNumber,
      this.starterSeat,
      this.team1Score,
      this.team2Score,
      this.targetScore,
      this.matchId
    );

    this.lastRoundResult = resolution.roundResult;
    this.cheatingEvent = resolution.roundResult.cheatingDetails || null;
    this.team1Score = resolution.roundResult.team1ScoreTotal;
    this.team2Score = resolution.roundResult.team2ScoreTotal;
    this.sequenceNumber++;

    if (resolution.isMatchFinished && resolution.matchResult) {
      this.status = 'MATCH_FINISHED';
      this.matchResult = resolution.matchResult;
      return {
        success: true,
        roundResult: resolution.roundResult,
        matchResult: resolution.matchResult,
      };
    } else {
      this.status = 'ROUND_FINISHED';
      return {
        success: true,
        roundResult: resolution.roundResult,
      };
    }
  }

  /**
   * Advances to next round.
   */
  public nextRound(): { success: boolean; error?: string } {
    if (this.status !== 'ROUND_FINISHED') {
      return {
        success: false,
        error: `Cannot advance to next round from status: ${this.status}`,
      };
    }

    this.dealRound();
    return { success: true };
  }

  /**
   * Judge issues a yellow card warning to a player.
   * Warning 1: Warning alert broadcast.
   * Warning 2: Automatic cheating forfeiture of the round with full scoring penalty to opposing team.
   */
  public warnPlayer(
    judgeId: string,
    seat: PlayerSeat,
    reason: string = 'مخالفة أو اشتباه في الغش'
  ): {
    success: boolean;
    warningCount: number;
    isCheatingTriggered: boolean;
    error?: string;
    roundResult?: RoundResult;
    matchResult?: MatchResult;
  } {
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
      return { success: false, warningCount: 0, isCheatingTriggered: false, error: 'مقعد غير صالح' };
    }

    const current = this.playerWarnings.get(seat) || 0;
    const newCount = current + 1;
    this.playerWarnings.set(seat, newCount);
    if (this.players[seat]) {
      this.players[seat].warnings = newCount;
    }
    this.sequenceNumber++;

    if (newCount >= 2) {
      const cheatingRes = this.penalizeCheating(
        judgeId,
        seat,
        `إنذار ثانٍ: تم احتساب حالة غش وإنهاء الجولة (${reason})`
      );
      return {
        success: true,
        warningCount: newCount,
        isCheatingTriggered: true,
        roundResult: cheatingRes.roundResult,
        matchResult: cheatingRes.matchResult,
      };
    }

    return {
      success: true,
      warningCount: newCount,
      isCheatingTriggered: false,
    };
  }

  /**
   * Judge issues a direct red card to a player for clear cheating.
   * Immediately terminates the round and awards round score to opposing team.
   */
  public directRedCard(
    judgeId: string,
    seat: PlayerSeat,
    reason: string = 'كارت أحمر مباشر لاحتساب حالة غش صريحة'
  ): {
    success: boolean;
    error?: string;
    roundResult?: RoundResult;
    matchResult?: MatchResult;
  } {
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
      return { success: false, error: 'مقعد غير صالح' };
    }

    this.playerWarnings.set(seat, 2);
    if (this.players[seat]) {
      this.players[seat].warnings = 2;
    }
    return this.penalizeCheating(judgeId, seat, reason);
  }

  /**
   * Judge voids current round and redeals it without altering total scores.
   */
  public voidCurrentRound(): { success: boolean; error?: string } {
    if (this.status !== 'PLAYING') {
      return { success: false, error: 'لا يمكن إلغاء الجولة في غير حالة اللعب' };
    }

    this.chain.reset();
    this.consecutivePassCount = 0;
    this.cheatingEvent = null;
    this.sequenceNumber++;

    this.playerWarnings.clear();
    ([0, 1, 2, 3] as PlayerSeat[]).forEach((s) => this.playerWarnings.set(s, 0));
    this.players.forEach((p) => {
      p.warnings = 0;
    });

    const deck = generateDeck();
    const shuffled = shuffleDeck(deck, this.rng);
    this.hands = dealHands(shuffled);

    this.players.forEach((p) => {
      p.hiddenTilesCount = this.hands[p.seat].length;
      delete p.lastAction;
    });

    const prevWinnerSeat = this.lastRoundResult?.finishingSeat ?? null;
    this.starterSeat = determineStartingSeat(
      this.hands,
      this.roundNumber,
      prevWinnerSeat
    );
    this.currentTurnSeat = this.starterSeat;
    this.turnStartTime = Date.now();
    this.status = 'PLAYING';

    return { success: true };
  }

  /**
   * Resets warnings for a specific player or all players.
   */
  public clearWarnings(seat?: PlayerSeat): void {
    if (seat !== undefined) {
      this.playerWarnings.set(seat, 0);
      if (this.players[seat]) {
        this.players[seat].warnings = 0;
      }
    } else {
      this.playerWarnings.clear();
      ([0, 1, 2, 3] as PlayerSeat[]).forEach((s) => this.playerWarnings.set(s, 0));
      this.players.forEach((p) => {
        p.warnings = 0;
      });
    }
    this.sequenceNumber++;
  }

  /**
   * Judge grants extra thinking time (+20s) to the active turn.
   */
  public grantExtraTime(extraSeconds: number = 20): { success: boolean; error?: string } {
    if (this.status !== 'PLAYING') {
      return { success: false, error: 'اللعبة ليست جارية حالياً' };
    }
    this.turnStartTime += extraSeconds * 1000;
    this.sequenceNumber++;
    return { success: true };
  }

  /**
   * Judge terminates the match directly and declares a winner.
   */
  public terminateMatch(
    winnerTeam?: TeamId,
    reason: string = 'إنهاء المباراة بقرار إداري من الحكم'
  ): { success: boolean; matchResult?: MatchResult } {
    if (this.status === 'MATCH_FINISHED') {
      return { success: false };
    }

    const determinedWinner: TeamId =
      winnerTeam || (this.team1Score >= this.team2Score ? 1 : 2);

    this.status = 'MATCH_FINISHED';
    this.matchResult = {
      matchId: this.matchId,
      winnerTeam: determinedWinner,
      finalTeam1Score: this.team1Score,
      finalTeam2Score: this.team2Score,
      targetScore: this.targetScore,
      roundsPlayed: this.roundNumber,
      finishedAt: Date.now(),
    };
    this.sequenceNumber++;

    return {
      success: true,
      matchResult: this.matchResult,
    };
  }

  /**
   * Set mute status on a player seat for chat, reactions, or voice.
   */
  public setPlayerMute(
    seat: PlayerSeat,
    muteType: 'CHAT' | 'REACTIONS' | 'VOICE',
    isMuted: boolean
  ): void {
    if (this.players[seat]) {
      if (muteType === 'CHAT') this.players[seat].isChatMuted = isMuted;
      if (muteType === 'REACTIONS') this.players[seat].isReactionsMuted = isMuted;
      if (muteType === 'VOICE') this.players[seat].isVoiceMuted = isMuted;
      this.sequenceNumber++;
    }
  }

  /**
   * Updates player seat metadata (used when subbing players or bots).
   */
  public updateSeatPlayer(seat: PlayerSeat, updates: Partial<SanitizedPlayerState>): void {
    if (this.players[seat]) {
      this.players[seat] = {
        ...this.players[seat],
        ...updates,
      };
      this.sequenceNumber++;
    }
  }

  /**
   * Generates a safe, sanitized game state for a specific client.
   * STRICT ANTI-CHEAT & INFORMATION ISOLATION:
   * - If role is 'JUDGE' or 'SPECTATOR' or seat is null: returns empty hand, zero secret information.
   * - If role is 'PLAYER' and seat is valid: returns only that seat's private hand tiles.
   */
  public getSanitizedState(
    forSeat: PlayerSeat | null,
    role: UserRole = 'PLAYER'
  ): SanitizedGameState {
    // Both PLAYER and ADMIN can play the game if they are seated
    const isPlayer = (role === 'PLAYER' || role === 'ADMIN') && forSeat !== null;

    const myHand: DominoTile[] =
      isPlayer && this.hands[forSeat] ? [...this.hands[forSeat]] : [];

    const myLegalMoves: LegalMove[] =
      isPlayer && forSeat === this.currentTurnSeat && this.status === 'PLAYING'
        ? this.getLegalMovesForSeat(forSeat)
        : [];

    const canPass =
      isPlayer &&
      forSeat === this.currentTurnSeat &&
      this.status === 'PLAYING' &&
      myLegalMoves.length === 0;

    return {
      matchId: this.matchId,
      roomId: this.roomId,
      status: this.status,
      roundNumber: this.roundNumber,
      targetScore: this.targetScore,
      team1Score: this.team1Score,
      team2Score: this.team2Score,
      currentTurnSeat: this.currentTurnSeat,
      starterSeat: this.starterSeat,
      chain: this.chain.getState(),
      players: this.players.map((p) => ({
        ...p,
        warnings: this.playerWarnings.get(p.seat) ?? p.warnings ?? 0,
      })),
      myHand,
      mySeat: isPlayer ? forSeat : null,
      myRole: role,
      myLegalMoves,
      canPass,
      lastRoundResult: this.lastRoundResult,
      matchResult: this.matchResult,
      consecutivePassCount: this.consecutivePassCount,
      sequenceNumber: this.sequenceNumber,
      cheatingEvent: this.cheatingEvent,
      turnTimeLimit: this.turnTimeLimit,
      turnStartTime: this.turnStartTime,
    };
  }
}
