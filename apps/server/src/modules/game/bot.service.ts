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

export type BotChatTrigger = 'PASS' | 'PLAY' | 'ROUND_WIN' | 'ROUND_LOSS' | 'OPPONENT_PASS';

const GENERAL_FALLBACK_QUOTES: Record<BotChatTrigger, string[]> = {
  ROUND_WIN: [
    'إيه الشغل التعبان ده؟ روح نام يا بني 😂',
    'قولتلك بلاش تلعب مع المعلمين 😎',
    'ألف سلامة عليك يا خصمي، خدلك ليمون دافي 🍋😂',
    'ده لعب عيال يا جدعان، فين المنافسة؟ 🏆',
    'كسبناكم من غير ما نعرق حتى 🔥',
    'وسع للبطل.. رقم واحد في اللعبة دي 😎',
    'حاولت بس العين متعلاش عن الحاجب يا سيدي 😏',
  ],
  ROUND_LOSS: [
    'أنا بلعب مع فردة تعبانة وضيعتني يا زميلي! 🤦‍♂️',
    'عامل فيها حريف وجايبنا ورا يا عم فلان! 😂',
    'منك لله يا زميلي.. ده لعب ده؟ ضيعت مجهودي! 🤦‍♂️',
    'أنا شايل الماتش لوحدي وحضرتك نايم في العسل 😂',
    'يا ريتني كنت بلعب مع روبوت غسالة مش معاك 🤖😂',
    'هو أنت بتلعب معانا ولا مع الخصم يا نجم؟ 🤨',
    'ضيعت البونط بمزاجك يا زميلي.. عاش والله 👏😂',
  ],
  OPPONENT_PASS: [
    'عدّي يا معلم.. مالكش في اللعبة دي 😏',
    'زنقتك في زاوية ضيقة صح؟ فوت وانت ساكت 😂',
    'قول فوت بالراحة عشان صوتك ميعلاش 😂',
    'متفكرش كتير.. فوت يا كابتن ⏳',
    'الزنقة وحشة.. خليك قاعد اتفرج 😎',
    'الباب مقفول بالضبة والمفتاح، ريح شوية 🔒😏',
  ],
  PASS: [
    'فوت.. ما أنا بلعب مع فردة تعبانة مسوداها عليا! 🤦‍♂️',
    'أنا بفوت عشان زميلي مقفلها في وشي مش أكتر 😂',
    'فوت يا عم.. إيه الورق الناشف ده! 🎲',
    'هفوت الدور ده بس راجعلكم أظبطكم 😏',
    'اللعب ده عايز تركيز وزميلي باين عليه شرب شاي منوم 😂',
    'فوت.. بس افتكروا إني سايبكم تفرحوا شوية 😎',
  ],
  PLAY: [
    'خد دي وماتعيطش 🔥',
    'ركز يا بني بلاش سرحان 😎',
    'الدوش ده معمول للي يفهم فيه 🎲',
    'شايفك وأنت محتار يا خصمي 😂',
    'اللعب الحلو دايماً عند أصحابه 👌',
    'أتقل تاخد حاجة نضيفة 😎',
    'نازل بالثقيل أهو.. وريني هتعمل إيه 😏',
  ],
};

const BOT_QUOTES: Record<BotChatTrigger, Partial<Record<BotId, string[]>>> = {
  ROUND_WIN: {
    EL_SAMY: [
      'قولتلك بلاش تلعب مع المعلمين يا كابتن 😎',
      'إيه الشغل التعبان ده؟ روح نام يا بني 😂',
      'حاولت بس العين متعلاش عن الحاجب يا سيدي 😏',
      'كسبناكم من غير ما نعرق حتى 🔥',
    ],
    EL_RAYEQ: [
      'الدنيا رايقة والباكورة في الجيب ☕😎',
      'بالراحة على نفسك يا خصمي خدلك لمون دافي 🍋😂',
      'قولتلك من الأول مش قدنا بس مسمعتش الكلام ☕',
    ],
    RAQAM_WAHED: [
      'رقم واحد دايماً في مكانه.. وسع للبطل 👑',
      'ده لعب عيال يا جدعان، فين المنافسة الحقيقية؟ 🏆',
      'اللعبة دي في جيبي من أول دور قولتلك 😎',
    ],
    EL_TITO: [
      'ولعت يا رجالة وشيطناكم خلاص 🔥😂',
      'شيل يا معلم.. ألف سلامة عليك 💥',
      'مين اللي كان بيقول هيكسب؟ وريني نفسك كده 😂',
    ],
    EL_QETT: [
      'عضيتك من غير ما تحس يا مسكين 😼',
      'كنت مستنيك تلعب دي عشان أخلص عليك 😂',
      'الفار دخل المصيدة يا حلو 😼👌',
    ],
    EL_HEMA: [
      'الدومينو علم وأنت ساقط فيه بامتياز 🧠😂',
      'الحسابات عندي دقيقة بالمللي، مفيش هزار 📐😎',
      'دي مش محتاجة تفكير دي محتاجة معجزة عشان تكسبني 😂',
    ],
    EL_HOBA: [
      'أسرع مكسب في التاريخ ⚡.. هوبا وطارت 🚀',
      'ملحقتش تركز حتى ولقيت نفسك خسران 😂',
    ],
  },
  ROUND_LOSS: {
    EL_SAMY: [
      'أنا بلعب مع فردة تعبانة وضيعتني يا زميلي! 🤦‍♂️',
      'عامل فيها حريف وجايبنا ورا يا عم فلان! 😂',
      'منك لله يا زميلي.. ده لعب ده؟ ضيعت مجهودي! 🤦‍♂️',
      'يا ريتني كنت بلعب مع روبوت غسالة مش معاك 🤖😂',
    ],
    EL_RAYEQ: [
      'هو أنت بتلعب معانا ولا مع الخصم يا نجم؟ 🤨☕',
      'رايق بس زميلي ده هيجيبلي جلطة ببروده 😂',
      'ضيعت البونط بمزاجك يا زميلي.. عاش والله 👏😂',
    ],
    RAQAM_WAHED: [
      'أنا شايل الماتش لوحدي وحضرتك نايم في العسل! 🤦‍♂️',
      'العيب مش عليا.. العيب على اللي حطك معايا في تيم 👑😂',
      'لو كنت بلعب ضد نفسي كنت كسبت أسهل من كده! 😂',
    ],
    EL_TITO: [
      'إيه التوهان ده يا زميلي؟ سخنت على الفاضي! 🔥🤦‍♂️',
      'ضيعتنا يا كابتن بحركتك العبقرية دي 😂',
    ],
    EL_QETT: [
      'زميلي غفلني ودبسني في الحيطة 😼🤦‍♂️',
      'الخيانة جاية من التيم بتاعي مش من الخصم 😂',
    ],
    EL_HEMA: [
      'النظرية باظت بسبب العشوائية بتاعتك يا زميلي 🧠🤦‍♂️',
      'ده لعب ملوش أي علاقة بالمنطق نهائي! 😂',
    ],
    EL_HOBA: [
      'أنا طرت لوحدي وأنت وقفت الماتش في المطار ⚡🤦‍♂️',
      'إيه البطة اللي بلعب معاها دي 😂',
    ],
  },
  OPPONENT_PASS: {
    EL_SAMY: [
      'عدّي يا معلم.. مالكش في اللعبة دي 😏',
      'زنقتك في زاوية ضيقة صح؟ فوت وانت ساكت 😂',
      'قول فوت بالراحة عشان صوتك ميعلاش 😂',
      'الزنقة وحشة.. خليك قاعد اتفرج 😎',
    ],
    EL_RAYEQ: [
      'فوت براحتك يا باشا القهوة لسه سخنة ☕😂',
      'الباب مقفول بالضبة والمفتاح، ريح شوية 🔒😏',
    ],
    RAQAM_WAHED: [
      'متفكرش كتير.. فوت يا كابتن دي أصول اللعبة 👑',
      'قول فوت وأنت باصص في الأرض يا شاطر 😎',
    ],
    EL_TITO: [
      'زنقة الكلاب دي ولا إيه؟ فوت يلا 🔥😂',
      'شيط يا كابتن مالكش مخرج 💥',
    ],
    EL_QETT: [
      'اتزنقت في الخية بتاعتي يا ناصح 😼👌',
      'ملقتش كارت؟ يا عيني معلش 😂',
    ],
    EL_HEMA: [
      'مسألة رياضية مقفولة.. فوت بقانون الطبيعة 🧠😂',
      'مفيش احتمالات خلاص، الصفر مكتوبلك 📐',
    ],
    EL_HOBA: [
      'عطلتك في محطة القطر.. فوت بسرعة عدي غيرك ⚡😂',
      'زنقة سريعة متوجعش متقلقش 😂',
    ],
  },
  PASS: {
    EL_SAMY: [
      'فوت.. ما أنا بلعب مع فردة تعبانة مسوداها عليا! 🤦‍♂️',
      'أنا بفوت عشان زميلي مقفلها في وشي مش أكتر 😂',
      'فوت يا عم.. إيه الورق الناشف ده! 🎲',
      'هفوت الدور ده بس راجعلكم أظبطكم 😏',
    ],
    EL_RAYEQ: [
      'فوت بمزاجي.. بنريح ونشرب شاي ☕😎',
      'الدنيا فري، فوت الجولة دي ولنا عودة 😂',
    ],
    RAQAM_WAHED: [
      'فوت.. بس افتكروا إني سايبكم تفرحوا شوية 👑',
      'فوت مؤقت، الأسد بيريح بس مابيموتش 😎',
    ],
    EL_TITO: [
      'فوت يا حظ.. ورق ناشف زي الحجر 🎲🔥',
      'راجعلك الدور الجاي وهفرقعها في وشكم 💥',
    ],
    EL_QETT: [
      'فوت.. بس القط مش بيسيب حقه 😼',
      'كمين ده ولا ورق؟ فوت يا عم 😂',
    ],
    EL_HEMA: [
      'فوت.. حسابات الورق محتاجة إعادة صياغة 🧠',
      'الاحتمال الوحيد إني أفوت مؤقتاً 😂',
    ],
    EL_HOBA: [
      'فوت في ثانية.. مفيش وقت نضيعه ⚡',
      'فوت وهوبا في الجولة الجاية واكلكم 😂',
    ],
  },
  PLAY: {
    EL_SAMY: [
      'خد دي وماتعيطش 🔥',
      'ركز يا بني بلاش سرحان 😎',
      'الدوش ده معمول للي يفهم فيه 🎲',
      'شايفك وأنت محتار يا خصمي 😂',
      'اللعب الحلو دايماً عند أصحابه 👌',
      'أتقل تاخد حاجة نضيفة 😎',
    ],
    EL_RAYEQ: [
      'كلو رايق يا باشا.. العب بروقان ☕',
      'حبة حبة واللعب يحلى 😎',
      'رمية معلم في وقتها تمام 👌',
    ],
    RAQAM_WAHED: [
      'رقم واحد بيلعب وأنتوا تتفرجوا 👑',
      'أنا بنزل الكارت وبقفل الدور في دماغي خلاص 😎',
      'اللعب ده ليفل وحش متقارنش نفسك بيا 🏆',
    ],
    EL_TITO: [
      'نولعها بقى ولا إيه؟ خد دي 🔥',
      'الضربة القاضية في الطريق 💥',
    ],
    EL_QETT: [
      'ضربة تحت الحزام بمزاااج 😼👌',
      'فكر بقى هتعمل إيه بعد الكارت ده 😂',
    ],
    EL_HEMA: [
      'حركة محسوبة بدقة فيزيائية 🧠😎',
      'الورقة دي هتغير مجرى التاريخ في الماتش 😂',
    ],
    EL_HOBA: [
      'على السريع ومن غير تفكير.. هوبا ⚡',
      'السرعة في اللعب دي لعبتي 🚀',
    ],
  },
};

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
   * Generates playful Egyptian social banter with personality and context-aware triggers.
   */
  public generateSocialReaction(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    botId: BotId,
    trigger: BotChatTrigger
  ): BotChatMessage | undefined {
    const key = `${engine.getRoomId()}_${botId}`;
    const now = Date.now();
    const lastChat = this.lastChatTimestamps.get(key) || 0;

    // Cooldown based on trigger importance
    const cooldownMs = trigger === 'ROUND_WIN' || trigger === 'ROUND_LOSS' ? 3000 : 5000;
    if (now - lastChat < cooldownMs) {
      return undefined;
    }

    const profile = OFFICIAL_BAFFA_BOTS[botId];
    if (!profile) return undefined;

    // Trigger probability: High for critical events (win/loss/pass), moderate for casual plays
    const probability =
      trigger === 'ROUND_WIN' || trigger === 'ROUND_LOSS'
        ? 0.9
        : trigger === 'OPPONENT_PASS' || trigger === 'PASS'
        ? 0.8
        : 0.45;

    if (Math.random() > probability) {
      return undefined;
    }

    const botPool = BOT_QUOTES[trigger]?.[botId] || [];
    const fallbackPool = GENERAL_FALLBACK_QUOTES[trigger] || [];
    const combinedQuotes = botPool.length > 0 ? botPool : fallbackPool;

    if (combinedQuotes.length === 0) return undefined;

    const text = combinedQuotes[Math.floor(Math.random() * combinedQuotes.length)];
    this.lastChatTimestamps.set(key, now);

    return {
      botId,
      botName: profile.arabicName,
      seat,
      text,
      timestamp: now,
    };
  }
}
