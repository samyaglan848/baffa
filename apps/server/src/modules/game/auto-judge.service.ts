import { Injectable, Logger } from '@nestjs/common';
import { DominoTile, PlayerSeat } from '@baffa/shared';
import { DominoGameEngine } from '@baffa/engine';

export type AutoJudgeSeverity = 'WARNING' | 'CHEATING' | 'MATCH_TERMINATION';
export type AutoJudgeActionType = 'PLAY_TILE' | 'PASS_TURN' | 'TIMEOUT';

export interface AutoJudgeDecision {
  shouldAutoAct: boolean;
  severity: AutoJudgeSeverity;
  action: 'WARN_PLAYER' | 'CHEATING_PENALTY' | 'VOID_ROUND' | 'TERMINATE_MATCH' | 'NONE';
  reason: string;
  arabicMessage: string;
  isDecisionFinal: boolean;
}

export interface AutoJudgeInput {
  roomId: string;
  seat: PlayerSeat;
  engine: DominoGameEngine;
  actionType: AutoJudgeActionType;
  payload?: {
    tile?: DominoTile;
    reason?: string;
  };
  hasHumanJudge?: boolean;
}

@Injectable()
export class AutoJudgeService {
  private readonly logger = new Logger(AutoJudgeService.name);
  private readonly invalidActionCounts = new Map<string, number>();

  public evaluateAction(input: AutoJudgeInput): AutoJudgeDecision {
    const { roomId, seat, engine, actionType, payload, hasHumanJudge } = input;

    if (hasHumanJudge) {
      return {
        shouldAutoAct: false,
        severity: 'WARNING',
        action: 'NONE',
        reason: 'A human judge is present; server auto-judge is not required.',
        arabicMessage: 'الحكم البشري موجود، لا يلزم اتخاذ قرار تلقائي من السيرفر.',
        isDecisionFinal: false,
      };
    }

    const key = `${roomId}:${seat}:${actionType}`;
    const currentCount = this.invalidActionCounts.get(key) ?? 0;
    const legalMoves = engine.getLegalMovesForSeat(seat);

    let assessment: AutoJudgeDecision | null = null;

    if (actionType === 'PLAY_TILE') {
      const tile = payload?.tile;
      const tileIsKnown = Boolean(tile && Array.isArray(tile) && tile.length === 2);
      if (tile && tileIsKnown) {
        const tileIsIllegal = legalMoves.length > 0 && !legalMoves.some((move) => move.tile[0] === tile[0] && move.tile[1] === tile[1]);
        if (tileIsIllegal) {
          assessment = this.buildDecision(currentCount, 'PLAY_TILE', seat, 'Illegal play attempt. The tile is not legal for the current board state.');
        }
      }
    }

    if (actionType === 'PASS_TURN' && legalMoves.length > 0) {
      assessment = this.buildDecision(currentCount, 'PASS_TURN', seat, 'The player attempted to pass while legal tiles were still available.');
    }

    if (actionType === 'TIMEOUT' && legalMoves.length > 0) {
      assessment = this.buildDecision(currentCount, 'TIMEOUT', seat, 'Turn timeout occurred while the player still had valid legal moves.');
    }

    if (!assessment) {
      return {
        shouldAutoAct: false,
        severity: 'WARNING',
        action: 'NONE',
        reason: 'No automatic judge action required for this event.',
        arabicMessage: 'لا توجد مخالفة تستدعي تدخل الحكم التلقائي.',
        isDecisionFinal: false,
      };
    }

    const nextCount = currentCount + 1;
    this.invalidActionCounts.set(key, nextCount);
    this.logger.warn(`[AUTO_JUDGE] room=${roomId} seat=${seat} action=${actionType} severity=${assessment.severity} count=${nextCount}`);

    return assessment;
  }

  private buildDecision(
    currentCount: number,
    actionType: AutoJudgeActionType,
    seat: PlayerSeat,
    reason: string
  ): AutoJudgeDecision {
    const repeated = currentCount > 0;
    const severity: AutoJudgeSeverity = repeated ? 'CHEATING' : 'WARNING';

    const action: AutoJudgeDecision['action'] = repeated
      ? 'CHEATING_PENALTY'
      : 'WARN_PLAYER';

    return {
      shouldAutoAct: true,
      severity,
      action,
      reason: repeated
        ? `${reason} This is a repeat violation; the automatic judge escalates to a cheating penalty.`
        : `${reason} The automatic judge issues a warning first.`,
      arabicMessage: repeated
        ? `تم رصد مخالفة متكررة من المقعد ${Number(seat) + 1}. يحرك الحكم التلقائي عقوبة الغش فورياً.`
        : `تم رصد مخالفة من المقعد ${Number(seat) + 1}. الحكم التلقائي يصدر إنذاراً أولياً.`,
      isDecisionFinal: repeated,
    };
  }
}
