import type { PlayerSeat, DominoTile } from './domino';

export type BotId =
  | 'EL_RAYEQ'      // الرايق (Weak, funny, makes obvious mistakes)
  | 'EL_QETT'       // القط (Medium, confident)
  | 'EL_TITO'       // التيتو (Medium, competitive)
  | 'RAQAM_WAHED'   // رقم واحد في العزبة (Pro, confident)
  | 'EL_HEMA'       // الهيما (Pro, calculated)
  | 'EL_HOBA'       // الهوبا (Pro, aggressive/playful)
  | 'EL_SAMY';      // السامي (Expert, very strategic, humorous social commentary)

export type BotDifficulty = 'WEAK' | 'MEDIUM' | 'PRO' | 'EXPERT';

export interface BotProfile {
  id: BotId;
  arabicName: string;
  englishName: string;
  difficulty: BotDifficulty;
  avatar: string;
  personality: string;
}

export const OFFICIAL_BAFFA_BOTS: Record<BotId, BotProfile> = {
  EL_RAYEQ: {
    id: 'EL_RAYEQ',
    arabicName: 'الرايق',
    englishName: 'El Rayeq',
    difficulty: 'WEAK',
    avatar: 'bot-rayeq',
    personality: 'Relaxed, laid-back, makes obvious tactical mistakes, laughs it off.',
  },
  EL_QETT: {
    id: 'EL_QETT',
    arabicName: 'القط',
    englishName: 'El Qett',
    difficulty: 'MEDIUM',
    avatar: 'bot-qett',
    personality: 'Moderate skill, confident, occasionally clever with double blocks.',
  },
  EL_TITO: {
    id: 'EL_TITO',
    arabicName: 'التيتو',
    englishName: 'El Tito',
    difficulty: 'MEDIUM',
    avatar: 'bot-tito',
    personality: 'Playful, competitive, celebrates points with energy.',
  },
  RAQAM_WAHED: {
    id: 'RAQAM_WAHED',
    arabicName: 'رقم واحد في العذبة',
    englishName: 'Raqam Wahed',
    difficulty: 'PRO',
    avatar: 'bot-raqam-wahed',
    personality: 'Professional, highly confident, tracks opponent open ends.',
  },
  EL_HEMA: {
    id: 'EL_HEMA',
    arabicName: 'الهيما',
    englishName: 'El Hema',
    difficulty: 'PRO',
    avatar: 'bot-hema',
    personality: 'Calculated, quiet, focuses on pip-reduction and blocked-game wins.',
  },
  EL_HOBA: {
    id: 'EL_HOBA',
    arabicName: 'الهوبا',
    englishName: 'El Hoba',
    difficulty: 'PRO',
    avatar: 'bot-hoba',
    personality: 'Aggressive, playful, loves trapping opponents with heavy doubles.',
  },
  EL_SAMY: {
    id: 'EL_SAMY',
    arabicName: 'السامي',
    englishName: 'El Samy',
    difficulty: 'EXPERT',
    avatar: 'bot-samy',
    personality: 'Expert strategist, highly social, shares coffee-shop banter and playful teasing.',
  },
};

export type BotChatTrigger =
  | 'PLAY'
  | 'PLAY_DOUBLE'
  | 'OPENING_66'
  | 'GAME_LOCKED'
  | 'PASS'
  | 'OPPONENT_PASS'
  | 'ROUND_WIN'
  | 'ROUND_WIN_HIGH_POINTS'
  | 'ROUND_LOSS'
  | 'MATCH_WIN'
  | 'MATCH_LOSS'
  | 'PARTNER_CHEER';

export interface BotReactionContext {
  tile?: DominoTile;
  isDouble?: boolean;
  roundScore?: number;
  isOpening66?: boolean;
  isGameLocked?: boolean;
  scoreDiff?: number;
}

export interface BotChatMessage {
  botId: BotId;
  botName: string;
  seat?: PlayerSeat;
  text: string;
  emoji?: string;
  trigger?: BotChatTrigger;
  timestamp: number;
}
