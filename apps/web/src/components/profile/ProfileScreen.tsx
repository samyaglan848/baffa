'use client';

import React, { useEffect, useState } from 'react';
import { UserProfile } from '@baffa/shared';
import { BAFFA_AVATARS, getAvatarById, resolveAvatarUrl } from '../../constants/avatars';
import { HeadToHeadView } from './HeadToHeadView';
import { AvatarSelectorModal } from './AvatarSelectorModal';
import { EditProfileModal } from './EditProfileModal';
import {
  User,
  Trophy,
  Flame,
  Zap,
  Shield,
  Calendar,
  ArrowLeft,
  Lock,
  Mail,
  ShieldCheck,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Loader2,
  KeyRound,
  RefreshCw,
  Edit3,
  Camera,
  Swords,
  Sparkles,
  MapPin,
  Dice5,
} from 'lucide-react';
import { CurrentUser } from '../../hooks/useGameSocket';

interface ProfileScreenProps {
  currentUser: CurrentUser;
  onBackToHome: () => void;
  onLogout?: () => void;
  onProfileUpdated?: (updated: UserProfile) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  currentUser,
  onBackToHome,
  onLogout,
  onProfileUpdated,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`baffa_profile_cache_${currentUser.id}`);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  const [loading, setLoading] = useState(!profile);
  const [activeTab, setActiveTab] = useState<'STATS' | 'SECURITY' | 'HEAD_TO_HEAD'>('STATS');

  // Modals state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const handleConfirmLogout = async () => {
    setLogoutLoading(true);
    try {
      if (currentUser.token) {
        await fetch('http://localhost:4000/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentUser.token}`,
          },
        }).catch(() => {});
      }
    } finally {
      setLogoutLoading(false);
      setShowLogoutConfirmModal(false);
      if (onLogout) {
        onLogout();
      }
    }
  };

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);

  // Email Change State
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailStep, setEmailStep] = useState<1 | 2>(1);

  const fetchProfile = async () => {
    try {
      if (!profile) setLoading(true);
      let effectiveToken = currentUser.token;
      if (!effectiveToken && typeof window !== 'undefined') {
        try {
          effectiveToken = localStorage.getItem('baffa_token') || undefined;
          if (!effectiveToken) {
            const stored = localStorage.getItem('baffa_user');
            if (stored) {
              const parsed = JSON.parse(stored);
              effectiveToken = parsed.token || parsed.id;
            }
          }
        } catch {}
      }

      // Attempt to fetch from authenticated /api/profile/me
      let data: UserProfile | null = null;
      if (effectiveToken) {
        const resMe = await fetch('http://localhost:4000/api/profile/me', {
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
          },
        });
        if (resMe.ok) {
          data = await resMe.json();
        }
      }

      // Fallback to public profile endpoint
      if (!data && currentUser.id) {
        const resPub = await fetch(`http://localhost:4000/api/profile/public/${currentUser.id}`);
        if (resPub.ok) {
          data = await resPub.json();
        }
      }

      // Final fallback to match profile
      if (!data && currentUser.id) {
        const res = await fetch(`http://localhost:4000/api/matches/profile/${currentUser.id}`);
        if (res.ok) {
          data = await res.json();
        }
      }

      if (data) {
        setProfile(data);
        syncLocalStorage(data);
        if (onProfileUpdated) {
          onProfileUpdated(data);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [currentUser.id, currentUser.token]);

  const syncLocalStorage = (updated: UserProfile) => {
    if (typeof window !== 'undefined') {
      try {
        const freshAvatar = updated.customAvatarUrl || updated.avatarUrl || updated.avatarId || 'avatar-1';
        const freshName = updated.displayName || currentUser.username;
        const stored = localStorage.getItem('baffa_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.displayName = updated.displayName;
          parsed.username = freshName;
          parsed.avatar = freshAvatar;
          parsed.avatarId = updated.avatarId;
          parsed.customAvatarUrl = updated.customAvatarUrl;
          localStorage.setItem('baffa_user', JSON.stringify(parsed));
          sessionStorage.setItem('baffa_user', JSON.stringify(parsed));
        } else {
          const newObj = {
            ...currentUser,
            username: freshName,
            avatar: freshAvatar,
          };
          localStorage.setItem('baffa_user', JSON.stringify(newObj));
          sessionStorage.setItem('baffa_user', JSON.stringify(newObj));
        }
        localStorage.setItem(`baffa_profile_cache_${currentUser.id}`, JSON.stringify(updated));
      } catch {}
    }
  };

  const handleProfileUpdated = (updated: UserProfile) => {
    setProfile(updated);
    syncLocalStorage(updated);
    if (onProfileUpdated) {
      onProfileUpdated(updated);
    }
  };

  const getAuthToken = () => {
    if (currentUser.token) return currentUser.token;
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('baffa_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.token) return parsed.token;
        }
      } catch {}
    }
    return currentUser.id || '';
  };

  const handleSelectAvatar = async (avatarId: string) => {
    const token = getAuthToken();
    const res = await fetch('http://localhost:4000/api/profile/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ avatarId }),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    if (!res.ok) throw new Error(data.message || 'فشل تحديث الأفاتار');
    handleProfileUpdated(data);
  };

  const handleUploadImage = async (base64Data: string, mimeType: string) => {
    const token = getAuthToken();
    const res = await fetch('http://localhost:4000/api/profile/me/avatar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ imageBase64: base64Data, mimeType }),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    if (!res.ok) throw new Error(data.message || 'فشل رفع الصورة');
    handleProfileUpdated(data);
  };

  const handleRemoveCustomImage = async () => {
    const token = getAuthToken();
    const res = await fetch('http://localhost:4000/api/profile/me/avatar', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    if (!res.ok) throw new Error(data.message || 'فشل إزالة الصورة');
    handleProfileUpdated(data);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError(null);
    setSecuritySuccess(null);

    if (newPassword !== confirmNewPassword) {
      setSecurityError('كلمة المرور وتأكيد كلمة المرور غير متطابقين');
      return;
    }

    setSecurityLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token || ''}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'فشل تغيير كلمة المرور');

      setSecuritySuccess('تم تغيير كلمة المرور بنجاح! 🎉');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setSecurityError(err.message);
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError(null);
    setSecuritySuccess(null);
    setSecurityLoading(true);

    try {
      const payload: any = { newEmail: newEmailAddress.trim() };
      if (emailStep === 2) payload.code = emailOtpCode.trim();

      const res = await fetch('http://localhost:4000/api/auth/change-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token || ''}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'فشل تحديث البريد');

      if (emailStep === 1) {
        setEmailStep(2);
        setSecuritySuccess('تم إرسال كود التحقق إلى بريدك الجديد.');
      } else {
        setEmailStep(1);
        setNewEmailAddress('');
        setEmailOtpCode('');
        setSecuritySuccess('تم تحديث وتفعيل البريد الإلكتروني الجديد بنجاح! 🎉');
        fetchProfile();
      }
    } catch (err: any) {
      setSecurityError(err.message);
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!confirm('هل أنت متأكد من رغبتك في تسجيل الخروج من جميع الأجهزة المتصلة؟')) return;
    setSecurityLoading(true);
    try {
      await fetch('http://localhost:4000/api/auth/logout-all', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentUser.token || ''}`,
        },
      });
      alert('تم تسجيل الخروج من جميع الأجهزة بنجاح.');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('baffa_user');
      }
      window.location.reload();
    } catch {
      alert('حدث خطأ أثناء تسجيل الخروج');
    } finally {
      setSecurityLoading(false);
    }
  };

  const currentAvatar = getAvatarById(profile?.avatarId);

  const totalMatches = profile?.totalMatches || 0;
  const wins = profile?.matchesWon || 0;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  return (
    <div
      style={{
        maxWidth: '880px',
        margin: '0 auto',
        padding: '32px 16px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        direction: 'rtl',
      }}
    >
      {/* Modals */}
      {showEditModal && profile && (
        <EditProfileModal
          profile={profile}
          token={currentUser.token}
          onProfileUpdated={handleProfileUpdated}
          onOpenAvatarSelector={() => setShowAvatarModal(true)}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showAvatarModal && (
        <AvatarSelectorModal
          currentAvatarUrl={profile?.avatarUrl}
          currentAvatarId={profile?.avatarId}
          customAvatarUrl={profile?.customAvatarUrl}
          token={currentUser.token}
          onSelectAvatar={handleSelectAvatar}
          onUploadImage={handleUploadImage}
          onRemoveCustomImage={handleRemoveCustomImage}
          onClose={() => setShowAvatarModal(false)}
        />
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !logoutLoading) setShowLogoutConfirmModal(false);
          }}
        >
          <div
            className="baffa-card"
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: '#0c1322',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--baffa-radius-xl)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              padding: '28px 24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <LogOut size={26} />
            </div>

            <h3
              className="arabic-font"
              style={{ fontSize: '1.35rem', fontWeight: 900, color: '#fff', margin: '0 0 10px' }}
            >
              تأكيد تسجيل الخروج
            </h3>

            <p style={{ fontSize: '0.9rem', color: 'var(--baffa-text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
              هل أنت متأكد من تسجيل الخروج من حسابك في منصة بَفّة؟
              <br />
              <span style={{ fontSize: '0.78rem', color: 'var(--baffa-text-muted)' }}>
                سيتم إنهاء جلستك الحالية والعودة لشاشة تسجيل الدخول.
              </span>
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleConfirmLogout}
                disabled={logoutLoading}
                className="baffa-btn-danger"
                style={{
                  flex: 1,
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                }}
              >
                {logoutLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> جاري الخروج...
                  </>
                ) : (
                  <>
                    <LogOut size={16} /> نعم، تسجيل الخروج
                  </>
                )}
              </button>

              <button
                onClick={() => setShowLogoutConfirmModal(false)}
                disabled={logoutLoading}
                className="baffa-btn-secondary"
                style={{ flex: 1, padding: '12px', fontSize: '0.9rem' }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1
            className="arabic-font"
            style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--baffa-gold-hover)', margin: 0 }}
          >
            الملف الشخصي والحساب
          </h1>
          <span style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)' }}>
            إحصائيات المباريات، شخصيتك على الطاولة، وإعدادات الأمان
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowLogoutConfirmModal(true)}
            className="baffa-btn-danger"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              padding: '8px 14px',
            }}
          >
            <LogOut size={15} /> تسجيل الخروج
          </button>

          <button onClick={onBackToHome} className="baffa-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> العودة للرئيسية
          </button>
        </div>
      </div>

      {/* Profile Overview Card */}
      <div
        className="baffa-card"
        style={{
          padding: '24px',
          border: '1px solid var(--baffa-surface-glass-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
          position: 'relative',
        }}
      >
        {/* Avatar with Camera Trigger */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setShowAvatarModal(true)}
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              backgroundColor: `${currentAvatar.color}22`,
              color: currentAvatar.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `3px solid ${currentAvatar.color}`,
              boxShadow: `0 0 20px ${currentAvatar.color}44`,
              fontSize: '2.5rem',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
            title="انقر لتغيير الصورة أو الأفاتار"
          >
            {profile?.customAvatarUrl ? (
              <img
                src={resolveAvatarUrl(profile.customAvatarUrl) || profile.customAvatarUrl}
                alt="Profile"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              currentAvatar.emoji
            )}
          </div>

          <button
            onClick={() => setShowAvatarModal(true)}
            style={{
              position: 'absolute',
              bottom: '-2px',
              left: '-2px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--baffa-gold-primary)',
              color: '#000',
              border: '2px solid #0c1322',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
            }}
            title="تغيير الصورة أو الأفاتار"
          >
            <Camera size={14} />
          </button>
        </div>

        {/* User Info */}
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              {profile?.displayName || currentUser.username}
            </h2>
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--baffa-cyan-primary)',
                fontFamily: 'monospace',
                fontWeight: 600,
              }}
            >
              @{currentUser.username}
            </span>

            {profile?.emailVerified ? (
              <span
                style={{
                  fontSize: '0.72rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#10b981',
                  border: '1px solid #10b981',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ShieldCheck size={12} /> موثق
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.72rem',
                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                  color: '#f59e0b',
                  border: '1px solid #f59e0b',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 800,
                }}
              >
                غير موثق
              </span>
            )}
          </div>

          {/* Challenge Slogan Banner */}
          {profile?.challengeSlogan && (
            <div
              style={{
                marginTop: '10px',
                marginBottom: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                color: '#fbbf24',
                fontWeight: 800,
                fontSize: '0.85rem',
                boxShadow: '0 0 15px rgba(245, 158, 11, 0.08)',
              }}
            >
              <Flame size={15} color="#f59e0b" />
              <span>"{profile.challengeSlogan}"</span>
            </div>
          )}

          {/* Bio if exists */}
          {profile?.bio && (
            <p
              style={{
                marginTop: '6px',
                marginBottom: '4px',
                fontSize: '0.82rem',
                color: 'var(--baffa-text-secondary)',
                lineHeight: 1.4,
              }}
            >
              "{profile.bio}"
            </p>
          )}

          {/* Extended Profile Attributes Chips */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '8px',
              flexWrap: 'wrap',
            }}
          >
            {profile?.age && (
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 9px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Calendar size={12} /> {profile.age} سنة
              </span>
            )}

            {profile?.city && (
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 9px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <MapPin size={12} color="var(--baffa-gold-primary)" /> {profile.city}
              </span>
            )}

            {profile?.playStyle && (
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 9px',
                  backgroundColor: 'rgba(6, 182, 212, 0.12)',
                  borderRadius: '12px',
                  color: '#38bdf8',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 700,
                }}
              >
                <Swords size={12} /> {profile.playStyle}
              </span>
            )}

            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--baffa-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginRight: '4px',
              }}
            >
              عضو منذ{' '}
              {profile
                ? new Date(profile.createdAt).toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'short',
                  })
                : 'اليوم'}
            </span>

            {profile?.gender && (
              <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>
                •{' '}
                {profile.gender === 'MALE'
                  ? 'ذكر 👨'
                  : profile.gender === 'FEMALE'
                  ? 'أنثى 👩'
                  : 'أفضل عدم التحديد'}
              </span>
            )}
          </div>
        </div>

        {/* Quick Edit Profile Button */}
        <button
          onClick={() => setShowEditModal(true)}
          className="baffa-btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            padding: '8px 14px',
          }}
        >
          <Edit3 size={15} /> تعديل البيانات
        </button>

        {/* Win Rate Badge */}
        <div
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--baffa-radius-lg)',
            backgroundColor: 'var(--baffa-bg-elevated)',
            border: '1px solid var(--baffa-gold-primary)',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--baffa-gold-primary)', fontWeight: 800, textTransform: 'uppercase' }}>
            نسبة الفوز
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff' }}>
            {winRate}%
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--baffa-surface-glass-border)',
          paddingBottom: '8px',
        }}
      >
        <button
          onClick={() => setActiveTab('STATS')}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--baffa-radius-md)',
            border: 'none',
            backgroundColor: activeTab === 'STATS' ? 'var(--baffa-gold-primary)' : 'transparent',
            color: activeTab === 'STATS' ? '#080d1a' : 'var(--baffa-text-secondary)',
            fontWeight: 800,
            fontSize: '0.88rem',
            cursor: 'pointer',
          }}
        >
          الإحصائيات والنتائج
        </button>

        <button
          onClick={() => setActiveTab('HEAD_TO_HEAD')}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--baffa-radius-md)',
            border: 'none',
            backgroundColor: activeTab === 'HEAD_TO_HEAD' ? 'var(--baffa-gold-primary)' : 'transparent',
            color: activeTab === 'HEAD_TO_HEAD' ? '#080d1a' : 'var(--baffa-text-secondary)',
            fontWeight: 800,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Swords size={16} /> المواجهات المباشرة (Head-to-Head)
        </button>

        <button
          onClick={() => setActiveTab('SECURITY')}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--baffa-radius-md)',
            border: 'none',
            backgroundColor: activeTab === 'SECURITY' ? 'var(--baffa-gold-primary)' : 'transparent',
            color: activeTab === 'SECURITY' ? '#080d1a' : 'var(--baffa-text-secondary)',
            fontWeight: 800,
            fontSize: '0.88rem',
            cursor: 'pointer',
          }}
        >
          الأمان وتسجيل الدخول
        </button>
      </div>

      {/* Tab 1: Stats */}
      {activeTab === 'STATS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 4 Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div className="baffa-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--baffa-text-muted)' }}>
                <Trophy size={18} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>إجمالي المباريات</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', marginTop: '8px' }}>
                {totalMatches}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', marginTop: '4px' }}>
                فوز: {profile?.matchesWon || 0} | خسارة: {profile?.matchesLost || 0}
              </div>
            </div>

            <div className="baffa-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--baffa-cyan-primary)' }}>
                <Zap size={18} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>إجمالي الجولات</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', marginTop: '8px' }}>
                {profile?.totalRounds || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', marginTop: '4px' }}>
                جولات الفوز: {profile?.roundsWon || 0}
              </div>
            </div>

            <div className="baffa-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f97316' }}>
                <Flame size={18} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>سلسلة الفوز الحالية</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', marginTop: '8px' }}>
                {profile?.currentStreak || 0} <span style={{ fontSize: '0.9rem', color: 'var(--baffa-text-muted)' }}>مباريات</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', marginTop: '4px' }}>
                أفضل سلسلة: {profile?.bestStreak || 0}
              </div>
            </div>

            <div className="baffa-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--baffa-gold-primary)' }}>
                <Shield size={18} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>إجمالي البناط المسجلة</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', marginTop: '8px' }}>
                {profile?.totalPipsScored || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', marginTop: '4px' }}>
                في جميع المباريات
              </div>
            </div>
          </div>

          {/* Breakdown: Human vs Bot */}
          <div className="baffa-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>
              تفصيل المباريات (لاعبين حقيقيين ضد بوتات)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: 'var(--baffa-radius-md)', backgroundColor: 'var(--baffa-bg-elevated)', border: '1px solid var(--baffa-surface-glass-border)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--baffa-gold-primary)' }}>
                  ضد لاعبين حقيقيين (Human vs Human)
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginTop: '6px' }}>
                  فوز: {profile?.humanMatchesWon || 0} | خسارة: {profile?.humanMatchesLost || 0}
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 'var(--baffa-radius-md)', backgroundColor: 'var(--baffa-bg-elevated)', border: '1px solid var(--baffa-surface-glass-border)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--baffa-cyan-primary)' }}>
                  ضد بوتات بَفّة (Bots)
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginTop: '6px' }}>
                  فوز: {profile?.botMatchesWon || 0} | خسارة: {profile?.botMatchesLost || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Head to Head Search & View */}
      {activeTab === 'HEAD_TO_HEAD' && (
        <HeadToHeadView currentUserId={currentUser.id} />
      )}

      {/* Tab 3: Security & Password */}
      {activeTab === 'SECURITY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Security alerts */}
          {securityError && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={18} /> {securityError}
            </div>
          )}

          {securitySuccess && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={18} /> {securitySuccess}
            </div>
          )}

          {/* Change Password Form */}
          <div className="baffa-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <KeyRound size={20} color="var(--baffa-gold-primary)" /> تغيير كلمة المرور
            </h3>

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '480px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '4px' }}>
                  كلمة المرور الحالية
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: 'var(--baffa-bg-elevated)',
                    border: '1px solid var(--baffa-surface-glass-border)',
                    color: '#fff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '4px' }}>
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: 'var(--baffa-bg-elevated)',
                    border: '1px solid var(--baffa-surface-glass-border)',
                    color: '#fff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '4px' }}>
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: 'var(--baffa-bg-elevated)',
                    border: '1px solid var(--baffa-surface-glass-border)',
                    color: '#fff',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={securityLoading}
                className="baffa-btn-primary"
                style={{ marginTop: '8px', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {securityLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                تحديث كلمة المرور
              </button>
            </form>
          </div>

          {/* Change Email */}
          <div className="baffa-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Mail size={20} color="var(--baffa-cyan-primary)" /> البريد الإلكتروني المسجل
            </h3>

            <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--baffa-text-secondary)' }}>
              البريد الحالي: <span style={{ color: '#fff', fontWeight: 700 }}>{profile?.email || 'غير مسجل'}</span>
            </div>

            <form onSubmit={handleChangeEmail} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '480px' }}>
              {emailStep === 1 ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '4px' }}>
                    البريد الإلكتروني الجديد
                  </label>
                  <input
                    type="email"
                    value={newEmailAddress}
                    onChange={(e) => setNewEmailAddress(e.target.value)}
                    placeholder="name@example.com"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'var(--baffa-bg-elevated)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                      color: '#fff',
                    }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '4px' }}>
                    أدخل كود التحقق المرسل للبريد الجديد (6 أرقام)
                  </label>
                  <input
                    type="text"
                    value={emailOtpCode}
                    onChange={(e) => setEmailOtpCode(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'var(--baffa-bg-elevated)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                      color: '#fff',
                      letterSpacing: '4px',
                      textAlign: 'center',
                      fontSize: '1.2rem',
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={securityLoading}
                className="baffa-btn-primary"
                style={{ marginTop: '8px', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {securityLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {emailStep === 1 ? 'إرسال كود التحقق' : 'تأكيد وحفظ البريد'}
              </button>
            </form>
          </div>

          {/* Active Sessions & Logout All */}
          <div className="baffa-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <ShieldCheck size={20} color="#f43f5e" /> الجلسات النشطة والأجهزة المتصلة
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)', marginBottom: '16px' }}>
              إذا كنت تشك في اختراق حسابك أو سجلت الدخول من جهاز عام، يمكنك تسجيل الخروج من كافة الأجهزة دفعة واحدة.
            </p>

            <button
              onClick={handleLogoutAll}
              disabled={securityLoading}
              className="baffa-btn-danger"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <LogOut size={16} /> تسجيل الخروج من جميع الأجهزة
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
