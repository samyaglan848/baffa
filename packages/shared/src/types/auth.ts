export type DeliveryChannel = 'EMAIL' | 'WHATSAPP';

export type OtpPurpose =
  | 'EMAIL_VERIFICATION'
  | 'PASSWORD_RESET'
  | 'PHONE_VERIFICATION'
  | 'ACCOUNT_RECOVERY';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export type PasswordStrength = 'WEAK' | 'MEDIUM' | 'STRONG' | 'EXCELLENT';

export type Gender = 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';

export interface UserProfile {
  id: string;
  username: string;
  normalizedUsername?: string;
  email?: string | null;
  normalizedEmail?: string | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  displayName: string;
  avatarUrl: string;
  avatarId?: string | null;
  customAvatarUrl?: string | null;
  gender?: Gender | null;
  bio?: string | null;
  age?: number | null;
  challengeSlogan?: string | null;
  city?: string | null;
  playStyle?: string | null;
  favoriteTile?: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  accountStatus: AccountStatus;
  totalMatches: number;
  matchesWon: number;
  matchesLost?: number;
  totalRounds: number;
  roundsWon: number;
  totalPipsScored: number;
  currentStreak: number;
  bestStreak: number;
  humanMatchesWon: number;
  humanMatchesLost: number;
  botMatchesWon: number;
  botMatchesLost: number;
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
  preferredLanguage?: string;
  timezone?: string;
  createdAt: string;
}

export interface UpdateProfileDto {
  displayName?: string;
  bio?: string | null;
  gender?: Gender | null;
  avatarId?: string;
  age?: number | null;
  challengeSlogan?: string | null;
  city?: string | null;
  playStyle?: string | null;
  favoriteTile?: string | null;
}

export interface PublicUserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  avatarId?: string | null;
  customAvatarUrl?: string | null;
  bio?: string | null;
  gender?: Gender | null;
  age?: number | null;
  challengeSlogan?: string | null;
  city?: string | null;
  playStyle?: string | null;
  favoriteTile?: string | null;
  createdAt: string;
  stats: {
    totalMatches: number;
    matchesWon: number;
    matchesLost: number;
    winRate: number;
    totalRounds: number;
    roundsWon: number;
    totalPipsScored: number;
    currentStreak: number;
    bestStreak: number;
    humanMatchesWon: number;
    humanMatchesLost: number;
    botMatchesWon: number;
    botMatchesLost: number;
  };
  recentMatches?: any[];
}

export interface AvatarCatalogItem {
  id: string;
  name: string;
  titleAr: string;
  descriptionAr: string;
  color: string;
  emoji: string;
}

export const BAFFA_AVATARS: AvatarCatalogItem[] = [
  { id: 'avatar-1', name: 'doctor', titleAr: 'الدكتور', descriptionAr: 'حكيم الطاولة وحاسب البناط بالمللي', color: '#06b6d4', emoji: '👨‍⚕️' },
  { id: 'avatar-2', name: 'basha', titleAr: 'الباشا', descriptionAr: 'صاحب القعدة ولعبه دايماً على كبير', color: '#f59e0b', emoji: '👑' },
  { id: 'avatar-3', name: 'maalem', titleAr: 'المعلم', descriptionAr: 'خبير الدومينو وقافل الدور بحرفنة', color: '#10b981', emoji: '🧔' },
  { id: 'avatar-4', name: 'captain', titleAr: 'الكابتن', descriptionAr: 'سريع البديهة وقائد فريقه للانتصار', color: '#3b82f6', emoji: '🧢' },
  { id: 'avatar-5', name: 'prince', titleAr: 'البرنس', descriptionAr: 'أناقة وهدوء وأعصاب من حديد', color: '#8b5cf6', emoji: '🎩' },
  { id: 'avatar-6', name: 'osta', titleAr: 'الأسطى', descriptionAr: 'فاهم التكتيك من أول رمة لآخر بلاطة', color: '#ec4899', emoji: '🛠️' },
  { id: 'avatar-7', name: 'joker', titleAr: 'الجوكر', descriptionAr: 'رمياته غير متوقعة ويفاجئ الخصوم', color: '#ef4444', emoji: '🃏' },
  { id: 'avatar-8', name: 'maleka', titleAr: 'الملكة', descriptionAr: 'سيدة الطاولة وتركيزها يقلب الماتش', color: '#d946ef', emoji: '👸' },
  { id: 'avatar-9', name: 'hanem', titleAr: 'الهانم', descriptionAr: 'ذكاء استراتيجي ولعب هادي وواثق', color: '#14b8a6', emoji: '🧕' },
  { id: 'avatar-10', name: 'general', titleAr: 'الجنرال', descriptionAr: 'انضباط صارم وحساب دقيق لكل خطوة', color: '#64748b', emoji: '🎖️' },
  { id: 'avatar-11', name: 'fannan', titleAr: 'الفنان', descriptionAr: 'يرسم السلسلة بدقة ويمتع الجمهور', color: '#f97316', emoji: '🎨' },
  { id: 'avatar-12', name: 'saqr', titleAr: 'الصقر', descriptionAr: 'عينه على أوراق الخصوم وحركاته حاسمة', color: '#84cc16', emoji: '🦅' },
];

export type AuthUser = UserProfile;

export interface RegisterDto {
  username: string;
  password: string;
  confirmPassword?: string;
  email?: string;
  phone?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface LoginDto {
  usernameOrEmailOrPhone: string;
  password: string;
}

export interface GoogleAuthDto {
  idToken?: string;
  accessToken?: string;
}

export interface GoogleAuthResponse {
  requiresLink?: boolean;
  message?: string;
  email?: string;
  user?: UserProfile;
  tokens?: AuthTokens;
}

export interface LinkGoogleAccountDto {
  idToken?: string;
  accessToken?: string;
  password?: string;
  userId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthSession {
  user: UserProfile;
  tokens: AuthTokens;
}

export interface VerifyEmailDto {
  email: string;
  code: string;
}

export interface ResendVerificationDto {
  email: string;
  channel?: DeliveryChannel;
}

export interface ForgotPasswordDto {
  identifier: string; // username, email, or phone
  channel?: DeliveryChannel;
}

export interface VerifyResetCodeDto {
  identifier: string;
  code: string;
}

export interface ResetPasswordDto {
  identifier: string;
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangeEmailDto {
  newEmail: string;
  code?: string;
}

export interface ChangePhoneDto {
  newPhone: string;
  code?: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  isCurrent?: boolean;
  createdAt: string;
  expiresAt: string;
}
