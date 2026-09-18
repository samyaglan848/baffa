export const BAFFA_CHALLENGE_SLOGANS: string[] = [
  'وريني شطارتك.',
  'تعالى جرّب حظك.',
  'مين قدّي؟',
  'مستني الخصم.',
  'هات أقوى ما عندك.',
  'التحدي مفتوح.',
  'الطاولة فاضية.. مين يبدأ؟',
  'لو فاكر نفسك جامد.. تعالى.',
  'مش هتخسر لو مجربتش.. بس هتندم. 😂',
  'ممنوع الأعذار بعد البداية.',
  'جاي أعلّم مجاناً.. الحصة الأولى تبدأ الآن! 📚🎓',
];

export const BAFFA_PLAY_STYLES: { id: string; titleAr: string; icon: string; desc: string }[] = [
  { id: 'aggressive', titleAr: 'هجومي قاطع (Aggressive Blocker)', icon: '⚔️', desc: 'يضغط بالقفلات ويجبر الخصم على السحب والتفويت' },
  { id: 'calculator', titleAr: 'حسابي هادي (Strategic Calculator)', icon: '🧠', desc: 'يحسب البناط المتبقية في أيدي الخصوم بالورقة والقلم' },
  { id: 'lockmaster', titleAr: 'حريف قفلات (Lock Master)', icon: '🔒', desc: 'أستاذ في قفل الدور وجمع البناط لصالحه' },
  { id: 'risktaker', titleAr: 'مغامر رامي ع الحظ (Bold Risk-Taker)', icon: '🎲', desc: 'يلعب رميات غير متوقعة تقلب موازين الطاولة' },
  { id: 'piphunter', titleAr: 'قناص البناط (Pip Hunter)', icon: '🎯', desc: 'يتخلص من البلاطات الثقيلة فوراً ويحافظ على أقل مجموع' },
  { id: 'casual', titleAr: 'لعب بالحب والروقان (Relaxed & Chill)', icon: '☕', desc: 'جاي يستمتع بالشاي وقعدة الصحاب بدون تعصب' },
];

export const BAFFA_EGYPTIAN_GOVERNORATES: string[] = [
  'القاهرة',
  'الجيزة',
  'الإسكندرية',
  'الدقهلية',
  'البحر الأحمر',
  'البحيرة',
  'الفيوم',
  'الغربية',
  'الإسماعيلية',
  'المنوفية',
  'المنيا',
  'القليوبية',
  'الوادي الجديد',
  'السويس',
  'أسوان',
  'أسيوط',
  'بني سويف',
  'بورسعيد',
  'دمياط',
  'الشرقية',
  'جنوب سيناء',
  'كفر الشيخ',
  'مطروح',
  'الأقصر',
  'قنا',
  'شمال سيناء',
  'سوهاج',
];

export const BAFFA_CITIES = BAFFA_EGYPTIAN_GOVERNORATES;

export const BAFFA_LUCKY_TILES: { id: string; label: string; high: number; low: number }[] = [
  { id: '6-6', label: '6|6 (دوبل ستة)', high: 6, low: 6 },
  { id: '5-5', label: '5|5 (دوبل خمسة)', high: 5, low: 5 },
  { id: '4-4', label: '4|4 (دوبل أربعة)', high: 4, low: 4 },
  { id: '3-3', label: '3|3 (دوبل تلاتة)', high: 3, low: 3 },
  { id: '2-2', label: '2|2 (دوبل اتنين)', high: 2, low: 2 },
  { id: '1-1', label: '1|1 (دوبل واحد)', high: 1, low: 1 },
  { id: '0-0', label: '0|0 (بياض وبياض)', high: 0, low: 0 },
  { id: '6-0', label: '6|0 (ستة بياض)', high: 6, low: 0 },
  { id: '6-5', label: '6|5 (ستة خمسة)', high: 6, low: 5 },
  { id: '5-0', label: '5|0 (خمسة بياض)', high: 5, low: 0 },
  { id: '4-3', label: '4|3 (أربعة تلاتة)', high: 4, low: 3 },
  { id: '3-0', label: '3|0 (تلاتة بياض)', high: 3, low: 0 },
];
