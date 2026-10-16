import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActionTelemetry {
  userId: string;
  roomId: string;
  action: string;
  clientSequence?: number;
  expectedSequence?: number;
  timestamp: number;
}

export interface SuspiciousActivityRecord {
  userId: string;
  roomId: string;
  riskScore: number;
  reasons: string[];
  lastObservedAt: number;
}

@Injectable()
export class AnticheatService {
  private readonly logger = new Logger(AnticheatService.name);
  private userRiskScores: Map<string, SuspiciousActivityRecord> = new Map();
  private lastActionTimes: Map<string, number> = new Map();

  constructor(private prisma: PrismaService) {}

  /**
   * Evaluates an incoming action using a cumulative Risk/Evidence Model.
   * Weak signals (such as fast latency <200ms) accumulate minor weight without automatic banning.
   */
  public evaluateAction(telemetry: ActionTelemetry): { isPermitted: boolean; warning?: string } {
    const key = `${telemetry.roomId}_${telemetry.userId}`;
    const now = Date.now();
    const lastTime = this.lastActionTimes.get(key) || 0;
    const deltaMs = now - lastTime;
    this.lastActionTimes.set(key, now);

    let riskRecord = this.userRiskScores.get(key);
    if (!riskRecord) {
      riskRecord = {
        userId: telemetry.userId,
        roomId: telemetry.roomId,
        riskScore: 0,
        reasons: [],
        lastObservedAt: now,
      };
      this.userRiskScores.set(key, riskRecord);
    }

    // 1. Weak Timing Signal: Fast move burst (<200ms)
    // Recorded as weak evidence only; never used for instant punishment.
    if (deltaMs > 0 && deltaMs < 200) {
      riskRecord.riskScore += 5;
      riskRecord.reasons.push(`Fast action latency (${deltaMs}ms)`);
      this.logger.debug(`Telemetry weak signal for user ${telemetry.userId}: ${deltaMs}ms action latency`);
    }

    // 2. Sequence verification: Stale or replayed sequence number
    if (
      telemetry.clientSequence !== undefined &&
      telemetry.expectedSequence !== undefined &&
      telemetry.clientSequence < telemetry.expectedSequence
    ) {
      // Recorded as evidence only. The engine itself rejects anything that is not a legal move for
      // the player whose turn it is, so a replayed/duplicated action can never apply twice.
      // Rejecting here used to drop perfectly legal moves whenever any unrelated state change
      // (a chat message, a player reconnecting, a judge warning) bumped the sequence number just
      // before the player clicked.
      riskRecord.riskScore += 1;
      riskRecord.reasons.push(`Stale sequence: received ${telemetry.clientSequence}, expected ${telemetry.expectedSequence}`);
    }
    if (riskRecord.reasons.length > 50) {
      riskRecord.reasons.splice(0, riskRecord.reasons.length - 50);
    }

    return { isPermitted: true };
  }

  /**
   * Records an immutable audit log entry.
   */
  public async logAudit(
    action: string,
    details: {
      userId?: string;
      roomId?: string;
      matchId?: string;
      metadata?: Record<string, any>;
      ipAddress?: string;
    }
  ) {
    if (!this.prisma.isAvailable) {
      // No database: keep a lightweight log line instead of attempting a DB connection per move.
      this.logger.debug(`[AUDIT] Action: ${action} | User: ${details.userId || 'system'} | Room: ${details.roomId || 'none'}`);
      return;
    }
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          userId: details.userId,
          roomId: details.roomId,
          matchId: details.matchId,
          metadata: details.metadata ? JSON.stringify(details.metadata) : null,
          ipAddress: details.ipAddress,
        },
      });
    } catch {
      // In-memory or database graceful fallback
      this.logger.debug(`[AUDIT] Action: ${action} | User: ${details.userId || 'system'} | Room: ${details.roomId || 'none'}`);
    }
  }

  /** Frees per-room telemetry when a room is closed (these maps previously grew forever). */
  public clearRoom(roomId: string): void {
    const prefix = `${roomId}_`;
    for (const k of this.userRiskScores.keys()) if (k.startsWith(prefix)) this.userRiskScores.delete(k);
    for (const k of this.lastActionTimes.keys()) if (k.startsWith(prefix)) this.lastActionTimes.delete(k);
  }

  public getRiskScore(roomId: string, userId: string): number {
    const key = `${roomId}_${userId}`;
    return this.userRiskScores.get(key)?.riskScore || 0;
  }
}
