import { AvatarCatalogItem } from '@baffa/shared';

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

export const DEFAULT_AVATAR: AvatarCatalogItem = BAFFA_AVATARS[0];

export function getAvatarById(avatarId?: string | null): AvatarCatalogItem {
  if (!avatarId) return DEFAULT_AVATAR;
  const clean = avatarId.toLowerCase().trim();
  const found = BAFFA_AVATARS.find((a) => a.id === clean || a.id === `avatar-${clean}` || a.name === clean);
  return found || DEFAULT_AVATAR;
}

export function resolveAvatarUrl(avatar?: string | null): string | null {
  if (!avatar || typeof avatar !== 'string') return null;
  const trimmed = avatar.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/uploads')) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    return `${apiBase.replace(/\/$/, '')}${trimmed}`;
  }
  return null;
}
