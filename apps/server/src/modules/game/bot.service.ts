import { Injectable, Logger } from '@nestjs/common';
import {
  BotChatMessage,
  BotChatTrigger,
  BotDifficulty,
  BotId,
  BotReactionContext,
  ChainEnd,
  DominoTile,
  LegalMove,
  OFFICIAL_BAFFA_BOTS,
  PlayerSeat,
} from '@baffa/shared';
import { DominoGameEngine } from '@baffa/engine';
import { SimpleBotBrain, SmartBotBrain, SmartDecision } from './smart-bot-brain';

export interface BotDecision {
  action: 'PLAY' | 'PASS';
  tile?: DominoTile;
  end?: ChainEnd;
  chatMessage?: BotChatMessage;
}

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
  ROUND_WIN_HIGH_POINTS: [
    'بونط تقيل يشيل اللي ما يشتال يا مساكين 😂🔥',
    'فوز عريض يرجعكم تلعبوا كوتشينة أحسن 😎',
    'سكور تاريخي.. اتعلموا اللعب بقى 👑🏆',
    'النتيجة كبرت أوي عليكم يا رجالة 🔥👌',
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
  GAME_LOCKED: [
    'سدّة وقفلناها.. عد ورقك وركز في النقط يا كابتن 🔒😎',
    'القفلة دي معمولة بمعلمة.. مين معاه بونط؟ 🎲',
    'قفلنا السكة بالضبة والمفتاح، عدوا على مهلكم 🔒😂',
    'سدّة نااار ومين اللي هيشيل؟ 💥',
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
  PLAY_DOUBLE: [
    'بلاطة تسد عين الشمس في وقتها تمام 😎🔥',
    'البلاطة دي معمولة للي يقدرها 👌🎲',
    'خد البلاطة دي وركز في اللي جاي 😏',
    'بلاطة في الجون ومحدش هيلحقها 💥',
  ],
  OPENING_66: [
    'الدوش ستات بيفتح الماتش للكبار بس 🔥',
    'أول خطوة في طريق البونط.. دوش يا معلم 😎',
    'الدوش نزل والماتش ولع من أولها 🎲💥',
  ],
  MATCH_WIN: [
    'الماتش خلص والحريف بان.. ألف مبروك لينا وهاردلك ليكم 🏆👑',
    'كده خلصنا الحساب وقفلنا الدكانة، روحوا استريحوا بقى 😎🔥',
  ],
  MATCH_LOSS: [
    'الماتش راح في داهية بسبب التكتيك العبقري بتاع زميلي 🤦‍♂️😂',
    'خيرها في غيرها.. بس محتاجين نغير الفريق كله بصراحة 💔😂',
  ],
  PARTNER_CHEER: [
    'عاش يا زميلي والله، رمية معلم 👌🔥',
    'هو ده اللعب الصح يا شريكي، كمل على كده 😎',
  ],
};

const BOT_QUOTES: Partial<Record<BotChatTrigger, Partial<Record<BotId, string[]>>>> = {
  ROUND_WIN: {
    EL_RAYEQ: [
      'الدنيا رايقة والباكورة في الجيب ☕😎',
      'بالراحة على نفسك يا خصمي.. خدلك لمون دافي 🍋😂',
      'قولتلك من الأول مش قدنا بس مسمعتش الكلام ☕',
      'كسبنا بروقان ومن غير ما نعرق حتى ☕👌',
    ],
    EL_QETT: [
      'عضيتك من غير ما تحس يا مسكين 😼',
      'كنت مستنيك تلعب دي عشان أخلص عليك 😂',
      'الفار دخل المصيدة يا حلو.. ألف سلامة 😼👌',
      'المخالب نزلت في وقتها والجولة طارت 😼💥',
    ],
    EL_TITO: [
      'ولعت يا رجالة وشيطناكم خلاص! 🔥😂',
      'شيل يا معلم.. مفيش رحمة في اللعبة دي 💥🔥',
      'مين اللي كان بيقول هيكسب؟ وريني نفسك كده 😂🔥',
      'ضربة قاضية في الجون وبونط مولع 🔥🏆',
    ],
    RAQAM_WAHED: [
      'رقم واحد دايماً في مكانه.. وسع للبطل 👑',
      'ده لعب عيال يا جدعان، فين المنافسة الحقيقية؟ 🏆',
      'اللعبة دي في جيبي من أول دور قولتلك 😎👑',
      'الأستاذ أستاذ والتلاميذ يتعلموا 👑👌',
    ],
    EL_HEMA: [
      'الدومينو علم وأنت ساقط فيه بامتياز 🧠😂',
      'الحسابات عندي دقيقة بالمللي، مفيش هزار 📐😎',
      'المعادلة قفلت والنتيجة كانت محسومة رياضياً 🧠',
      'احتمال فوزك كان 0% من البداية أصلاً 📐',
    ],
    EL_HOBA: [
      'أسرع مكسب في التاريخ ⚡.. هوبا وطارت 🚀',
      'ملحقتش تركز حتى ولقيت نفسك خسران 😂⚡',
      'سرعة الصاروخ متسيبش وراها أثر 🚀😎',
      'هوبا وجت في المقص.. عدي غيرك بقى ⚡',
    ],
    EL_SAMY: [
      'قولتلك بلاش تلعب مع المعلمين يا كابتن 😎',
      'حاولت بس العين متعلاش عن الحاجب يا سيدي 😏',
      'الرمية دي متطلعش إلا من معلم عتيق 👌☕',
      'الدومينو أصول مش فهلوة.. شيل بقى بروقان 🎲👑',
    ],
  },

  ROUND_WIN_HIGH_POINTS: {
    EL_RAYEQ: [
      'بونط كبير ورايق زي ما الكتاب بيقول ☕😎',
      'شيل النقط دي ومعاها فنجان شاي بالنعناع ☕👌',
    ],
    EL_QETT: [
      'عضة بونط كبير مش هتنسوها طول الماتش 😼🔥',
      'النقط دي وجعتكم صح؟ القط مش بيرحم 😼',
    ],
    EL_TITO: [
      'شيل يا وحش.. بونط تقيل يشيط اللي ما يشتال! 🔥💥',
      'فرقعنا السكور في وشكم.. ولعت ناار 🔥😂',
    ],
    RAQAM_WAHED: [
      'سكور تاريخي من رقم واحد.. اتعلموا بقى 👑🏆',
      'ضربة موجعة ورقم واحد بيعلم عليكم بالثقيل 👑',
    ],
    EL_HEMA: [
      'الفرق الرقمي في البونط ده غير قابل للتعويض إحصائياً 🧠😎',
      'منحنى النقط انحدر في اتجاهكم بطريقة كارثية 📐😂',
    ],
    EL_HOBA: [
      'هوبا وطيرنا بالبونط في السحاب.. طلقة ⚡🚀',
      'سكور صاروخي في ثانية.. هوبا يا رجالة ⚡🔥',
    ],
    EL_SAMY: [
      'بونط تقيل يشيل اللي ما يشتال يا مساكين 😂🔥',
      'فوز عريض يرجعكم تلعبوا كوتشينة أحسن 😎🎲',
    ],
  },

  ROUND_LOSS: {
    EL_RAYEQ: [
      'هو أنت بتلعب معانا ولا مع الخصم يا نجم؟ 🤨☕',
      'رايق بس زميلي ده هيجيبلي جلطة ببروده 😂',
      'ضيعت البونط بمزاجك يا زميلي.. عاش والله 👏☕',
    ],
    EL_QETT: [
      'زميلي غفلني ودبسني في الحيطة 😼🤦‍♂️',
      'الخيانة جاية من التيم بتاعي مش من الخصم 😂😼',
      'الكمين باظ بسبب اللعب العشوائي ده 😼',
    ],
    EL_TITO: [
      'إيه التوهان ده يا زميلي؟ سخنت على الفاضي! 🔥🤦‍♂️',
      'ضيعتنا يا كابتن بحركتك العبقرية دي! هديت المعبد 🔥😂',
      'ده لعب بارد وأنا مابحبش البرود في اللعب 🔥',
    ],
    RAQAM_WAHED: [
      'أنا شايل الماتش لوحدي وحضرتك نايم في العسل! 👑🤦‍♂️',
      'العيب مش عليا.. العيب على اللي حطك معايا في تيم 👑😂',
      'لو كنت بلعب ضد نفسي كنت كسبت أسهل من كده! 👑',
    ],
    EL_HEMA: [
      'النظرية باظت بسبب العشوائية بتاعتك يا زميلي 🧠🤦‍♂️',
      'ده لعب ملوش أي علاقة بالمنطق أو الإحصاء نهائي! 📐😂',
      'بوظت المعادلة بقرار غريب جداً 🧠',
    ],
    EL_HOBA: [
      'أنا طرت لوحدي وأنت وقفت الماتش في المطار ⚡🤦‍♂️',
      'إيه البطة اللي بلعب معاها دي.. اللعب مات ⚡😂',
      'كنت طالع طلقة وأنت دوست فرامل يد ⚡',
    ],
    EL_SAMY: [
      'أنا بلعب مع فردة تعبانة وضيعتني يا زميلي! 🤦‍♂️',
      'عامل فيها حريف وجايبنا ورا يا عم فلان! 😂',
      'منك لله يا زميلي.. ده لعب ده؟ ضيعت مجهودي! 🤦‍♂️',
      'يا ريتني كنت بلعب مع روبوت غسالة مش معاك 🤖😂',
    ],
  },

  GAME_LOCKED: {
    EL_RAYEQ: [
      'قفلنا الدور ونعد على مهلنا بروقان ☕🔒',
      'سدّة رايقة وخيرها في غيرها لو خسرنا 😂☕',
    ],
    EL_QETT: [
      'مصيدة القفلة اشتغلت بنجاح.. مفيش مخرج 😼🔒',
      'قفلنا الجحر على الفار.. اتفرج بقى 😼',
    ],
    EL_TITO: [
      'قفلناها وشيطنا الورق بالضبة والمفتاح! 🔥🔒',
      'سدّة نااار ومين اللي هيشيل البلاوي دي؟ 💥🔥',
    ],
    RAQAM_WAHED: [
      'قفلتها بإيدي عشان أحسمها بالنقط.. تخطيط المعلم 👑🔒',
      'السدّة دي فخ معمول لحضراتكم مخصوص 🏆',
    ],
    EL_HEMA: [
      'سدّة بحسابات رياضية دقيقة لصالحنا 🧠🔒',
      'القفلة دي تطبيق عملي لقانون انحسار الاحتمالات 📐😎',
    ],
    EL_HOBA: [
      'هوبا وقفلناها في ثانية.. مفيش مهرب ⚡🔒',
      'سدّة سريعة خاطفة شلت الحركة تماماً 🚀🔒',
    ],
    EL_SAMY: [
      'سدّة وقفلناها.. عد ورقك وركز في النقط يا كابتن 🔒😎',
      'القفلة دي معمولة بمعلمة قديمة.. مين معاه بونط؟ 🎲🔒',
    ],
  },

  OPPONENT_PASS: {
    EL_RAYEQ: [
      'فوت براحتك يا باشا القهوة لسه سخنة ☕😂',
      'الباب مقفول بالضبة والمفتاح، ريح شوية 🔒☕',
    ],
    EL_QETT: [
      'اتزنقت في الخية بتاعتي يا ناصح؟ 😼👌',
      'ملقتش كارت؟ يا عيني معلش متعيطش 😂😼',
    ],
    EL_TITO: [
      'زنقة كلاب دي ولا إيه؟ فوت يلااا 🔥😂',
      'شيط يا كابتن مالكش أي مخرج خلاص 💥🔥',
    ],
    RAQAM_WAHED: [
      'متفكرش كتير.. فوت يا كابتن دي أصول اللعبة 👑',
      'قول فوت وأنت باصص في الأرض يا شاطر 😎👑',
    ],
    EL_HEMA: [
      'مسألة رياضية مقفولة.. فوت بقانون الطبيعة 🧠😂',
      'مفيش احتمالات خلاص، الصفر مكتوبلك 📐',
    ],
    EL_HOBA: [
      'عطلتك في محطة القطر.. عدي غيرك بسرعة ⚡😂',
      'زنقة سريعة متوجعش.. متقلقش هوبا ⚡',
    ],
    EL_SAMY: [
      'عدّي يا معلم.. مالكش في اللعبة دي 😏',
      'زنقتك في زاوية ضيقة صح؟ فوت وانت ساكت 😂',
      'قول فوت بالراحة عشان صوتك ميعلاش 😂',
    ],
  },

  PASS: {
    EL_RAYEQ: [
      'فوت بمزاجي.. بنريح ونشرب شاي ☕😎',
      'الدنيا فري، فوت الجولة دي ولنا عودة 😂☕',
    ],
    EL_QETT: [
      'فوت.. بس القط مش بيسيب حقه 😼',
      'كمين ده ولا ورق؟ فوت يا عم هنرجعلك 😼',
    ],
    EL_TITO: [
      'فوت يا حظ.. ورق ناشف زي الحجر! 🔥🎲',
      'راجعلك الدور الجاي وهفرقعها في وشكم 💥🔥',
    ],
    RAQAM_WAHED: [
      'فوت.. بس افتكروا إني سايبكم تفرحوا شوية 👑',
      'فوت مؤقت، الأسد بيريح بس مابيموتش 😎👑',
    ],
    EL_HEMA: [
      'فوت.. حسابات الورق محتاجة إعادة صياغة 🧠',
      'المتغيرات مش مساعدة.. فوت مؤقت 📐',
    ],
    EL_HOBA: [
      'فوت في ثانية.. مفيش وقت نضيعه ⚡',
      'فوت وهوبا في الجولة الجاية واكلكم ⚡🚀',
    ],
    EL_SAMY: [
      'فوت.. ما أنا بلعب مع فردة تعبانة مسوداها عليا! 🤦‍♂️',
      'أنا بفوت عشان زميلي مقفلها في وشي مش أكتر 😂',
      'فوت يا عم.. إيه الورق الناشف ده! 🎲',
    ],
  },

  PLAY: {
    EL_RAYEQ: [
      'كلو رايق يا باشا.. العب بروقان ☕',
      'حبة حبة واللعب يحلى بروقان 😎☕',
      'رمية معلم في وقتها تمام 👌',
    ],
    EL_QETT: [
      'ضربة تحت الحزام بمزاااج 😼👌',
      'فكر بقى هتعمل إيه بعد الكارت ده 😂😼',
      'خربوش صغير هيوجعك كمان شوية 😼',
    ],
    EL_TITO: [
      'نولعها بقى ولا إيه؟ خد دي 🔥',
      'الضربة القاضية في الطريق.. سخن اللعب 💥🔥',
      'وريني هترد بإيه يا كابتن 🔥',
    ],
    RAQAM_WAHED: [
      'رقم واحد بيلعب وأنتوا تتفرجوا وتتعلموا 👑',
      'أنا بنزل الكارت وبقفل الدور في دماغي خلاص 😎👑',
      'اللعب ده ليفل وحش متقارنش نفسك بيا 🏆',
    ],
    EL_HEMA: [
      'حركة محسوبة بدقة فيزيائية 🧠😎',
      'الورقة دي هتغير مجرى التكتيك في الماتش 📐',
      'خطوة شطرنجية في لعبة دومينو 🧠',
    ],
    EL_HOBA: [
      'على السريع ومن غير تفكير.. هوبا ⚡',
      'السرعة في اللعب دي لعبتي المفضلة 🚀⚡',
      'كارت صاروخي ميستناش ⚡',
    ],
    EL_SAMY: [
      'خد دي وماتعيطش 🔥',
      'ركز يا بني بلاش سرحان.. المعلم بيلعب 😎',
      'أتقل تاخد حاجة نضيفة.. أصول الكار 👌☕',
    ],
  },

  OPENING_66: {
    EL_RAYEQ: [
      'دوش رايق على الصبح مع فنجان قهوة ☕😎',
      'بداية هادية وبكرة تروق وتحلى ☕',
    ],
    EL_QETT: [
      'القط فتح بالدوش واللعب سخن 😼👌',
      'ستات تفتح النفس على نصب الكماين 😼',
    ],
    EL_TITO: [
      'نولع الماتش من أولها بالدوش! 🔥💥',
      'ستات يا رجالة وبداية نارية ملهاش حل ⚡🔥',
    ],
    RAQAM_WAHED: [
      'رقم واحد يبدأ بالدوش والباقي يسكت ويتفرج 👑',
      'دي ضربة البداية والباقي تفاصيل محسومة 🏆👑',
    ],
    EL_HEMA: [
      'الدوش ده نقطة ارتكاز نظرية الماتش 🧠📐',
      'أقوى بداية إحصائية في الدومينو 🧠',
    ],
    EL_HOBA: [
      'دوش في ثانية وهوبا طايرين ⚡🚀',
      'ضربة البداية الصاروخية.. يلا بينا ⚡',
    ],
    EL_SAMY: [
      'الدوش ستات بيفتح الماتش للكبار بس 🔥',
      'أول خطوة في طريق البونط.. دوش يا معلم 😎👌',
    ],
  },

  PLAY_DOUBLE: {
    EL_RAYEQ: [
      'بلاطة بروقان ومن غير حرق دم ☕😎',
      'نزلت البلاطة ومستني فنجان الشاي 👌☕',
    ],
    EL_QETT: [
      'بلاطة قفلتها عليكم بمزاااج 😼👌',
      'كمين بلاطات والقط مش بيرحم 😼',
    ],
    EL_TITO: [
      'خد البلاطة دي وسخن اللعب نااار 🔥',
      'بلاطة في الجون ومحدش هيلحقها 💥🔥',
    ],
    RAQAM_WAHED: [
      'البلاطة دي عشان تعرفوا مين رقم واحد 👑',
      'ضربة بلاطة بمقام ماتش كامل 🏆👑',
    ],
    EL_HEMA: [
      'بلاطة محسوبة هندسياً لقفل المسارات 🧠📐',
      'تثبيت استراتيجي لمحاور اللعب 🧠',
    ],
    EL_HOBA: [
      'بلاطة على السريع وهوبا في مكانها ⚡',
      'سرعة وبلاطة ومفيش وقت نضيعه 🚀⚡',
    ],
    EL_SAMY: [
      'بلاطة تسد عين الشمس في وقتها تمام 😎🔥',
      'البلاطة دي معمولة للي يقدرها 👌🎲',
    ],
  },

  MATCH_WIN: {
    EL_RAYEQ: [
      'الماتش خلص بروقان تام.. مين هيعزمنا ع المشاريب؟ ☕😎',
      'مبروك لينا وهاردلك.. أهم حاجة الروح الرياضية ☕❤️',
    ],
    EL_QETT: [
      'القط التهم الماتش كله من غير ما يسيب حتة 😼🏆',
      'كده قفلنا الحساب رسمي.. نتقابل في الماتش الجاي 😼',
    ],
    EL_TITO: [
      'حرقنا الماتش وفزنا بالضربة القاضية! 🔥🏆',
      'كده خلصنا الحساب وشيطناكم خلاص.. ألف مبروك لينا 🔥',
    ],
    RAQAM_WAHED: [
      'الماتش خلص ورقم واحد توج نفسه ملك الطاولة 👑🏆',
      'البطولة دي مكانها الطبيعي عندي.. وسع للمعلم 👑',
    ],
    EL_HEMA: [
      'المباراة انتهت بالتطابق التام مع التوقعات الرياضية 🧠🏆',
      'المنطق انتصر كالعادة.. هاردلك للمنافس 🧠',
    ],
    EL_HOBA: [
      'ماتش صاروخي طار في ثواني لصالحنا! ⚡🚀🏆',
      'هوبا وفوز مستحق في لمح البصر ⚡😎',
    ],
    EL_SAMY: [
      'الماتش خلص والحريف بان.. ألف مبروك لينا وهاردلك ليكم 🏆👑',
      'كده خلصنا الحساب وقفلنا الدكانة.. روحوا استريحوا بقى 😎🔥',
    ],
  },

  MATCH_LOSS: {
    EL_RAYEQ: [
      'يلا خيرها في غيرها.. أهم حاجة إننا قعدنا روقنا شوية ☕😂',
      'الماتش راح بس القهوة كانت حلوة والله ☕',
    ],
    EL_QETT: [
      'الخسارة دي مش عادية.. القط هيرجع بمخالب أحد 😼👊',
      'حظكم كان عالي الدور ده بس لينا جولة تانية 😼',
    ],
    EL_TITO: [
      'الماتش فلت مننا في ثانية بس ولعناها برضه! 🔥🤦‍♂️',
      'هنعوضها في أقرب وقت وهنفرقعها في وشكم 💥🔥',
    ],
    RAQAM_WAHED: [
      'الماتش ده ميتحسبش.. التيم اللي معايا جابني ورا 👑🤦‍♂️',
      'رقم واحد مش بيخسر.. دي مجرد كبوة جواد مؤقتة 👑',
    ],
    EL_HEMA: [
      'فيه أخطاء فردية باظت بسببها الحسبة كلها 🧠🤦‍♂️',
      'إحصائياً كان ممكن نكسب لولا الانحراف العشوائي ده 📐',
    ],
    EL_HOBA: [
      'السرعة خانتنا في آخر لفة.. هوبا وتعويض الماتش الجاي ⚡🤦‍♂️',
      'كبوة سريعة وهنطير تاني في الماتش اللي بعده 🚀',
    ],
    EL_SAMY: [
      'الماتش راح في داهية بسبب التكتيك العبقري بتاع زميلي 🤦‍♂️😂',
      'خيرها في غيرها.. بس محتاجين نغير الفريق كله بصراحة 💔😂',
    ],
  },

  PARTNER_CHEER: [
    {
      EL_RAYEQ: [
        'عاش يا شريكي.. رمية رايقة وهادية زي الفل ☕👌',
        'تسلم إيدك يا زميلي.. كده تمام قوي ☕😎',
      ],
      EL_QETT: [
        'عاش يا شريكي.. المخالب طلعت في وقتها الصح 😼👌',
        'كمين مشترك ولا أروع يا كوتش 😼🔥',
      ],
      EL_TITO: [
        'هو ده الشغل المولع يا زميلي! عاش البطل 🔥💥',
        'نار يا حبيبي نار.. كمل هجوم ومتخافش 🔥👌',
      ],
      RAQAM_WAHED: [
        'عاش يا زميلي.. طول ما أنت بتلعب مع رقم واحد متقلقش 👑',
        'رمية ممتازة.. ماشي على خطتي تمام 👑👌',
      ],
      EL_HEMA: [
        'توافق تكتيكي ممتاز يا زميلي.. الحسبة ظبطت 🧠📐',
        'الرمية دي رفعت احتمال فوزنا بنسبة 25% 🧠👌',
      ],
      EL_HOBA: [
        'هوبا وجت في الجون يا شريكي! عاش السريع ⚡🚀',
        'رمية صاروخية كملت سرعتي تمام ⚡👌',
      ],
      EL_SAMY: [
        'عاش يا زميلي والله، رمية معلم أصيل 👌☕',
        'هو ده اللعب الصح يا شريكي، ماشي على الأصول تمام 😎',
      ],
    } as any,
  ][0],
};


// ═══════════════════════════════════════════════════════════════════
// البوتات الذكية: الهيما · الهوبا · رقم واحد في العذبة
// نفس نظام التفكير (SmartBotBrain) وكل واحد ليه كلامه.
// الكلام على حسب الموقف بس، وهاديين: فين وفين لما يتكلموا.
// ═══════════════════════════════════════════════════════════════════
type SmartBotId = 'EL_HEMA' | 'EL_HOBA' | 'RAQAM_WAHED' | 'EL_SAMY' | 'EL_RAYEQ' | 'EL_TITO';
type SpeakingBotId = 'EL_HEMA' | 'EL_HOBA' | 'RAQAM_WAHED' | 'EL_SAMY';
const SMART_BOTS: ReadonlySet<BotId> = new Set<BotId>(['EL_HEMA', 'EL_HOBA', 'RAQAM_WAHED', 'EL_SAMY', 'EL_RAYEQ', 'EL_TITO']);
/** بوتات بتلعب بالعقل البسيط بس بتتكلم بالكلام الجديد */
const SIMPLE_THINKERS: ReadonlySet<BotId> = new Set<BotId>(['EL_RAYEQ', 'EL_TITO']);
/** الرايق بيتكلم زي رقم واحد في العذبة، والتيتو زي الهيما */
const SPEECH_AS: Record<SmartBotId, SpeakingBotId> = {
  EL_HEMA: 'EL_HEMA',
  EL_HOBA: 'EL_HOBA',
  RAQAM_WAHED: 'RAQAM_WAHED',
  EL_SAMY: 'EL_SAMY',
  EL_RAYEQ: 'RAQAM_WAHED',
  EL_TITO: 'EL_HEMA',
};

type SmartSituation =
  | 'MY_DOOR'          // لعب باب لزميله
  | 'PASS'             // فوّت
  | 'OPP_PASS'         // الخصم اللي بعده فوّت
  | 'PARTNER_DOOR'     // زميله لعبله باب
  | 'PARTNER_MISTAKE'  // زميله غلط
  | 'LOCK'             // قفل
  | 'WIN'              // كسب
  | 'LOSS'             // خسر
  | 'BAD_HAND';        // ورقه جه وحش (السامي بيشتكي من حظه)

const SMART_QUOTES: Record<SmartSituation, Record<SpeakingBotId, string[]>> = {
  MY_DOOR: {
    EL_HEMA: ['مسا مني ليك', 'لكش يطمر فيك', 'خد عشان انت طفس'],
    EL_HOBA: ['المفروض دي ليك', 'خد يعم', 'خد يزميلي'],
    RAQAM_WAHED: ['خد يعم العب لوحدك', 'انا عايزك تبهدلهم'],
    EL_SAMY: ['احلي مسا عليك يقدوة', 'خد دي من عمك السامي', 'خد رغم انك متستاهلش'],
  },
  PASS: {
    EL_HEMA: ['فوت يعم منا بلعب مع خدادية', 'معييش يعم'],
    EL_HOBA: ['يحرق دم دا ورق', 'فوت', 'فوت منا بلعب لوحدي'],
    RAQAM_WAHED: ['قاعد', 'فوت منا بلعب مع فردة', 'ابو ال يلعب معاك ياخي'],
    EL_SAMY: ['فوت يعم', 'انا لو بلعب لوحدي مش هفوت كده', 'يجدعان حد يقوم الواد دا من قصادي'],
  },
  OPP_PASS: {
    EL_HEMA: ['لو مزعلك اقوم امشي'],
    EL_HOBA: ['هو انا كل ما العب تفوت', 'شوف ال ورايا بعمل فيه ايه'],
    RAQAM_WAHED: ['العبلك لعبة غيرها طيب', 'حد يشيله من هنا يبني'],
    EL_SAMY: ['اقعد ياض', 'ظلمت نفسك انت بقعدتك ورايا', 'انا زميلي دا اسطورة'],
  },
  PARTNER_DOOR: {
    EL_HEMA: ['اسطورة يجدعان'],
    EL_HOBA: ['مش طبيعي الواد دا'],
    RAQAM_WAHED: ['انت منجد يبني', 'الراجل دا انتو ظلمينه'],
    EL_SAMY: ['يبني متبقاش غشيم كده', 'حرام عليك يزميلي الناس دي تبعنا', 'مش طبيعي انا بلعب مع فحل'],
  },
  PARTNER_MISTAKE: {
    EL_HEMA: ['يعم ركز يعم'],
    EL_HOBA: ['يعم غور فداهية'],
    RAQAM_WAHED: ['والله انت مليك فيها'],
    EL_SAMY: ['يعم غور فداهية', 'انت بتلعب ضدي يبني ولا ايه', 'تصدق بالله انت اغبي من الرايق'],
  },
  LOCK: {
    EL_HEMA: ['قفلة'],
    EL_HOBA: ['قفلة'],
    RAQAM_WAHED: ['قفلة'],
    EL_SAMY: ['قفلة'],
  },
  WIN: {
    EL_HEMA: ['يلا سلموا علي بعض'],
    EL_HOBA: ['يلا يا فردة انت وهو'],
    RAQAM_WAHED: ['طب متلعبوا بل او اساتك'],
    EL_SAMY: [
      'انا الصراحه ولا حاجة من غير زميلي',
      'لا ال بيلعب معايا دا اسطورة',
      'انتو عايزين تكسبوا السامي ولا ايه يتعبانين انتو',
    ],
  },
  LOSS: {
    EL_HEMA: ['الورق زفت يعم'],
    EL_HOBA: ['مش عارف منجسه كده ليه'],
    RAQAM_WAHED: ['انا مش فايق والله مكسل احسب اصلا'],
    EL_SAMY: ['انت محتاج تشوفلك واحد ضروري والله', 'انت يدوب تروح مشوفش وشك ع الترابيزة تاني'],
  },
  BAD_HAND: {
    EL_HEMA: [],
    EL_HOBA: [],
    RAQAM_WAHED: [],
    EL_SAMY: ['هو جيم شمال من اوله', 'يلا املنا فيك يزميلي'],
  },
};

/** احتمال إن البوت يتكلم في الموقف (القفلة والكسب والخسارة دايمًا) */
const SMART_PROBABILITIES: Record<SmartSituation, number> = {
  MY_DOOR: 0.5,
  PASS: 0.5,
  OPP_PASS: 0.5,
  PARTNER_DOOR: 0.5,
  PARTNER_MISTAKE: 0.5,
  LOCK: 1,
  WIN: 1,
  LOSS: 1,
  BAD_HAND: 0.5,
};
const SMART_MUST_SAY: ReadonlySet<SmartSituation> = new Set<SmartSituation>(['LOCK', 'WIN', 'LOSS']);
/** بعد أي رسالة في الأوضة: البوت الذكي يستنى 5 ثواني قبل ما يتكلم (إلا القفلة/الكسب/الخسارة) */
const SMART_ROOM_GAP_MS = 5000;
/** حتى القفلة/الكسب/الخسارة: مفيش رسالتين ورا بعض في أقل من 4 ثواني (بوت واحد بس يتكلم) */
const SMART_MUST_SAY_GAP_MS = 4000;
const SMART_PER_BOT_GAP_MS = 8000;

const TRIGGER_TO_SMART: Partial<Record<BotChatTrigger, SmartSituation>> = {
  OPPONENT_PASS: 'OPP_PASS',
  ROUND_WIN: 'WIN',
  ROUND_WIN_HIGH_POINTS: 'WIN',
  MATCH_WIN: 'WIN',
  ROUND_LOSS: 'LOSS',
  MATCH_LOSS: 'LOSS',
};

const SMART_TO_TRIGGER: Record<SmartSituation, BotChatTrigger> = {
  MY_DOOR: 'PLAY',
  PASS: 'PASS',
  OPP_PASS: 'OPPONENT_PASS',
  PARTNER_DOOR: 'PARTNER_CHEER',
  PARTNER_MISTAKE: 'PLAY',
  LOCK: 'GAME_LOCKED',
  WIN: 'ROUND_WIN',
  LOSS: 'ROUND_LOSS',
  BAD_HAND: 'PASS',
};

// Probability gates to eliminate message spam ("أفورة الرسايل")
const TRIGGER_PROBABILITIES: Record<BotChatTrigger, number> = {
  PLAY: 0.16, // Only 16% on normal plays
  PLAY_DOUBLE: 0.35, // 35% on slamming doubles
  OPENING_66: 0.65, // 65% on the iconic 6-6 start
  GAME_LOCKED: 0.75, // 75% on game locks
  PASS: 0.28, // 28% on passing
  OPPONENT_PASS: 0.25, // 25% on opponent pass
  ROUND_WIN: 0.75, // 75% on round wins
  ROUND_WIN_HIGH_POINTS: 0.85, // 85% on huge points
  ROUND_LOSS: 0.60, // 60% on round loss
  MATCH_WIN: 0.85, // 85% on match win
  MATCH_LOSS: 0.70, // 70% on match loss
  PARTNER_CHEER: 0.35, // 35% on cheering partner
};

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private lastChatTimestamps: Map<string, number> = new Map(); // roomId_botId -> timestamp
  private roomLastChatTimestamps: Map<string, number> = new Map(); // roomId -> timestamp
  private lastQuotes: Map<string, string> = new Map();

  /**
   * Extensible context evaluator that determines if a move qualifies for a specialized dialogue trigger.
   */
  public evaluateContextualTrigger(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    baseTrigger: 'PLAY' | 'PASS' | 'ROUND_WIN' | 'ROUND_LOSS',
    context?: BotReactionContext
  ): BotChatTrigger {
    if (baseTrigger === 'PLAY') {
      if (context?.isOpening66) return 'OPENING_66';
      if (context?.isDouble) return 'PLAY_DOUBLE';
      return 'PLAY';
    }
    if (baseTrigger === 'ROUND_WIN') {
      if (context?.isGameLocked) return 'GAME_LOCKED';
      if ((context?.roundScore ?? 0) >= 25) return 'ROUND_WIN_HIGH_POINTS';
      return 'ROUND_WIN';
    }
    if (baseTrigger === 'ROUND_LOSS') {
      if (context?.isGameLocked) return 'GAME_LOCKED';
      return 'ROUND_LOSS';
    }
    return baseTrigger;
  }

  /**
   * Evaluates and selects a legal move for an Egyptian AI Bot based on its UNIQUE personality and thinking style.
   * STRICT ANTI-CHEAT RULE: Bot NEVER accesses hidden opponent cards.
   */
  public decideMove(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    botId: BotId = 'EL_SAMY'
  ): BotDecision {
    const legalMoves = engine.getLegalMovesForSeat(seat);

    if (botId && SMART_BOTS.has(botId) && OFFICIAL_BAFFA_BOTS[botId]) {
      return this.decideSmartMove(engine, seat, botId as SmartBotId, legalMoves);
    }

    if (legalMoves.length === 0) {
      const chat = this.generateSocialReaction(engine, seat, botId, 'PASS');
      return { action: 'PASS', chatMessage: chat };
    }

    const validBotId: BotId = (botId && OFFICIAL_BAFFA_BOTS[botId]) ? botId : 'EL_SAMY';
    let chosenMove: LegalMove;
    let preferredEnd: ChainEnd;
    if (validBotId === 'EL_RAYEQ' || validBotId === 'EL_TITO' || validBotId === 'EL_QETT') {
      // الرايق · التيتو · القط: عقل بسيط مشترك
      try {
        const d = new SimpleBotBrain(engine, seat).decide(legalMoves);
        chosenMove = d.move;
        preferredEnd = d.move.validEnds.includes(d.end) ? d.end : (d.move.validEnds[0] || 'LEFT');
      } catch (err: any) {
        this.logger.warn(`Simple bot brain failed: ${err?.message}`);
        chosenMove = legalMoves[0];
        preferredEnd = chosenMove.validEnds[0] || 'LEFT';
      }
    } else {
      chosenMove = this.selectMoveByPersonality(legalMoves, validBotId, engine, seat);
      preferredEnd = chosenMove.validEnds[0] || 'LEFT';
    }

    // Contextual evaluation for special play triggers (Opening [6|6], Doubles, etc.)
    const isDouble = chosenMove.tile[0] === chosenMove.tile[1];
    const isOpening66 =
      engine.getChain().getState().tiles.length === 0 &&
      chosenMove.tile[0] === 6 &&
      chosenMove.tile[1] === 6;
    const context: BotReactionContext = { tile: chosenMove.tile, isDouble, isOpening66 };
    const contextualTrigger = this.evaluateContextualTrigger(engine, seat, 'PLAY', context);

    const chat = this.generateSocialReaction(engine, seat, validBotId, contextualTrigger, context);

    return {
      action: 'PLAY',
      tile: chosenMove.tile,
      end: preferredEnd,
      chatMessage: chat,
    };
  }

  /**
   * Dispatches move selection to the specialized thinking logic of each Egyptian bot.
   */
  private selectMoveByPersonality(
    moves: LegalMove[],
    botId: BotId,
    engine: DominoGameEngine,
    seat: PlayerSeat
  ): LegalMove {
    switch (botId) {
      case 'EL_RAYEQ':
        return this.moveStrategyElRayeq(moves);
      case 'EL_QETT':
        return this.moveStrategyElQett(moves, engine, seat);
      case 'EL_TITO':
        return this.moveStrategyElTito(moves);
      case 'RAQAM_WAHED':
      case 'EL_HEMA':
      case 'EL_HOBA':
        return new SmartBotBrain(engine, seat).decide(moves).move;
      case 'EL_SAMY':
      default:
        return this.moveStrategyElSamy(moves, engine, seat);
    }
  }

  /**
   * 1. الرايق (EL_RAYEQ) — Laid back, makes mistakes or plays random tiles, avoids stress.
   */
  private moveStrategyElRayeq(moves: LegalMove[]): LegalMove {
    // 35% chance to make a carefree, completely random play
    if (Math.random() < 0.35) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    // Otherwise picks lowest pip tile (relaxed play, unconcerned with heavy points in hand)
    return [...moves].sort((a, b) => (a.tile[0] + a.tile[1]) - (b.tile[0] + b.tile[1]))[0];
  }

  /**
   * 2. القط (EL_QETT) — Sneaky Ambusher: monopolizes suits, sets traps to starve opponents.
   */
  private moveStrategyElQett(
    moves: LegalMove[],
    engine: DominoGameEngine,
    seat: PlayerSeat
  ): LegalMove {
    const rawHands = engine.getRawHands();
    const ownHand = rawHands[seat] || [];

    // Count suit frequencies in own hand
    const suitCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    ownHand.forEach((t) => {
      suitCounts[t[0]] = (suitCounts[t[0]] || 0) + 1;
      suitCounts[t[1]] = (suitCounts[t[1]] || 0) + 1;
    });

    const chain = engine.getChain();
    const currentLeft = chain.getLeftEnd();
    const currentRight = chain.getRightEnd();

    // Score moves: prefer moves that leave an end where El Qett holds 2+ other tiles (trapping opponents)
    return [...moves].sort((a, b) => {
      const getSuitDominance = (move: LegalMove): number => {
        let score = (move.tile[0] + move.tile[1]) * 0.8;
        if (move.tile[0] === move.tile[1]) score += 4; // bonus for doubles in ambush

        // For each valid placement end, determine the newly exposed number
        for (const end of move.validEnds) {
          const connectingEndVal = end === 'LEFT' ? currentLeft : currentRight;
          const exposedNum = move.tile[0] === connectingEndVal ? move.tile[1] : move.tile[0];
          const remainingOfSuit = (suitCounts[exposedNum] || 1) - 1;
          score += remainingOfSuit * 5; // heavy bonus for monopolizing open ends
        }
        return score;
      };

      return getSuitDominance(b) - getSuitDominance(a);
    })[0];
  }

  /**
   * 3. التيتو (EL_TITO) — Fiery, aggressive street player: slams doubles, dumps heavy points ASAP.
   */
  private moveStrategyElTito(moves: LegalMove[]): LegalMove {
    return [...moves].sort((a, b) => {
      const pipA = a.tile[0] + a.tile[1];
      const pipB = b.tile[0] + b.tile[1];
      const doubleBonusA = a.tile[0] === a.tile[1] ? 10 : 0;
      const doubleBonusB = b.tile[0] === b.tile[1] ? 10 : 0;
      return (pipB * 1.5 + doubleBonusB) - (pipA * 1.5 + doubleBonusA);
    })[0];
  }

  /**
   * 7. السامي (EL_SAMY) — The Egyptian Grandmaster: deep partner synergy, tracks opponent passes, masters domino etiquette.
   */
  private moveStrategyElSamy(
    moves: LegalMove[],
    engine: DominoGameEngine,
    seat: PlayerSeat
  ): LegalMove {
    const rawHands = engine.getRawHands();
    const ownHand = rawHands[seat] || [];
    const partnerSeat = ((seat + 2) % 4) as PlayerSeat;

    const chain = engine.getChain();
    const left = chain.getLeftEnd();
    const right = chain.getRightEnd();
    const placedTiles = chain.getState().tiles;

    // Check last tile played by partner to respect/preserve partner's introduced suit
    let partnerFavoredSuit: number | null = null;
    for (let i = placedTiles.length - 1; i >= 0; i--) {
      if (placedTiles[i].playedBySeat === partnerSeat) {
        partnerFavoredSuit = placedTiles[i].tile[0];
        break;
      }
    }

    return [...moves].sort((a, b) => {
      const evaluateMastery = (m: LegalMove): number => {
        const pips = m.tile[0] + m.tile[1];
        let score = pips * 1.5;

        if (m.tile[0] === m.tile[1]) score += 5; // Strategic double

        for (const end of m.validEnds) {
          const connectingVal = end === 'LEFT' ? left : right;
          const untouchedVal = end === 'LEFT' ? right : left;
          const exposedVal = m.tile[0] === connectingVal ? m.tile[1] : m.tile[0];

          // Partner synergy: Don't cut off partner's suit if avoidable
          if (partnerFavoredSuit !== null && untouchedVal === partnerFavoredSuit) {
            score += 10;
          }

          // Self continuity: Can El Samy continue on the new exposed end?
          const canContinue = ownHand.some(
            (t) =>
              !(t[0] === m.tile[0] && t[1] === m.tile[1]) &&
              (t[0] === exposedVal || t[1] === exposedVal)
          );
          if (canContinue) score += 6;
        }

        return score;
      };

      return evaluateMastery(b) - evaluateMastery(a);
    })[0];
  }

  /**
   * الهيما · الهوبا · رقم واحد في العذبة: نفس العقل، والكلام على حسب الموقف.
   */
  private decideSmartMove(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    botId: SmartBotId,
    legalMoves: LegalMove[]
  ): BotDecision {
    let brain: SmartBotBrain | null = null;
    try {
      brain = new SmartBotBrain(engine, seat);
    } catch (err: any) {
      this.logger.warn(`SmartBotBrain init failed for ${botId}: ${err?.message}`);
    }

    if (legalMoves.length === 0) {
      let situation: SmartSituation = 'PASS';
      try {
        if (brain && brain.passInfo().partnerMistake) situation = 'PARTNER_MISTAKE';
      } catch {}
      return { action: 'PASS', chatMessage: this.generateSmartReaction(engine, seat, botId, situation) };
    }

    if (!brain) {
      const fb = legalMoves[0];
      return { action: 'PLAY', tile: fb.tile, end: fb.validEnds[0] || 'LEFT' };
    }

    // السامي: أسطورة الدومينو، بيحسب لقدّام لحد آخر الدور
    let d: SmartDecision;
    if (SIMPLE_THINKERS.has(botId)) {
      // الرايق والتيتو: بيلعبوا بالعقل البسيط، والكلام على حسب اللي حصل
      const simple = new SimpleBotBrain(engine, seat).decide(legalMoves);
      d = brain.describe(simple.move, simple.end);
    } else {
      d = botId === 'EL_SAMY' ? brain.decideLegend(legalMoves) : brain.decide(legalMoves);
    }
    let chatMessage: BotChatMessage | undefined;
    // أول الجيم: محدش بيتكلم
    if (!d.isOpening) {
      if (d.isLock) chatMessage = this.generateSmartReaction(engine, seat, botId, 'LOCK');
      else if (botId === 'EL_SAMY' && brain.isFirstTurnOfRound() && brain.isBadHand())
        chatMessage = this.generateSmartReaction(engine, seat, botId, 'BAD_HAND');
      else if (d.isDoorForPartner) chatMessage = this.generateSmartReaction(engine, seat, botId, 'MY_DOOR');
      else if (d.partnerGaveDoor) chatMessage = this.generateSmartReaction(engine, seat, botId, 'PARTNER_DOOR');
    }

    return {
      action: 'PLAY',
      tile: d.move.tile,
      end: d.move.validEnds.includes(d.end) ? d.end : (d.move.validEnds[0] || 'LEFT'),
      chatMessage,
    };
  }

  /** تحويل الأحداث الخارجية (فوّت الخصم، كسب، خسارة) لكلام البوتات الذكية */
  private smartReactionFromTrigger(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    botId: SmartBotId,
    trigger: BotChatTrigger
  ): BotChatMessage | undefined {
    let situation = TRIGGER_TO_SMART[trigger];

    if (trigger === 'GAME_LOCKED') {
      // نهاية دور مقفول: الكلام على حسب مين كسب
      const result = engine.getSanitizedState(null)?.lastRoundResult;
      if (!result) return undefined;
      const myTeam = seat % 2 === 0 ? 1 : 2;
      situation = result.winnerTeam === myTeam ? 'WIN' : 'LOSS';
    }

    if (situation === 'OPP_PASS') {
      // بس لما اللي بيفوت هو الخصم اللي بيلعب بعده على طول
      const passer = ((seat + 1) % 4) as PlayerSeat;
      const current = engine.getCurrentTurnSeat();
      const players = (engine as any).players as { lastAction?: string }[] | undefined;
      const aboutToPass = current === passer && engine.getLegalMovesForSeat(passer).length === 0;
      const justPassed = ((current + 3) % 4) === passer && players?.[passer]?.lastAction === 'PASS';
      if (engine.getStatus() !== 'PLAYING' || !(aboutToPass || justPassed)) return undefined;
    }

    if (!situation) return undefined;
    return this.generateSmartReaction(engine, seat, botId, situation);
  }

  /** رسالة واحدة بس في الأوضة في نفس الوقت، وهاديين، ومن غير تكرار */
  private generateSmartReaction(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    botId: SmartBotId,
    situation: SmartSituation
  ): BotChatMessage | undefined {
    const profile = OFFICIAL_BAFFA_BOTS[botId];
    if (!profile) return undefined;

    const roomId = engine.getRoomId();
    const botKey = `${roomId}_${botId}`;
    const now = Date.now();
    const mustSay = SMART_MUST_SAY.has(situation);

    const lastRoomChat = this.roomLastChatTimestamps.get(roomId) || 0;
    if (now - lastRoomChat < (mustSay ? SMART_MUST_SAY_GAP_MS : SMART_ROOM_GAP_MS)) return undefined;

    if (!mustSay) {
      const lastBotChat = this.lastChatTimestamps.get(botKey) || 0;
      if (now - lastBotChat < SMART_PER_BOT_GAP_MS) return undefined;
      if (Math.random() > SMART_PROBABILITIES[situation]) return undefined;
    }

    const pool = SMART_QUOTES[situation][SPEECH_AS[botId]];
    if (!pool || pool.length === 0) return undefined;

    const lastUsed = this.lastQuotes.get(botKey);
    const options = pool.length > 1 ? pool.filter((q) => q !== lastUsed) : pool;
    const text = options[Math.floor(Math.random() * options.length)];

    this.lastQuotes.set(botKey, text);
    this.lastChatTimestamps.set(botKey, now);
    this.roomLastChatTimestamps.set(roomId, now);

    return {
      botId,
      botName: profile.arabicName,
      seat,
      text,
      trigger: SMART_TO_TRIGGER[situation],
      timestamp: now,
    };
  }

  /**
   * Generates playful Egyptian social banter with strict anti-spam throttle and distinct bot voices.
   */
  public generateSocialReaction(
    engine: DominoGameEngine,
    seat: PlayerSeat,
    botId: BotId,
    trigger: BotChatTrigger,
    _context?: BotReactionContext
  ): BotChatMessage | undefined {
    const validBotId: BotId = (botId && OFFICIAL_BAFFA_BOTS[botId]) ? botId : 'EL_SAMY';
    const profile = OFFICIAL_BAFFA_BOTS[validBotId];
    if (!profile) return undefined;

    if (SMART_BOTS.has(validBotId)) {
      return this.smartReactionFromTrigger(engine, seat, validBotId as SmartBotId, trigger);
    }

    const roomId = engine.getRoomId();
    const botKey = `${roomId}_${validBotId}`;
    const now = Date.now();

    // 1. Room-wide Chatter Governor: Minimum 6.5 seconds between ANY bot messages in the room
    const lastRoomChat = this.roomLastChatTimestamps.get(roomId) || 0;
    if (now - lastRoomChat < 6500) {
      return undefined;
    }

    // 2. Per-Bot Cooldown: A bot won't chat more than once every 16 seconds
    const lastBotChat = this.lastChatTimestamps.get(botKey) || 0;
    if (now - lastBotChat < 16000) {
      return undefined;
    }

    // 3. Probability Gate to eliminate message spam ("أفورة الرسايل")
    const probability = TRIGGER_PROBABILITIES[trigger] ?? 0.25;
    if (Math.random() > probability) {
      return undefined;
    }

    // 4. Select tailored Egyptian quotes pool
    const botPool = BOT_QUOTES[trigger]?.[validBotId] || [];
    const fallbackPool = GENERAL_FALLBACK_QUOTES[trigger] || [];
    const combinedQuotes = botPool.length > 0 ? botPool : fallbackPool;

    if (combinedQuotes.length === 0) return undefined;

    // Pick quote, rotating away from immediate previous quote if possible
    let text = combinedQuotes[Math.floor(Math.random() * combinedQuotes.length)];
    const lastUsed = this.lastQuotes.get(botKey);
    if (combinedQuotes.length > 1 && lastUsed === text) {
      const remaining = combinedQuotes.filter((q) => q !== text);
      if (remaining.length > 0) {
        text = remaining[Math.floor(Math.random() * remaining.length)];
      }
    }

    this.lastQuotes.set(botKey, text);
    this.lastChatTimestamps.set(botKey, now);
    this.roomLastChatTimestamps.set(roomId, now);

    return {
      botId: validBotId,
      botName: profile.arabicName,
      seat,
      text,
      trigger,
      timestamp: now,
    };
  }
}
