'use client';

import React, { useEffect, useState } from 'react';
import { PublicUserProfile, HeadToHeadStats } from '@baffa/shared';
import { BAFFA_AVATARS, getAvatarById } from '../../constants/avatars';
import {
  X,
  User,
  Trophy,
  Flame,
  Zap,
  Swords,
  Calendar,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  MapPin,
  Dice5,
} from 'lucide-react';
import { API_URL } from '@/config/api';

interface PublicProfileModalProps {
  identifier: string; // username or userId
  currentUserId?: string;
  token?: string;
  onClose: () => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  identifier,
  currentUserId,
  token,
  onClose,
}) => {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [h2h, setH2h] = useState<HeadToHeadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'HEAD_TO_HEAD'>('OVERVIEW');

  useEffect(() => {
    async function loadData() {
      if (!identifier) return;
      setLoading(true);
      setError(null);

      try {
        // 1. Fetch Public Profile
        const res = await fetch(`${API_URL}/api/profile/public/${encodeURIComponent(identifier)}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'لم يتم العثور على الملف الشخصي');
        }
        const data: PublicUserProfile = await res.json();
        setProfile(data);

        // 2. If viewer is logged in and not looking at themselves, fetch Head-to-Head
        if (currentUserId && token && data.id !== currentUserId) {
          try {
            const h2hRes = await fetch(`${API_URL}/api/profile/head-to-head/${data.id}`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            if (h2hRes.ok) {
              const h2hData = await h2hRes.json();
              setH2h(h2hData);
            }
          } catch {
            // H2H is optional
          }
        }
      } catch (err: any) {
        setError(err.message || 'حدث خطأ أثناء تحميل البيانات');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [identifier, currentUserId, token]);

  const currentAvatar = getAvatarById(profile?.avatarId);

  const isSelf = currentUserId && profile && profile.id === currentUserId;

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
          maxHeight: '90vh',
          backgroundColor: '#0c1322',
          border: '1px solid var(--baffa-surface-glass-border)',
          borderRadius: 'var(--baffa-radius-xl)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--baffa-surface-glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--baffa-gold-primary)' }}>
            بطاقة اللاعب (Player Card)
          </span>

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

        {/* Loading State */}
        {loading && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Loader2 size={36} className="animate-spin" color="var(--baffa-gold-primary)" />
            <div style={{ marginTop: '12px', fontSize: '0.9rem', color: 'var(--baffa-text-muted)' }}>
              جاري تحميل ملف اللاعب...
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <AlertCircle size={40} color="#f87171" style={{ margin: '0 auto' }} />
            <div style={{ marginTop: '12px', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
              {error}
            </div>
            <button onClick={onClose} className="baffa-btn-secondary" style={{ marginTop: '16px' }}>
              إغلاق
            </button>
          </div>
        )}

        {/* Profile Content */}
        {!loading && profile && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
            {/* Header Banner & Avatar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '18px',
                padding: '18px',
                borderRadius: 'var(--baffa-radius-lg)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--baffa-surface-glass-border)',
              }}
            >
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  backgroundColor: `${currentAvatar.color}22`,
                  border: `3px solid ${currentAvatar.color}`,
                  boxShadow: `0 0 20px ${currentAvatar.color}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.5rem',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {profile.customAvatarUrl ? (
                  <img
                    src={profile.customAvatarUrl}
                    alt={profile.displayName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  currentAvatar.emoji
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3
                    className="arabic-font"
                    style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}
                  >
                    {profile.displayName}
                  </h3>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--baffa-cyan-primary)',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                    }}
                  >
                    @{profile.username}
                  </span>
                </div>

                {/* Challenge Slogan Banner */}
                {profile.challengeSlogan && (
                  <div
                    style={{
                      marginTop: '8px',
                      marginBottom: '4px',
                      padding: '5px 12px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#fbbf24',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                    }}
                  >
                    <Flame size={14} color="#f59e0b" />
                    <span>"{profile.challengeSlogan}"</span>
                  </div>
                )}

                {/* Bio */}
                {profile.bio && (
                  <p
                    style={{
                      marginTop: '6px',
                      fontSize: '0.82rem',
                      color: 'var(--baffa-text-secondary)',
                      lineHeight: 1.4,
                      margin: '6px 0 0',
                    }}
                  >
                    "{profile.bio}"
                  </p>
                )}

                {/* Extended Attribute Badges */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  {profile.age && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        borderRadius: '10px',
                        color: '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Calendar size={11} /> {profile.age} سنة
                    </span>
                  )}

                  {profile.city && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        borderRadius: '10px',
                        color: '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <MapPin size={11} color="var(--baffa-gold-primary)" /> {profile.city}
                    </span>
                  )}

                  {profile.playStyle && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        backgroundColor: 'rgba(6, 182, 212, 0.12)',
                        borderRadius: '10px',
                        color: '#38bdf8',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 700,
                      }}
                    >
                      <Swords size={11} /> {profile.playStyle}
                    </span>
                  )}

                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--baffa-text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    عضو منذ{' '}
                    {new Date(profile.createdAt).toLocaleDateString('ar-EG', {
                      year: 'numeric',
                      month: 'short',
                    })}
                  </span>

                  {profile.gender && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--baffa-text-muted)' }}>
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
            </div>

            {/* Navigation Tabs (if opponent) */}
            {!isSelf && h2h && (
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '16px',
                  borderBottom: '1px solid var(--baffa-surface-glass-border)',
                  paddingBottom: '8px',
                }}
              >
                <button
                  onClick={() => setActiveTab('OVERVIEW')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    border: 'none',
                    backgroundColor: activeTab === 'OVERVIEW' ? 'var(--baffa-gold-primary)' : 'transparent',
                    color: activeTab === 'OVERVIEW' ? '#080d1a' : 'var(--baffa-text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  الإحصائيات العامة
                </button>

                <button
                  onClick={() => setActiveTab('HEAD_TO_HEAD')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    border: 'none',
                    backgroundColor: activeTab === 'HEAD_TO_HEAD' ? 'var(--baffa-gold-primary)' : 'transparent',
                    color: activeTab === 'HEAD_TO_HEAD' ? '#080d1a' : 'var(--baffa-text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Swords size={14} /> المواجهات المباشرة (ضدك)
                </button>
              </div>
            )}

            {/* Tab 1: Overview & Stats */}
            {activeTab === 'OVERVIEW' && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 4 Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', fontWeight: 600 }}>
                      إجمالي المباريات
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                      {profile.stats.totalMatches}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--baffa-text-muted)', marginTop: '2px' }}>
                      فوز: {profile.stats.matchesWon} | خسارة: {profile.stats.matchesLost}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--baffa-gold-primary)', fontWeight: 600 }}>
                      نسبة الفوز
                    </div>
                    <div
                      style={{
                        fontSize: '1.4rem',
                        fontWeight: 900,
                        color: 'var(--baffa-gold-hover)',
                        marginTop: '2px',
                      }}
                    >
                      {profile.stats.winRate}%
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--baffa-text-muted)', marginTop: '2px' }}>
                      {profile.stats.totalRounds} جولة ملعوبة
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Flame size={14} /> سلسلة الفوز الحالية
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                      {profile.stats.currentStreak} <span style={{ fontSize: '0.8rem', color: 'var(--baffa-text-muted)' }}>مباريات</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--baffa-text-muted)', marginTop: '2px' }}>
                      أفضل سلسلة: {profile.stats.bestStreak}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--baffa-cyan-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Trophy size={14} /> إجمالي البناط المسجلة
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                      {profile.stats.totalPipsScored}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--baffa-text-muted)', marginTop: '2px' }}>
                      في جميع الأدوار
                    </div>
                  </div>
                </div>

                {/* Recent Matches */}
                {profile.recentMatches && profile.recentMatches.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--baffa-text-secondary)', marginBottom: '8px' }}>
                      آخر المباريات المسجلة
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {profile.recentMatches.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--baffa-radius-md)',
                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid var(--baffa-surface-glass-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.8rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                backgroundColor: m.isWinner ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                color: m.isWinner ? '#10b981' : '#f87171',
                              }}
                            >
                              {m.isWinner ? 'فوز 🏆' : 'خسارة'}
                            </span>
                            <span>هدف {m.targetScore} بنط</span>
                          </div>

                          <span style={{ color: 'var(--baffa-text-muted)', fontSize: '0.75rem' }}>
                            {new Date(m.createdAt).toLocaleDateString('ar-EG')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Head-to-Head */}
            {activeTab === 'HEAD_TO_HEAD' && h2h && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--baffa-radius-lg)',
                    backgroundColor: 'rgba(245, 158, 11, 0.05)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: 'var(--baffa-text-secondary)', fontWeight: 600 }}>
                    إجمالي المباريات التي جمعتكم سوياً
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--baffa-gold-hover)', marginTop: '4px' }}>
                    {h2h.totalMatches}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--baffa-text-muted)', marginTop: '2px' }}>
                    فوزك: {h2h.user1Wins} ({h2h.user1WinRate}%) | فوزه: {h2h.user2Wins} ({h2h.user2WinRate}%)
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>جولات فوزك</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--baffa-cyan-primary)', marginTop: '2px' }}>
                      {h2h.user1RoundsWon}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '12px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>جولات فوزه</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--baffa-gold-primary)', marginTop: '2px' }}>
                      {h2h.user2RoundsWon}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
