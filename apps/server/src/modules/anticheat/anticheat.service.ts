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
      riskRecord.riskScore += 10;
      riskRecord.reasons.push(`Stale sequence: received ${telemetry.clientSequence}, expected ${telemetry.expectedSequence}`);
      return { isPermitted: false, warning: 'Stale action sequence rejected' };
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
      this.logger.log(`[AUDIT] Action: ${action} | User: ${details.userId || 'system'} | Room: ${details.roomId || 'none'}`);
    }
  }

  public getRiskScore(roomId: string, userId: string): number {
    const key = `${roomId}_${userId}`;
    return this.userRiskScores.get(key)?.riskScore || 0;
  }
}
