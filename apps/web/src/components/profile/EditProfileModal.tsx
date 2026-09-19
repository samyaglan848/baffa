'use client';

import React, { useState } from 'react';
import { UserProfile, Gender } from '@baffa/shared';
import { BAFFA_AVATARS, getAvatarById } from '../../constants/avatars';
import {
  BAFFA_CHALLENGE_SLOGANS,
  BAFFA_PLAY_STYLES,
  BAFFA_EGYPTIAN_GOVERNORATES,
} from '../../constants/profile-constants';
import {
  X,
  Edit3,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  Camera,
  Flame,
  Swords,
  MapPin,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { API_URL } from '@/config/api';

interface EditProfileModalProps {
  profile: UserProfile;
  token?: string;
  onProfileUpdated: (updated: UserProfile) => void;
  onOpenAvatarSelector: () => void;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  profile,
  token,
  onProfileUpdated,
  onOpenAvatarSelector,
  onClose,
}) => {
  const [displayName, setDisplayName] = useState(profile.displayName || profile.username);
  const [gender, setGender] = useState<Gender | ''>((profile.gender as Gender) || '');
  const [age, setAge] = useState<string>(profile.age ? String(profile.age) : '');
  const [city, setCity] = useState<string>(profile.city || '');
  const [challengeSlogan, setChallengeSlogan] = useState<string>(profile.challengeSlogan || '');
  const [playStyle, setPlayStyle] = useState<string>(profile.playStyle || '');
  const [bio, setBio] = useState(profile.bio || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentAvatar = getAvatarById(profile.avatarId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 30) {
      setError('الاسم الظاهر يجب أن يكون بين 2 و 30 حرفاً');
      return;
    }

    if (age && (isNaN(Number(age)) || Number(age) < 10 || Number(age) > 120)) {
      setError('العمر يجب أن يكون بين 10 و 120 عاماً');
      return;
    }

    if (bio.length > 160) {
      setError('النبذة الشخصية يجب ألا تتجاوز 160 حرفاً');
      return;
    }

    if (challengeSlogan.length > 100) {
      setError('جملة التحدي يجب ألا تتجاوز 100 حرف');
      return;
    }

    setLoading(true);
    try {
      let effectiveToken = token;
      if (!effectiveToken && typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('baffa_user');
          if (stored) {
            const parsed = JSON.parse(stored);
            effectiveToken = parsed.token || parsed.id;
          }
        } catch {}
      }
      if (!effectiveToken) effectiveToken = profile.id;

      const res = await fetch(`${API_URL}/api/profile/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveToken || ''}`,
        },
        body: JSON.stringify({
          displayName: trimmedName,
          gender: gender || null,
          age: age ? Number(age) : null,
          city: city.trim() || null,
          challengeSlogan: challengeSlogan.trim() || null,
          playStyle: playStyle || null,
          bio: bio.trim() || null,
        }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {}

      if (!res.ok) throw new Error(data.message || 'فشل حفظ التعديلات');

      onProfileUpdated(data);
      setSuccess('تم حفظ التعديلات وتحديث ملفك الشخصي بنجاح! 🎉');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="baffa-card"
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '92vh',
          backgroundColor: '#0c1322',
          border: '1px solid var(--baffa-surface-glass-border)',
          borderRadius: 'var(--baffa-radius-xl)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--baffa-surface-glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--baffa-gold-muted)',
                color: 'var(--baffa-gold-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Edit3 size={18} />
            </div>
            <div>
              <h2
                className="arabic-font"
                style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', margin: 0 }}
              >
                تعديل الملف الشخصي
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--baffa-text-muted)' }}>
                بياناتك الشخصية، شعار التحدي، المحافظة، وأسلوب لعبك
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--baffa-text-muted)',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0' }}>
          {/* Avatar & Quick Change Area */}
          <div
            style={{
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              borderBottom: '1px solid var(--baffa-surface-glass-border)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '2px solid var(--baffa-gold-primary)',
                boxShadow: 'var(--baffa-shadow-glow-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
                fontSize: '1.9rem',
              }}
            >
              {profile.customAvatarUrl ? (
                <img
                  src={profile.customAvatarUrl}
                  alt="Avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                currentAvatar.emoji
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>
                {profile.customAvatarUrl ? 'صورة شخصية خاصة' : `أفاتار: ${currentAvatar.titleAr}`}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', marginTop: '2px' }}>
                {profile.customAvatarUrl
                  ? 'تم رفع صورة مخصصة'
                  : currentAvatar.descriptionAr}
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAvatarSelector();
                }}
                style={{
                  marginTop: '6px',
                  padding: '4px 12px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid var(--baffa-gold-primary)',
                  color: 'var(--baffa-gold-hover)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Camera size={14} /> تغيير الأفاتار أو رفع صورة
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Check size={16} /> {success}
              </div>
            )}

            {/* Display Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                الاسم الظاهر على الطاولة (Display Name) <span style={{ color: 'var(--baffa-gold-primary)' }}>*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="مثال: المعلم صبحي"
                maxLength={30}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'var(--baffa-bg-elevated)',
                  border: '1px solid var(--baffa-surface-glass-border)',
                  color: '#fff',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            {/* Age & Governorate Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                  <Calendar size={14} color="var(--baffa-gold-primary)" /> العمر (سنوات)
                </label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="مثال: 24"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: 'var(--baffa-bg-elevated)',
                    border: '1px solid var(--baffa-surface-glass-border)',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                  <MapPin size={14} color="var(--baffa-gold-primary)" /> المحافظة (محافظات مصر)
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: '#162033',
                    border: '1px solid var(--baffa-surface-glass-border)',
                    color: city ? '#fff' : 'var(--baffa-text-muted)',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">اختر محافظتك</option>
                  {BAFFA_EGYPTIAN_GOVERNORATES.map((gov) => (
                    <option key={gov} value={gov} style={{ backgroundColor: '#0c1322', color: '#fff' }}>
                      {gov}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Gender Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                النوع (اختياري)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { label: 'ذكر 👨', value: 'MALE' },
                  { label: 'أنثى 👩', value: 'FEMALE' },
                  { label: 'أفضل عدم التحديد 🤫', value: 'PREFER_NOT_TO_SAY' },
                ].map((opt) => {
                  const isSelected = gender === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGender(isSelected ? '' : (opt.value as Gender))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--baffa-radius-md)',
                        backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.18)' : 'var(--baffa-bg-elevated)',
                        border: isSelected ? '1.5px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
                        color: isSelected ? 'var(--baffa-gold-hover)' : 'var(--baffa-text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Challenge Slogan with Presets / Trash-talk */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', fontWeight: 600 }}>
                  <Flame size={14} color="#f59e0b" /> جملة التحدي وشعار الطاولة (اختر جملة واحدة أو اكتب جملتك الخاصة)
                </label>
                <span style={{ fontSize: '0.72rem', color: 'var(--baffa-text-muted)' }}>
                  {challengeSlogan.length} / 100
                </span>
              </div>
              <input
                type="text"
                value={challengeSlogan}
                onChange={(e) => setChallengeSlogan(e.target.value.slice(0, 100))}
                placeholder="اختر من الجمل بالأسفل أو اكتب جملتك الخاصة..."
                maxLength={100}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'var(--baffa-bg-elevated)',
                  border: '1px solid var(--baffa-surface-glass-border)',
                  color: '#fbbf24',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                }}
              />

              {/* Warning Notice under Slogan */}
              <div
                style={{
                  marginTop: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.73rem',
                  color: '#f59e0b',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                <span>يرجى الالتزام بالروح الرياضية وعدم استخدام أي كلمات غير لائقة أو خادشة للحياء.</span>
              </div>

              {/* Slogan Suggestions / Click-to-pick (Single Selection) */}
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--baffa-text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                  <Sparkles size={13} color="var(--baffa-gold-primary)" /> اضغط لاختيار جملتك المفضلة فوراً:
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    maxHeight: '140px',
                    overflowY: 'auto',
                    padding: '4px 2px',
                  }}
                >
                  {BAFFA_CHALLENGE_SLOGANS.map((slogan, idx) => {
                    const isSelected = challengeSlogan === slogan;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setChallengeSlogan(slogan)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '14px',
                          backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          border: isSelected ? '1.5px solid var(--baffa-gold-primary)' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? '#fbbf24' : 'var(--baffa-text-secondary)',
                          fontSize: '0.78rem',
                          fontWeight: isSelected ? 800 : 500,
                          cursor: 'pointer',
                          textAlign: 'right',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        {isSelected && '✓ '}
                        {slogan}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Play Style Picker */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                <Swords size={14} color="var(--baffa-gold-primary)" /> أسلوب اللعب المفضل
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {BAFFA_PLAY_STYLES.map((style) => {
                  const isSelected = playStyle === style.titleAr;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setPlayStyle(isSelected ? '' : style.titleAr)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--baffa-radius-md)',
                        backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'var(--baffa-bg-elevated)',
                        border: isSelected ? '1.5px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
                        color: isSelected ? '#fff' : 'var(--baffa-text-secondary)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textAlign: 'right',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '1rem' }}>{style.icon}</span>
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {style.titleAr}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bio / About Me with strict content warning */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', fontWeight: 600 }}>
                  نبذة شخصية عنك (Bio)
                </label>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: bio.length > 150 ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {bio.length} / 160
                </span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 160))}
                placeholder="اكتب نبذة بسيطة عنك، متى بدأت تلعب دومينو، أو أسلوبك على القهوة..."
                rows={3}
                maxLength={160}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'var(--baffa-bg-elevated)',
                  border: '1px solid var(--baffa-surface-glass-border)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  resize: 'none',
                }}
              />

              {/* Strict Bio Content Warning */}
              <div
                style={{
                  marginTop: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.72rem',
                  color: '#f87171',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                <span>
                  تنبيه هام: يُمنع تماماً استخدام أي كلمات خادشة للحياء أو وضع أرقام هواتف أو حسابات ووسائل تواصل خارجية منعاً لحظر الحساب.
                </span>
              </div>
            </div>

            {/* Submit Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px', paddingBottom: '4px' }}>
              <button
                type="submit"
                disabled={loading}
                className="baffa-btn-primary"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  fontWeight: 800,
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> جاري الحفظ...
                  </>
                ) : (
                  <>
                    <Check size={16} /> حفظ التعديلات
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="baffa-btn-secondary"
                style={{ padding: '10px 18px' }}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
