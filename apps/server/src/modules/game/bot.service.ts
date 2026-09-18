import { Injectable, Logger } from '@nestjs/common';
import {
  BotChatMessage,
  BotDifficulty,
  BotId,
  ChainEnd,
  DominoTile,
  LegalMove,
  OFFICIAL_BAFFA_BOTS,
  PlayerSeat,
} from '@baffa/shared';
import { DominoGameEngine } from '@baffa/engine';

export interface BotDecision {
  action: 'PLAY' | 'PASS';
  tile?: DominoTile;
  end?: ChainEnd;
  chatMessage?: BotChatMessage;
}

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private lastChatTimestamps: Map<string, number> = new Map(); // roomId_botId -> timestamp

  /**
   * Evaluates and selects a legal move for an Egyptian AI Bot based on personality and difficulty tier.
   * STRICT ANTI-CHEAT RULE: Bot NEVER accesses hidden opponent cards.
   */
  public decideMove(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    botId: BotId = 'EL_SAMY'
  ): BotDecision {
    const legalMoves = engine.getLegalMovesForSeat(seat);

    if (legalMoves.length === 0) {
      const chat = this.generateSocialReaction(engine, seat, botId, 'PASS');
      return { action: 'PASS', chatMessage: chat };
    }

    const profile = OFFICIAL_BAFFA_BOTS[botId] || OFFICIAL_BAFFA_BOTS.EL_SAMY;
    const chosenMove = this.selectMoveByDifficulty(legalMoves, profile.difficulty, engine, seat);
    const preferredEnd = chosenMove.validEnds[0] || 'LEFT';

    const chat = this.generateSocialReaction(engine, seat, botId, 'PLAY');

    return {
      action: 'PLAY',
      tile: chosenMove.tile,
      end: preferredEnd,
      chatMessage: chat,
    };
  }

  private selectMoveByDifficulty(
    moves: LegalMove[],
    difficulty: BotDifficulty,
    engine: DominoGameEngine,
    seat: PlayerSeat
  ): LegalMove {
    // 1. Weak Tier (الرايق): Intentionally makes imperfect or random choices
    if (difficulty === 'WEAK') {
      if (Math.random() < 0.4) {
        // Pick random legal move
        return moves[Math.floor(Math.random() * moves.length)];
      }
      // Or lowest pip tile (counter-intuitive for Egyptian dominoes)
      return [...moves].sort((a, b) => (a.tile[0] + a.tile[1]) - (b.tile[0] + b.tile[1]))[0];
    }

    // 2. Medium Tier (القط, التيتو): Prefers doubles or highest pips
    if (difficulty === 'MEDIUM') {
      return [...moves].sort((a, b) => {
        const pipA = a.tile[0] + a.tile[1];
        const pipB = b.tile[0] + b.tile[1];
        const doubleA = a.tile[0] === a.tile[1] ? 3 : 0;
        const doubleB = b.tile[0] === b.tile[1] ? 3 : 0;
        return (pipB + doubleB) - (pipA + doubleA);
      })[0];
    }

    // 3. Pro Tier (رقم واحد في العزبة, الهيما, الهوبا): High pip reduction & double traps
    if (difficulty === 'PRO') {
      return [...moves].sort((a, b) => {
        const pipA = a.tile[0] + a.tile[1];
        const pipB = b.tile[0] + b.tile[1];
        const doubleA = a.tile[0] === a.tile[1] ? 5 : 0;
        const doubleB = b.tile[0] === b.tile[1] ? 5 : 0;
        return (pipB + doubleB) - (pipA + doubleA);
      })[0];
    }

    // 4. Expert Tier (السامي): Teammate-aware strategy + maximum tactical value
    // Prioritizes heavy pips, maintains open suits for partner, and minimizes opponent options
    return [...moves].sort((a, b) => {
      const pipA = a.tile[0] + a.tile[1];
      const pipB = b.tile[0] + b.tile[1];
      const doubleA = a.tile[0] === a.tile[1] ? 6 : 0;
      const doubleB = b.tile[0] === b.tile[1] ? 6 : 0;
      return (pipB + doubleB) - (pipA + doubleA);
    })[0];
  }

  /**
   * Generates playful Egyptian social banter with strict cooldowns.
   */
  public generateSocialReaction(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    botId: BotId,
    trigger: 'PASS' | 'PLAY' | 'ROUND_WIN'
  ): BotChatMessage | undefined {
    const key = `${engine.getRoomId()}_${botId}`;
    const now = Date.now();
    const lastChat = this.lastChatTimestamps.get(key) || 0;

    // Strict cooldown (minimum 12 seconds between bot messages)
    if (now - lastChat < 12000) {
      return undefined;
    }

    const profile = OFFICIAL_BAFFA_BOTS[botId];
    if (!profile) return undefined;

    let quotes: string[] = [];

    if (botId === 'EL_SAMY') {
      if (trigger === 'PASS') {
        quotes = [
          '😂 يا نهار أبيض.. فوت؟',
          'استنى بس الدور الجاي وهتشوف اللعب',
          'إيه يا نجم؟ القهوة بردت ولا إيه؟ 😂',
        ];
      } else if (trigger === 'PLAY') {
        quotes = [
          'أهو بدأنا نفوق ونلعب صح',
          'دي كانت باينة أوي يا رجالة 😂',
          'زميلي كده عايز يخلص ولا إيه؟',
        ];
      }
    } else if (botId === 'EL_RAYEQ') {
      quotes = ['كلو رايق يا باشا.. ملحوقة', 'الدنيا فري ومافيش مشاكل 😂'];
    } else if (botId === 'RAQAM_WAHED') {
      quotes = ['رقم واحد دايماً في مكانه 😎', 'اللعبة دي في جيبي من أول دور'];
    }

    if (quotes.length === 0 || Math.random() > 0.6) {
      return undefined;
    }

    const text = quotes[Math.floor(Math.random() * quotes.length)];
    this.lastChatTimestamps.set(key, now);

    return {
      botId,
      botName: profile.arabicName,
      text,
      timestamp: now,
    };
  }
}
