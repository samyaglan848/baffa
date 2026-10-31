/**
 * عقل البوتات الذكية (الهيما · الهوبا · رقم واحد في العذبة)
 * ----------------------------------------------------------------
 * نظام تفكير واحد مشترك بين التلاتة، والفرق بينهم في الكلام بس.
 *
 * STRICT ANTI-CHEAT: البوت مش بيشوف ورق حد غيره. كل اللي بيعرفه:
 *   - ورقه هو
 *   - اللي نزل على الأرض وبترتيبه (مين لعب إيه وعلى إيه)
 *   - مين فوّت وكانت الأرض عليها إيه (يبقى معاهوش الرقمين دول)
 *   - عدد الكروت اللي في إيد كل لاعب (معلومة ظاهرة للكل)
 * ومن دول بيحسب احتمال كل كارت مع مين.
 */

import { BoardTilePlacement, ChainEnd, DominoTile, LegalMove, PlayerSeat } from '@baffa/shared';
import { DominoGameEngine } from '@baffa/engine';

type Pip = number;

/** حدث "لعب" اتعاد بناؤه من الأرض */
interface PlayEvent {
  seat: PlayerSeat;
  tile: DominoTile;
  hit: Pip | null;     // الرقم اللي ضرب عليه (اللي كان على الأرض)
  opened: Pip;          // الرقم اللي فتحه (بقى على الأرض بعده)
  leftAfter: Pip;
  rightAfter: Pip;
}

/** اللي البوت فاكره عن كل لاعب */
interface SeatMemory {
  voids: Set<Pip>;          // أرقام فوّت عليها = معاهوش منها
  opened: number[];         // كام مرة فتح كل رقم
  hit: number[];            // كام مرة ضرب على كل رقم
  playedPips: number;
  playedCount: number;
}

export interface SmartDecision {
  move: LegalMove;
  end: ChainEnd;
  /** الحركة دي هتقفل اللعب */
  isLock: boolean;
  /** الحركة دي باب لزميله (الخصم اللي بعده هيفوت وزميله يلعب) */
  isDoorForPartner: boolean;
  /** زميله لسه لاعبله باب (الخصم اللي قبله فوّت والدور جاله) */
  partnerGaveDoor: boolean;
  /** اللعب الحالي أول لعبة في الجيم */
  isOpening: boolean;
}

export interface ScoredMove {
  score: number;
  move: LegalMove;
  end: ChainEnd;
  lock: boolean;
  door: boolean;
}

export interface SmartPassInfo {
  /** زميله غطّى الرقم اللي هو فاتحه وده اللي خلاه يفوت */
  partnerMistake: boolean;
}

const ALL_TILES: DominoTile[] = (() => {
  const t: DominoTile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) t.push([a, b] as DominoTile);
  return t;
})();

const key = (t: DominoTile): number => Math.min(t[0], t[1]) * 10 + Math.max(t[0], t[1]);
const has = (t: DominoTile, n: Pip): boolean => t[0] === n || t[1] === n;
const pips = (t: DominoTile): number => t[0] + t[1];
const isDouble = (t: DominoTile): boolean => t[0] === t[1];
const countWith = (hand: DominoTile[], n: Pip): number => hand.filter((t) => has(t, n)).length;
const nextSeat = (s: number, k = 1): PlayerSeat => ((s + k) % 4) as PlayerSeat;

export class SmartBotBrain {
  private readonly me: PlayerSeat;
  private readonly partner: PlayerSeat;
  private readonly oppNext: PlayerSeat;   // اللي ورايا (بيلعب بعدي على طول)
  private readonly oppPrev: PlayerSeat;   // اللي قبلي
  private readonly hand: DominoTile[];
  private readonly handSizes: number[];
  private readonly events: PlayEvent[] = [];
  private readonly memory: SeatMemory[];
  private readonly boardKeys = new Set<number>();
  private readonly unseen: DominoTile[];
  /** prob[seat][tileKey] = احتمال إن الكارت ده مع اللاعب ده */
  private readonly prob: Map<number, number>[] = [new Map(), new Map(), new Map(), new Map()];
  private readonly left: Pip | null;
  private readonly right: Pip | null;
  private readonly lastPlacementSeat: PlayerSeat | null;

  /** فردي: 1 ضد 1 وفيه كروت للسحب */
  private readonly solo: boolean;
  /** عدد الكروت اللي لسه في السحب (فردي بس) */
  private readonly pileSize: number;
  /** احتمال إن الكارت ده لسه في السحب */
  private readonly pileProb = new Map<number, number>();

  constructor(private readonly engine: DominoGameEngine, seat: PlayerSeat) {
    this.me = seat;
    this.solo = typeof engine.isSolo === 'function' && engine.isSolo();
    this.pileSize = this.solo && typeof engine.getBoneyardCount === 'function' ? engine.getBoneyardCount() : 0;
    if (this.solo) {
      // في الفردي مفيش زميل: الخصم هو اللي بعدي، والكرسيين التانيين فاضيين
      const other = (seat === 0 ? 1 : 0) as PlayerSeat;
      this.oppNext = other;
      this.partner = nextSeat(seat, 2);
      this.oppPrev = ([0, 1, 2, 3] as PlayerSeat[]).find((s) => s !== seat && s !== other && s !== this.partner)!;
    } else {
      this.partner = nextSeat(seat, 2);
      this.oppNext = nextSeat(seat, 1);
      this.oppPrev = nextSeat(seat, 3);
    }

    const raw = engine.getRawHands();
    this.hand = [...(raw[seat] || [])];
    // عدد الكروت بس (معلومة ظاهرة)، مش محتواها
    this.handSizes = [0, 1, 2, 3].map((s) => (raw[s] ? raw[s].length : 0));

    const chain = engine.getChain();
    this.left = chain.getLeftEnd();
    this.right = chain.getRightEnd();

    this.memory = [0, 1, 2, 3].map(() => ({
      voids: new Set<Pip>(),
      opened: [0, 0, 0, 0, 0, 0, 0],
      hit: [0, 0, 0, 0, 0, 0, 0],
      playedPips: 0,
      playedCount: 0,
    }));

    const placements = [...chain.getTiles()].sort((a, b) => a.order - b.order);
    this.lastPlacementSeat = placements.length ? placements[placements.length - 1].playedBySeat : null;
    this.rebuildHistory(placements);

    const mine = new Set(this.hand.map(key));
    this.unseen = ALL_TILES.filter((t) => !this.boardKeys.has(key(t)) && !mine.has(key(t)));
    this.computeProbabilities();
  }

  // ───────────────────────────── الذاكرة ─────────────────────────────

  /** بيعيد بناء الدور من الأرض: مين لعب إيه، على إيه، ومين فوّت على إيه */
  private rebuildHistory(placements: BoardTilePlacement[]): void {
    let L: Pip | null = null;
    let R: Pip | null = null;
    let prevSeat: PlayerSeat | null = null;

    const markPasses = (fromSeat: PlayerSeat, toSeat: PlayerSeat, l: Pip, r: Pip) => {
      let gap = (toSeat - fromSeat + 4) % 4;
      if (gap === 0) gap = 4;
      for (let k = 1; k < gap; k++) {
        const s = nextSeat(fromSeat, k);
        this.memory[s].voids.add(l);
        this.memory[s].voids.add(r);
      }
    };

    for (const p of placements) {
      const seat = p.playedBySeat;
      if (prevSeat !== null && L !== null && R !== null) markPasses(prevSeat, seat, L, R);

      let hit: Pip | null = null;
      let opened: Pip;
      if (p.end === 'START' || L === null || R === null) {
        L = p.tile[0];
        R = p.tile[1];
        opened = p.tile[0];
      } else if (p.end === 'LEFT') {
        hit = L;
        L = p.tile[0];
        opened = L;
      } else {
        hit = R;
        R = p.tile[1];
        opened = R;
      }

      const mem = this.memory[seat];
      if (hit !== null) mem.hit[hit]++;
      mem.opened[opened]++;
      if (p.end === 'START' && p.tile[0] !== p.tile[1]) mem.opened[p.tile[1]]++;
      mem.playedPips += pips(p.tile);
      mem.playedCount++;

      this.boardKeys.add(key(p.tile));
      this.events.push({ seat, tile: p.tile, hit, opened, leftAfter: L, rightAfter: R });
      prevSeat = seat;
    }

    // اللي فوّتوا من آخر لعبة لحد دوري
    if (prevSeat !== null && L !== null && R !== null && prevSeat !== this.me) {
      markPasses(prevSeat, this.me, L, R);
    }
  }

  /**
   * بيحسب احتمال كل كارت مخفي مع مين.
   * - فوّت على رقم ← صفر
   * - فتح رقم (خصوصًا لو كرره) ← احتمال أعلى إنه ماسك منه
   * - ضرب على رقم ← غالبًا معاهوش منه كتير
   * وبعدين بيظبط الاحتمالات على عدد الكروت اللي في إيد كل واحد.
   */
  private computeProbabilities(): void {
    const others = [this.oppNext, this.partner, this.oppPrev];
    for (const t of this.unseen) {
      for (const s of others) {
        const m = this.memory[s];
        let w = 1;
        if (this.handSizes[s] === 0 || m.voids.has(t[0]) || m.voids.has(t[1])) w = 0;
        else {
          const nums = isDouble(t) ? [t[0]] : [t[0], t[1]];
          for (const n of nums) {
            w *= 1 + 0.5 * Math.min(m.opened[n], 3);
            w *= Math.pow(0.6, Math.min(m.hit[n], 3));
          }
        }
        this.prob[s].set(key(t), w);
      }
      // السحب (فردي): أي كارت ممكن يكون فيه
      if (this.pileSize > 0) this.pileProb.set(key(t), 1);
    }

    // Iterative proportional fitting: كل كارت مجموعه 1، وكل لاعب مجموعه = عدد كروته (والسحب = عدده)
    for (let iter = 0; iter < 12; iter++) {
      for (const t of this.unseen) {
        const k = key(t);
        let sum = this.pileProb.get(k) || 0;
        for (const s of others) sum += this.prob[s].get(k) || 0;
        if (sum <= 0) {
          // معلومات متناقضة، نوزّع بالتساوي على اللي لسه معاهم كروت
          const alive = others.filter((s) => this.handSizes[s] > 0);
          for (const s of others) this.prob[s].set(k, alive.includes(s) ? 1 / alive.length : 0);
          continue;
        }
        for (const s of others) this.prob[s].set(k, (this.prob[s].get(k) || 0) / sum);
        if (this.pileSize > 0) this.pileProb.set(k, (this.pileProb.get(k) || 0) / sum);
      }
      if (this.pileSize > 0) {
        let pileSum = 0;
        for (const t of this.unseen) pileSum += this.pileProb.get(key(t)) || 0;
        if (pileSum > 0) {
          const f = this.pileSize / pileSum;
          for (const t of this.unseen) {
            const k = key(t);
            this.pileProb.set(k, Math.min(1, (this.pileProb.get(k) || 0) * f));
          }
        }
      }
      for (const s of others) {
        let rowSum = 0;
        for (const t of this.unseen) rowSum += this.prob[s].get(key(t)) || 0;
        if (rowSum <= 0) continue;
        const f = this.handSizes[s] / rowSum;
        for (const t of this.unseen) {
          const k = key(t);
          this.prob[s].set(k, Math.min(1, (this.prob[s].get(k) || 0) * f));
        }
      }
    }
  }

  private p(seat: PlayerSeat, t: DominoTile): number {
    return this.prob[seat].get(key(t)) || 0;
  }

  /** احتمال إن اللاعب ده يقدر يلعب على الطرفين دول */
  private canPlayProb(seat: PlayerSeat, l: Pip, r: Pip): number {
    if (this.handSizes[seat] === 0) return 0;
    let noTile = 1;
    for (const t of this.unseen) {
      if (has(t, l) || has(t, r)) noTile *= 1 - Math.min(0.999, this.p(seat, t));
    }
    return 1 - noTile;
  }

  private expectedPips(seat: PlayerSeat): number {
    let sum = 0;
    for (const t of this.unseen) sum += this.p(seat, t) * pips(t);
    return sum;
  }

  // ───────────────────────────── قراءة الورق ─────────────────────────────

  /** ورقه حلو؟ ← يلعب لنفسه. ورقه وحش (بفات كتير / ناقص أرقام) ← يلعب لزميله */
  private isStrongHand(): boolean {
    const doubles = this.hand.filter(isDouble).length;
    let maxSuit = 0;
    let distinct = 0;
    for (let n = 0; n <= 6; n++) {
      const c = countWith(this.hand, n);
      if (c > 0) distinct++;
      maxSuit = Math.max(maxSuit, c);
    }
    const sizeFactor = this.hand.length / 7; // كل ما الورق يقل المقاييس تقل
    return doubles <= 2 && (maxSuit >= Math.max(2, Math.round(4 * sizeFactor)) || distinct >= Math.max(3, Math.round(6 * sizeFactor)));
  }

  /** ورقه وحش: أكتر من بفتين، أو ناقص أرقام كتير */
  public isBadHand(): boolean {
    const doubles = this.hand.filter(isDouble).length;
    let distinct = 0;
    for (let n = 0; n <= 6; n++) if (countWith(this.hand, n) > 0) distinct++;
    return doubles > 2 || distinct <= 5;
  }

  /** دي أول مرة يلعب في الدور ده (لسه معاه السبع كروت) */
  public isFirstTurnOfRound(): boolean {
    return this.hand.length === 7;
  }

  /** هل الحركة دي هتقفل اللعب؟ (الطرفين نفس الرقم والسبع كروت بتوعه نزلوا) */
  private wouldLock(l: Pip, r: Pip, tile: DominoTile): boolean {
    if (l !== r) return false;
    let onBoard = 0;
    for (const t of ALL_TILES) {
      if (!has(t, l)) continue;
      if (this.boardKeys.has(key(t)) || key(t) === key(tile)) onBoard++;
    }
    return onBoard === 7;
  }

  /** في القفلة: فريقنا هيبقى معاه أقل من الخصوم؟ */
  private lockIsGoodForUs(after: DominoTile[]): boolean {
    const myPips = after.reduce((s, t) => s + pips(t), 0);
    const pm = this.memory[this.partner];
    let partnerFactor = 1;
    if (pm.playedCount > 0) {
      const avg = pm.playedPips / pm.playedCount;
      if (avg >= 8) partnerFactor = 1.15;      // بيلعب شيشات ← ورقه تقيل
      else if (avg <= 4) partnerFactor = 0.85; // بيلعب أبيضات ← ورقه خفيف
    }
    const ours = myPips + this.expectedPips(this.partner) * partnerFactor;
    const theirs = this.expectedPips(this.oppNext) + this.expectedPips(this.oppPrev);
    return ours + 2 < theirs;
  }

  // ───────────────────────────── القرار ─────────────────────────────

  public decide(moves: LegalMove[]): SmartDecision {
    const scored = this.scoreMoves(moves);
    let chosen = scored[0];
    for (const c of scored) if (c.score > chosen.score) chosen = c;
    return this.toDecision(chosen);
  }

  private toDecision(c: ScoredMove): SmartDecision {
    return {
      move: c.move,
      end: c.end,
      isLock: c.lock,
      isDoorForPartner: c.door,
      partnerGaveDoor: this.partnerJustGaveDoor(),
      isOpening: this.left === null || this.right === null,
    };
  }

  /** وصف لعبة اتاخدت بعقل تاني (قفلة؟ باب لزميله؟) علشان الكلام يبقى على حسب الموقف */
  public describe(move: LegalMove, end: ChainEnd): SmartDecision {
    const scored = this.scoreMoves([move]);
    const match = scored.find((c) => c.end === end) || scored[0];
    return this.toDecision(match);
  }

  /** تقييم كل لعبة ممكنة (على كل طرف) بالخبرة */
  public scoreMoves(moves: LegalMove[]): ScoredMove[] {
    const out: ScoredMove[] = [];
    const strong = this.isStrongHand();
    const empty = this.left === null || this.right === null;
    const partnerLast = this.handSizes[this.partner] === 1;
    const oppNextLast = this.handSizes[this.oppNext] === 1;
    const oppPrevLast = this.handSizes[this.oppPrev] === 1;
    const boardCount = this.boardKeys.size;

    for (const move of moves) {
      const tile = move.tile;
      const after = this.hand.filter((t) => key(t) !== key(tile));
      const ends: ChainEnd[] = move.validEnds.length ? move.validEnds : ['LEFT'];

      for (const end of ends) {
        let l: Pip;
        let r: Pip;
        let connected: Pip | null = null;
        if (empty) {
          l = tile[0];
          r = tile[1];
        } else {
          connected = end === 'LEFT' ? (this.left as Pip) : (this.right as Pip);
          const exposed = tile[0] === connected ? tile[1] : tile[0];
          l = end === 'LEFT' ? exposed : (this.left as Pip);
          r = end === 'RIGHT' ? exposed : (this.right as Pip);
        }

        let score = 0.25 * pips(tile); // خفّف التقيل من إيدك شوية

        // ─ مبيقطعش أرقامه: لو معاه كارت واحد بس من رقم بيتقل بيه
        if (!isDouble(tile)) {
          for (const n of [tile[0], tile[1]]) {
            if (n === connected) continue;
            if (countWith(this.hand, n) === 1) score -= 3.5;
          }
        }

        // ─ يقدر يكمل بعدها؟ (بيرمي من الرقم اللي معاه منه كتير)
        const follow = after.filter((t) => has(t, l) || has(t, r)).length;
        score += (strong ? 3 : 1.5) * Math.min(follow, 4);

        // ─ البفات: البفة مبتنزلش غير على رقمها، فلو رقمها مفتوح يرميها قبل ما تموت في إيده
        if (isDouble(tile) && !empty) {
          const d = tile[0];
          const outside = this.unseen.filter((t) => has(t, d)).length; // من رقمها لسه برة
          const mine = countWith(after, d); // معاه من رقمها غيرها
          score += 5;
          if (mine >= 1) score += 3; // يرمي البفة ويكمل بنفس الرقم بعدها
          if (outside <= 2) score += 6; // رقمها قرب يخلص
          if (after.length <= 3) score += 4; // آخر الدور
        }

        // ─ بداية الجيم: يبدأ بالبفة لو معاه من رقمها، ولو هي لوحدها يستنى بيها
        if (empty) {
          if (isDouble(tile)) {
            const same = countWith(after, tile[0]);
            score += same >= 2 ? 6 + tile[0] * 0.3 : same === 0 ? -8 : 0;
          } else {
            score += 1.5 * (countWith(after, tile[0]) + countWith(after, tile[1]));
          }
        }

        // ─ يمسك الباب: يعمل اتنين من رقمه على الأرض
        if (strong && l === r && countWith(after, l) >= 1) score += 5;

        // ─ الخصم اللي ورايا: نزنقه
        const pNext = this.canPlayProb(this.oppNext, l, r);
        score -= (strong ? 6 : 5) * pNext * (oppNextLast ? 2.5 : 1);

        // ─ زميلي: نفتحله لعبه
        const pPartner = this.canPlayProb(this.partner, l, r);
        score += (strong ? 3 : 8) * pPartner * (partnerLast ? 2.5 : 1);

        // ─ الخصم اللي قبلي (بيلعب بعد زميلي)
        const pPrev = this.canPlayProb(this.oppPrev, l, r);
        score -= 2 * pPrev * (oppPrevLast ? 2.5 : 1);

        // ─ يحافظ على الأرقام اللي زميله فاتحها
        const pm = this.memory[this.partner];
        const endVals = l === r ? [l] : [l, r];
        for (const v of endVals) score += (strong ? 1 : 3) * Math.min(pm.opened[v], 2);

        // ─ زميله ضرب على رقم ← يضرب هو كمان عليه
        if (!strong && connected !== null && pm.hit[connected] > 0) score += 2;

        // ─ القفلة: يقفل بس لو فريقنا هيبقى معاه أقل
        const lock = !empty && this.wouldLock(l, r, tile);
        if (lock) score += this.lockIsGoodForUs(after) ? 60 : -60;

        const door = !lock && !empty && pNext <= 0.25 && pPartner >= 0.5;

        out.push({ score, move, end, lock, door });
      }
    }
    return out;
  }


  // ═════════════════════ السامي: أسطورة الدومينو ═════════════════════
  /**
   * السامي بيعمل كل اللي فوق، وبيزود عليه إنه بيحسب لقدّام لحد آخر الدور:
   *  ١. بيتخيل توزيعات كتير لورق الباقيين، كلها متوافقة مع اللي شافه
   *     (مين فوّت على إيه، مين فتح إيه، مين ضرب على إيه، وعدد كروت كل واحد).
   *  ٢. لكل لعبة ممكنة، بيكمل الدور في دماغه لحد آخره في كل توزيع.
   *  ٣. بيختار اللعبة اللي بتجيب لفريقه أحسن نتيجة في المتوسط
   *     (سواء يقفّل هو، أو يضمن زميله، أو يكسب القفلة بالعدّة).
   */
  public decideLegend(moves: LegalMove[], timeBudgetMs = 60, maxSamplesCap = 150): SmartDecision {
    const scored = this.scoreMoves(moves);
    if (scored.length <= 1) return this.toDecision(scored[0]);

    const start = Date.now();
    const totals = new Array(scored.length).fill(0);
    let samples = 0;
    const maxSamples = maxSamplesCap;

    while (samples < maxSamples && (samples < 24 || Date.now() - start < timeBudgetMs)) {
      const world = this.sampleWorld();
      if (!world) break;
      for (let i = 0; i < scored.length; i++) {
        totals[i] += this.playout(world.hands, world.pile, scored[i].move.tile, scored[i].end);
      }
      samples++;
    }

    if (samples === 0) {
      let best = scored[0];
      for (const c of scored) if (c.score > best.score) best = c;
      return this.toDecision(best);
    }

    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < scored.length; i++) {
      // الحساب لقدّام هو الأساس، والخبرة بتفرق بين اللعبات المتقاربة
      const val = totals[i] / samples + 0.35 * scored[i].score;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    return this.toDecision(scored[bestIdx]);
  }

  /** بيوزّع الكروت المخفية على الباقيين توزيعة ممكنة (حسب الاحتمالات اللي حسبها) */
  private sampleWorld(): { hands: DominoTile[][]; pile: DominoTile[] } | null {
    const PILE = 4; // "مكان" السحب
    const others = [this.oppNext, this.partner, this.oppPrev];
    const holders = this.pileSize > 0 ? [...others, PILE] : others;
    for (let attempt = 0; attempt < 30; attempt++) {
      const respectVoids = attempt < 25;
      const useWeights = attempt < 15;
      const hands: DominoTile[][] = [[], [], [], [], []];
      hands[this.me] = [...this.hand];
      const cap = [0, 0, 0, 0, this.pileSize];
      for (const s of others) cap[s] = this.handSizes[s];

      // الكروت الأصعب (اللي ليها أماكن أقل) الأول
      const tiles = [...this.unseen].sort(() => Math.random() - 0.5);
      tiles.sort((a, b) => this.allowedCount(a, respectVoids) - this.allowedCount(b, respectVoids));

      let ok = true;
      for (const t of tiles) {
        const cands = holders.filter(
          (s) =>
            cap[s] > 0 &&
            (s === PILE || !respectVoids || (!this.memory[s].voids.has(t[0]) && !this.memory[s].voids.has(t[1])))
        );
        if (cands.length === 0) {
          ok = false;
          break;
        }
        let pick = cands[0];
        if (cands.length > 1) {
          const ws = cands.map(
            (s) =>
              (useWeights ? Math.max(0.02, s === PILE ? this.pileProb.get(key(t)) || 0 : this.p(s as PlayerSeat, t)) : 1) * cap[s]
          );
          const sum = ws.reduce((a, b) => a + b, 0);
          let r = Math.random() * sum;
          for (let i = 0; i < cands.length; i++) {
            r -= ws[i];
            if (r <= 0) {
              pick = cands[i];
              break;
            }
          }
        }
        hands[pick].push(t);
        cap[pick]--;
      }
      if (ok) {
        const pile = hands[PILE].sort(() => Math.random() - 0.5);
        return { hands: hands.slice(0, 4), pile };
      }
    }
    return null;
  }

  private allowedCount(t: DominoTile, respectVoids: boolean): number {
    let n = 0;
    for (const s of [this.oppNext, this.partner, this.oppPrev]) {
      if (this.handSizes[s] === 0) continue;
      if (respectVoids && (this.memory[s].voids.has(t[0]) || this.memory[s].voids.has(t[1]))) continue;
      n++;
    }
    return n;
  }

  /**
   * بيكمل الدور في دماغه لحد آخره، وكل اللاعبين بيلعبوا لعب كويس.
   * النتيجة = النقط اللي فريقنا هياخدها (موجب) أو هيدّيها (سالب).
   */
  private playout(world: DominoTile[][], worldPile: DominoTile[], firstTile: DominoTile, firstEnd: ChainEnd): number {
    const hands = world.map((h) => [...h]);
    const pile = [...worldPile];
    const solo = this.solo;
    const nextOf = (s: number) => (solo ? (s === 0 ? 1 : 0) : (s + 1) % 4);
    const fitsEnds = (x: DominoTile) => has(x, L as Pip) || has(x, R as Pip);
    let L = this.left;
    let R = this.right;
    const myTeam = this.me % 2;

    const place = (seat: number, t: DominoTile, end: ChainEnd) => {
      const idx = hands[seat].findIndex((x) => key(x) === key(t));
      if (idx >= 0) hands[seat].splice(idx, 1);
      if (L === null || R === null) {
        L = t[0];
        R = t[1];
      } else if (end === 'LEFT') {
        L = t[0] === L ? t[1] : t[0];
      } else {
        R = t[0] === R ? t[1] : t[0];
      }
    };

    place(this.me, firstTile, firstEnd);
    let seat = nextOf(this.me);
    let passes = 0;

    const finish = (winnerTeam: number, points: number) => (winnerTeam === myTeam ? points : -points);
    const teamPips = (team: number) =>
      hands[team].reduce((a, t) => a + pips(t), 0) + hands[team + 2].reduce((a, t) => a + pips(t), 0);

    if (hands[this.me].length === 0) return finish(myTeam, teamPips(1 - myTeam));

    for (let step = 0; step < 120; step++) {
      const h = hands[seat];
      // فردي: اللي معاهوش لعب بيسحب لحد ما يلاقي (إلا لو الأرض مقفولة)
      if (solo && pile.length > 0 && !h.some(fitsEnds)) {
        const anyFit = pile.some(fitsEnds) || hands.some((hh) => hh.some(fitsEnds));
        while (anyFit && pile.length > 0 && !h.some(fitsEnds)) h.push(pile.pop()!);
      }
      let bestT: DominoTile | null = null;
      let bestE: ChainEnd = 'LEFT';
      let bestS = -Infinity;
      for (const t of h) {
        const ends: ChainEnd[] = [];
        if (has(t, L as Pip)) ends.push('LEFT');
        if (has(t, R as Pip) && !(L === R && ends.length)) ends.push('RIGHT');
        for (const e of ends) {
          const nl = e === 'LEFT' ? (t[0] === L ? t[1] : t[0]) : (L as Pip);
          const nr = e === 'RIGHT' ? (t[0] === R ? t[1] : t[0]) : (R as Pip);
          const nextH = hands[nextOf(seat)];
          const partH = solo ? [] : hands[(seat + 2) % 4];
          let sc = 0.3 * pips(t) + Math.random() * 1.2;
          sc += 1.5 * h.filter((x) => x !== t && (has(x, nl) || has(x, nr))).length;
          if (nextH.some((x) => has(x, nl) || has(x, nr))) sc -= 4;
          if (partH.some((x) => has(x, nl) || has(x, nr))) sc += 3;
          if (isDouble(t)) sc += 3;
          if (sc > bestS) {
            bestS = sc;
            bestT = t;
            bestE = e;
          }
        }
      }

      if (bestT) {
        place(seat, bestT, bestE);
        passes = 0;
        if (hands[seat].length === 0) {
          const team = seat % 2;
          return finish(team, teamPips(1 - team));
        }
      } else {
        passes++;
        if (passes >= (solo ? 2 : 4)) {
          // قفلة: الفريق اللي معاه أقل يكسب نقط التاني
          const p0 = teamPips(0);
          const p1 = teamPips(1);
          if (p0 < p1) return finish(0, p1);
          if (p1 < p0) return finish(1, p0);
          return finish(0, 0);
        }
      }
      seat = nextOf(seat);
    }
    return 0;
  }

  /** زميله لعب والخصم اللي بعده فوّت ← الدور جالي على طول: ده باب منه */
  private partnerJustGaveDoor(): boolean {
    return this.lastPlacementSeat === this.partner;
  }

  /** لما البوت يفوت: هل زميله هو السبب؟ (غطّى الرقم اللي أنا فاتحه) */
  public passInfo(): SmartPassInfo {
    let myLastOpened: Pip | null = null;
    let myLastIndex = -1;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].seat === this.me) {
        myLastOpened = this.events[i].opened;
        myLastIndex = i;
        break;
      }
    }
    if (myLastOpened === null) return { partnerMistake: false };

    for (let i = this.events.length - 1; i > myLastIndex; i--) {
      const ev = this.events[i];
      if (ev.seat === this.partner && ev.hit === myLastOpened) {
        // زميله غطّى رقمي، وكان لسه فيه طرف عليه نفس الرقم؟ لأ ← قطعه عليا
        const stillOpen = ev.leftAfter === myLastOpened || ev.rightAfter === myLastOpened;
        return { partnerMistake: !stillOpen };
      }
    }
    return { partnerMistake: false };
  }
}

// ═══════════════════════════════════════════════════════════════════
// عقل البوتات البسيطة: الرايق · التيتو · القط
// مبيفكروش كتير: كل اللي يعرفوه ورقهم هم وأول رقم فتحه زميلهم.
//  - بيعرف إمتى يمسك لعب ومبينقصش كروته
//  - بيلعب علشان ميفوتش كتير
//  - لو زميله فتح أول لعبة برقم (مثلًا شيش) بيلعبله الرقم ده لو يقدر
//  - القفلة فاهمها نص فهم: بيبص على ورقه هو بس
// ═══════════════════════════════════════════════════════════════════
export interface SimpleDecision {
  move: LegalMove;
  end: ChainEnd;
}

export class SimpleBotBrain {
  private readonly hand: DominoTile[];
  private readonly left: Pip | null;
  private readonly right: Pip | null;
  private readonly partnerFirstOpen: Pip | null;
  private readonly boardKeys = new Set<number>();

  constructor(engine: DominoGameEngine, seat: PlayerSeat) {
    this.hand = [...(engine.getRawHands()[seat] || [])];
    const chain = engine.getChain();
    this.left = chain.getLeftEnd();
    this.right = chain.getRightEnd();

    const partner = nextSeat(seat, 2);
    const placements = [...chain.getTiles()].sort((a, b) => a.order - b.order);
    let L: Pip | null = null;
    let R: Pip | null = null;
    let firstOpen: Pip | null = null;
    for (const p of placements) {
      this.boardKeys.add(key(p.tile));
      let opened: Pip;
      if (p.end === 'START' || L === null || R === null) {
        L = p.tile[0];
        R = p.tile[1];
        opened = p.tile[0];
      } else if (p.end === 'LEFT') {
        L = p.tile[0];
        opened = L;
      } else {
        R = p.tile[1];
        opened = R;
      }
      if (firstOpen === null && p.playedBySeat === partner) firstOpen = opened;
    }
    this.partnerFirstOpen = firstOpen;
  }

  public decide(moves: LegalMove[]): SimpleDecision {
    const empty = this.left === null || this.right === null;
    const myPipsTotal = this.hand.reduce((a, t) => a + pips(t), 0);
    let best: { s: number; move: LegalMove; end: ChainEnd } | null = null;

    for (const move of moves) {
      const tile = move.tile;
      const after = this.hand.filter((t) => key(t) !== key(tile));
      const ends: ChainEnd[] = move.validEnds.length ? move.validEnds : ['LEFT'];
      for (const end of ends) {
        let l: Pip;
        let r: Pip;
        let connected: Pip | null = null;
        if (empty) {
          l = tile[0];
          r = tile[1];
        } else {
          connected = end === 'LEFT' ? (this.left as Pip) : (this.right as Pip);
          const exposed = tile[0] === connected ? tile[1] : tile[0];
          l = end === 'LEFT' ? exposed : (this.left as Pip);
          r = end === 'RIGHT' ? exposed : (this.right as Pip);
        }

        // شوية عشوائية: مش بيفكر كتير
        let s = Math.random() * 2.5 + 0.2 * pips(tile);

        // ميفوتش كتير: يسيب الأرض على أرقام معاه منها
        const follow = after.filter((t) => has(t, l) || has(t, r)).length;
        s += 2.5 * Math.min(follow, 4);

        // مبينقصش كروته
        if (!isDouble(tile)) {
          for (const n of [tile[0], tile[1]]) {
            if (n === connected) continue;
            if (countWith(this.hand, n) === 1) s -= 3;
          }
        }

        // البفة: لو رقمها مفتوح يرميها، وخصوصًا لو رقمها قرب يخلص أو الدور قرب يخلص
        if (isDouble(tile) && !empty) {
          const leftOfSuit = ALL_TILES.filter((t) => has(t, tile[0]) && !this.boardKeys.has(key(t))).length;
          s += 4;
          if (leftOfSuit <= 3 || after.length <= 3) s += 4;
        }

        // زميله فتح أول لعبة برقم ← يلعبله نفس الرقم
        if (this.partnerFirstOpen !== null && (l === this.partnerFirstOpen || r === this.partnerFirstOpen)) s += 4;

        // القفلة: نص فهم، بيبص على ورقه هو بس
        if (!empty && l === r) {
          let onBoard = 0;
          for (const t of ALL_TILES) if (has(t, l) && (this.boardKeys.has(key(t)) || key(t) === key(tile))) onBoard++;
          if (onBoard === 7) {
            const mine = myPipsTotal - pips(tile);
            if (mine <= 10) s += 15;
            else if (mine >= 20) s -= 15;
          }
        }

        if (!best || s > best.s) best = { s, move, end };
      }
    }
    return { move: best!.move, end: best!.end };
  }
}
