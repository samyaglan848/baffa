'use client';

import React, { useState } from 'react';
import { BotId, OFFICIAL_BAFFA_BOTS, PlayerSeat, SanitizedPlayerState, SpectatorInfo } from '@baffa/shared';

interface RefereeDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlayer: SanitizedPlayerState | null;
  spectators?: SpectatorInfo[];
  onWarnPlayer: (seat: PlayerSeat, reason: string) => void;
  onDirectRedCard: (seat: PlayerSeat, reason: string) => void;
  onMuteAction: (
    targetType: 'SEAT' | 'SPECTATOR',
    identifier: { seat?: PlayerSeat; userId?: string },
    muteType: 'CHAT' | 'REACTIONS' | 'VOICE',
    mute: boolean
  ) => void;
  onSubSeat: (
    action: 'KICK_TO_SPECTATOR' | 'RETURN_FROM_SPECTATOR' | 'SUB_SPECTATOR_TO_SEAT',
    seat: PlayerSeat,
    spectatorUserId?: string,
    botId?: BotId
  ) => void;
}

const QUICK_REASONS = [
  'إشارات أو تلميحات مخالفة',
  'كلام مشبوه في المايك',
  'تنسيق غير قانوني مع الزميل',
  'تعطيل وتأخير متعمد للعب',
  'سلوك غير رياضي أو استفزازي',
];

export const RefereeDecisionModal: React.FC<RefereeDecisionModalProps> = ({
  isOpen,
  onClose,
  targetPlayer,
  spectators = [],
  onWarnPlayer,
  onDirectRedCard,
  onMuteAction,
  onSubSeat,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(QUICK_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'CARDS' | 'MUTE' | 'SUB'>('CARDS');
  const [selectedSpectatorId, setSelectedSpectatorId] = useState<string>('');
  const [selectedBotId, setSelectedBotId] = useState<BotId>('EL_RAYEQ');

  const [isMobile, setIsMobile] = useState(false);
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isOpen || !targetPlayer) return null;

  const currentWarnings = targetPlayer.warnings || 0;
  const reasonToSubmit = customReason.trim() || selectedReason;

  const handleWarn = () => {
    onWarnPlayer(Number(targetPlayer.seat) as PlayerSeat, reasonToSubmit);
    onClose();
  };

  const handleDirectRed = () => {
    onDirectRedCard(Number(targetPlayer.seat) as PlayerSeat, reasonToSubmit);
    onClose();
  };

  const handleKickToSpectator = () => {
    onSubSeat('KICK_TO_SPECTATOR', Number(targetPlayer.seat) as PlayerSeat, undefined, selectedBotId);
    onClose();
  };

  const handleReturnSpectator = (spectatorId?: string) => {
    const specId = spectatorId || selectedSpectatorId || targetPlayer.originalPlayerId || (spectators[0]?.userId ?? '');
    if (!specId) return;
    onSubSeat('RETURN_FROM_SPECTATOR', Number(targetPlayer.seat) as PlayerSeat, specId);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        direction: 'rtl',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#0c1322',
          border: '1.5px solid var(--baffa-gold-primary)',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 25px rgba(245, 158, 11, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#fff',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? '10px 14px' : '16px 20px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(12, 19, 34, 0.95) 100%)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
            <div
              style={{
                width: isMobile ? '32px' : '42px',
                height: isMobile ? '32px' : '42px',
                borderRadius: isMobile ? '8px' : '12px',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1.5px solid var(--baffa-gold-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isMobile ? '1.1rem' : '1.4rem',
                boxShadow: '0 0 12px rgba(245, 158, 11, 0.3)',
              }}
            >
              ⚖️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  className="arabic-font"
                  style={{
                    fontSize: isMobile ? '0.68rem' : '0.75rem',
                    fontWeight: 800,
                    color: 'var(--baffa-gold-primary)',
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    padding: '1px 6px',
                    borderRadius: '8px',
                  }}
                >
                  لوحة قرارات الحكم
                </span>
                <span style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: 'var(--baffa-text-muted)' }}>
                  فريق {targetPlayer.team}
                </span>
              </div>
              <div style={{ fontSize: isMobile ? '0.95rem' : '1.15rem', fontWeight: 900, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{targetPlayer.username}</span>
                {targetPlayer.isBot && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      backgroundColor: 'rgba(6, 182, 212, 0.15)',
                      border: '1px solid rgba(6, 182, 212, 0.4)',
                      color: '#38bdf8',
                      padding: '1px 5px',
                      borderRadius: '4px',
                    }}
                  >
                    بوت
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: isMobile ? '28px' : '32px',
              height: isMobile ? '28px' : '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--baffa-text-muted)',
              fontSize: '0.9rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="إغلاق النافذة"
          >
            ✕
          </button>
        </div>

        {/* Disciplinary Status Strip */}
        <div
          style={{
            padding: isMobile ? '6px 14px' : '10px 20px',
            backgroundColor: 'rgba(6, 10, 18, 0.6)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: isMobile ? '0.72rem' : '0.8rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--baffa-text-muted)' }}>الإنذارات:</span>
            {currentWarnings === 0 && (
              <span style={{ color: '#4ade80', fontWeight: 800 }}>نظيف (0/2)</span>
            )}
            {currentWarnings === 1 && (
              <span
                style={{
                  color: '#fbbf24',
                  fontWeight: 900,
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                }}
              >
                🟨 كارت أصفر (1/2)
              </span>
            )}
            {currentWarnings >= 2 && (
              <span
                style={{
                  color: '#f87171',
                  fontWeight: 900,
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                }}
              >
                🟥 إنذاران (2/2) - غش
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {targetPlayer.isVoiceMuted && (
              <span style={{ fontSize: '0.65rem', color: '#f87171', backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '1px 5px', borderRadius: '4px' }}>
                صوت 🔇
              </span>
            )}
            {targetPlayer.isChatMuted && (
              <span style={{ fontSize: '0.65rem', color: '#fb923c', backgroundColor: 'rgba(249, 115, 22, 0.15)', padding: '1px 5px', borderRadius: '4px' }}>
                شات 💬
              </span>
            )}
            {targetPlayer.isReactionsMuted && (
              <span style={{ fontSize: '0.65rem', color: '#facc15', backgroundColor: 'rgba(234, 179, 8, 0.15)', padding: '1px 5px', borderRadius: '4px' }}>
                إيموجي 🙂
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            padding: isMobile ? '4px 8px' : '6px 12px',
            gap: isMobile ? '4px' : '8px',
            backgroundColor: 'rgba(8, 13, 26, 0.8)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            onClick={() => setActiveTab('CARDS')}
            style={{
              flex: 1,
              padding: isMobile ? '6px 8px' : '8px 12px',
              borderRadius: isMobile ? '8px' : '10px',
              border: 'none',
              fontSize: isMobile ? '0.74rem' : '0.85rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              backgroundColor: activeTab === 'CARDS' ? 'var(--baffa-gold-primary)' : 'transparent',
              color: activeTab === 'CARDS' ? '#080d1a' : 'var(--baffa-text-muted)',
              boxShadow: activeTab === 'CARDS' ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none',
            }}
          >
            <span>🟨🟥</span>
            <span className="arabic-font">{isMobile ? 'الكروت' : 'الإنذارات والكروت'}</span>
          </button>

          <button
            onClick={() => setActiveTab('MUTE')}
            style={{
              flex: 1,
              padding: isMobile ? '6px 8px' : '8px 12px',
              borderRadius: isMobile ? '8px' : '10px',
              border: 'none',
              fontSize: isMobile ? '0.74rem' : '0.85rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              backgroundColor: activeTab === 'MUTE' ? 'var(--baffa-gold-primary)' : 'transparent',
              color: activeTab === 'MUTE' ? '#080d1a' : 'var(--baffa-text-muted)',
              boxShadow: activeTab === 'MUTE' ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none',
            }}
          >
            <span>🔇</span>
            <span className="arabic-font">{isMobile ? 'الكتم' : 'الكتم والمايك'}</span>
          </button>

          <button
            onClick={() => setActiveTab('SUB')}
            style={{
              flex: 1,
              padding: isMobile ? '6px 8px' : '8px 12px',
              borderRadius: isMobile ? '8px' : '10px',
              border: 'none',
              fontSize: isMobile ? '0.74rem' : '0.85rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              backgroundColor: activeTab === 'SUB' ? 'var(--baffa-gold-primary)' : 'transparent',
              color: activeTab === 'SUB' ? '#080d1a' : 'var(--baffa-text-muted)',
              boxShadow: activeTab === 'SUB' ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none',
            }}
          >
            <span>🤖</span>
            <span className="arabic-font">{isMobile ? 'التبديل' : 'التبديل والطرد'}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: isMobile ? '12px 14px' : '20px', display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px', maxHeight: isMobile ? '62vh' : '420px', overflowY: 'auto' }}>
          {/* TAB 1: CARDS & CHEATING */}
          {activeTab === 'CARDS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '16px' }}>
              <div>
                <label className="arabic-font" style={{ fontSize: isMobile ? '0.76rem' : '0.85rem', color: 'var(--baffa-text-muted)', marginBottom: isMobile ? '4px' : '8px', display: 'block' }}>
                  سبب القرار / نوع المخالفة:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? '4px' : '6px', marginBottom: isMobile ? '6px' : '10px' }}>
                  {QUICK_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => {
                        setSelectedReason(reason);
                        setCustomReason('');
                      }}
                      style={{
                        padding: isMobile ? '4px 8px' : '6px 12px',
                        borderRadius: isMobile ? '6px' : '8px',
                        fontSize: isMobile ? '0.72rem' : '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: selectedReason === reason && !customReason ? '1.5px solid var(--baffa-gold-primary)' : '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: selectedReason === reason && !customReason ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.04)',
                        color: selectedReason === reason && !customReason ? 'var(--baffa-gold-primary)' : '#cbd5e1',
                      }}
                    >
                      {reason}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="أو اكتب سبباً مخصصاً هنا..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: isMobile ? '7px 10px' : '9px 12px',
                    borderRadius: isMobile ? '6px' : '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: isMobile ? '0.78rem' : '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '10px', marginTop: '4px' }}>
                {/* Yellow Card Button */}
                <button
                  onClick={handleWarn}
                  style={{
                    padding: isMobile ? '8px 12px' : '12px 16px',
                    borderRadius: isMobile ? '10px' : '12px',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    border: '1.5px solid var(--baffa-gold-primary)',
                    color: '#fde68a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px' }}>
                    <span style={{ fontSize: isMobile ? '1.1rem' : '1.4rem' }}>🟨</span>
                    <div style={{ textAlign: 'right' }}>
                      <div className="arabic-font" style={{ fontSize: isMobile ? '0.82rem' : '0.95rem', fontWeight: 900, color: '#fbbf24' }}>
                        {currentWarnings === 0 ? 'توجيه إنذار رسمي (كارت أصفر أول)' : 'توجيه إنذار ثانٍ (احتساب غش تلقائي)'}
                      </div>
                      <div style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: 'rgba(253, 230, 138, 0.7)' }}>
                        {currentWarnings === 0
                          ? 'الإنذار الأول تحذير رسمي على الطاولة دون إنهاء الجولة.'
                          : 'الإنذار الثاني يؤدي فوراً لاحتساب غش وإنهاء الجولة ومنح نقاطها للمنافس.'}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: isMobile ? '0.75rem' : '0.9rem', fontWeight: 900 }}>تنفيذ ⚡</span>
                </button>

                {/* Direct Red Card Button */}
                <button
                  onClick={handleDirectRed}
                  style={{
                    padding: isMobile ? '8px 12px' : '12px 16px',
                    borderRadius: isMobile ? '10px' : '12px',
                    backgroundColor: 'rgba(220, 38, 38, 0.15)',
                    border: '1.5px solid #ef4444',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px' }}>
                    <span style={{ fontSize: isMobile ? '1.1rem' : '1.4rem' }}>🟥</span>
                    <div style={{ textAlign: 'right' }}>
                      <div className="arabic-font" style={{ fontSize: isMobile ? '0.82rem' : '0.95rem', fontWeight: 900, color: '#f87171' }}>
                        كارت أحمر مباشر (احتساب غش فوري)
                      </div>
                      <div style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: 'rgba(252, 165, 165, 0.7)' }}>
                        إنهاء الجولة فوراً، واعتماد حالة غش رسمية وحساب نقاط اليدين للفريق الآخر.
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: isMobile ? '0.75rem' : '0.9rem', fontWeight: 900 }}>تأكيد ⚠️</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: MUTES & DISCIPLINE */}
          {activeTab === 'MUTE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '12px' }}>
              <p style={{ fontSize: isMobile ? '0.72rem' : '0.8rem', color: 'var(--baffa-text-muted)', margin: 0 }}>
                تحكم فوري في قنوات التواصل الخاصة بهذا اللاعب لمنع التلميحات أو السلوك غير اللائق:
              </p>

              {/* Voice Mute Row */}
              <div
                style={{
                  padding: isMobile ? '8px 12px' : '12px 16px',
                  borderRadius: isMobile ? '10px' : '12px',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px' }}>
                  <span style={{ fontSize: isMobile ? '1.1rem' : '1.3rem' }}>🎙️</span>
                  <div>
                    <div className="arabic-font" style={{ fontSize: isMobile ? '0.82rem' : '0.9rem', fontWeight: 800 }}>
                      الميكروفون والصوت
                    </div>
                    <div style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: 'var(--baffa-text-muted)' }}>
                      {targetPlayer.isVoiceMuted ? 'المايك مكتوم حالياً بقرار من الحكم' : 'المايك مفتوح ويمكنه التحدث'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onMuteAction('SEAT', { seat: targetPlayer.seat }, 'VOICE', !targetPlayer.isVoiceMuted);
                    onClose();
                  }}
                  style={{
                    padding: isMobile ? '4px 10px' : '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: isMobile ? '0.72rem' : '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    backgroundColor: targetPlayer.isVoiceMuted ? '#22c55e' : '#ef4444',
                    color: '#fff',
                  }}
                >
                  {targetPlayer.isVoiceMuted ? 'إلغاء الكتم 🔊' : 'كتم المايك 🔇'}
                </button>
              </div>

              {/* Chat Mute Row */}
              <div
                style={{
                  padding: isMobile ? '8px 12px' : '12px 16px',
                  borderRadius: isMobile ? '10px' : '12px',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px' }}>
                  <span style={{ fontSize: isMobile ? '1.1rem' : '1.3rem' }}>💬</span>
                  <div>
                    <div className="arabic-font" style={{ fontSize: isMobile ? '0.82rem' : '0.9rem', fontWeight: 800 }}>
                      الدردشة والرسائل السريعة
                    </div>
                    <div style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: 'var(--baffa-text-muted)' }}>
                      {targetPlayer.isChatMuted ? 'الشات محظور عنه حالياً' : 'يمكنه كتابة الرسائل السريعة'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onMuteAction('SEAT', { seat: targetPlayer.seat }, 'CHAT', !targetPlayer.isChatMuted);
                    onClose();
                  }}
                  style={{
                    padding: isMobile ? '4px 10px' : '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: isMobile ? '0.72rem' : '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    backgroundColor: targetPlayer.isChatMuted ? '#22c55e' : '#ef4444',
                    color: '#fff',
                  }}
                >
                  {targetPlayer.isChatMuted ? 'إلغاء الكتم 💬' : 'كتم الشات ❌'}
                </button>
              </div>

              {/* Reactions Mute Row */}
              <div
                style={{
                  padding: isMobile ? '8px 12px' : '12px 16px',
                  borderRadius: isMobile ? '10px' : '12px',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px' }}>
                  <span style={{ fontSize: isMobile ? '1.1rem' : '1.3rem' }}>🙂</span>
                  <div>
                    <div className="arabic-font" style={{ fontSize: isMobile ? '0.82rem' : '0.9rem', fontWeight: 800 }}>
                      التفاعلات والإيموجي
                    </div>
                    <div style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: 'var(--baffa-text-muted)' }}>
                      {targetPlayer.isReactionsMuted ? 'التفاعلات محظورة عنه حالياً' : 'يمكنه إرسال الإيموجيز'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onMuteAction('SEAT', { seat: targetPlayer.seat }, 'REACTIONS', !targetPlayer.isReactionsMuted);
                    onClose();
                  }}
                  style={{
                    padding: isMobile ? '4px 10px' : '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: isMobile ? '0.72rem' : '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    backgroundColor: targetPlayer.isReactionsMuted ? '#22c55e' : '#ef4444',
                    color: '#fff',
                  }}
                >
                  {targetPlayer.isReactionsMuted ? 'إلغاء الحظر 🙂' : 'كتم التفاعلات ❌'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SUBSTITUTION & SPECTATOR MANAGEMENT */}
          {activeTab === 'SUB' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '14px' }}>
              {/* Current Seat Occupant Context */}
              <div
                style={{
                  padding: isMobile ? '8px 10px' : '12px 14px',
                  borderRadius: isMobile ? '10px' : '12px',
                  backgroundColor: targetPlayer.isBot ? 'rgba(6, 182, 212, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: targetPlayer.isBot ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? '8px' : '12px',
                }}
              >
                <div style={{ fontSize: isMobile ? '1.2rem' : '1.6rem' }}>{targetPlayer.isBot ? '🤖' : '👤'}</div>
                <div>
                  <div style={{ fontSize: isMobile ? '0.78rem' : '0.9rem', fontWeight: 900, color: targetPlayer.isBot ? '#38bdf8' : '#fca5a5' }}>
                    {targetPlayer.isBot ? 'المقعد يشغله حالياً بوت:' : 'المقعد يشغله لاعب حقيقي:'}{' '}
                    <span style={{ color: '#fff' }}>{targetPlayer.username}</span>
                  </div>
                  <div style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: 'rgba(255, 255, 255, 0.7)', marginTop: '2px' }}>
                    {targetPlayer.isBot
                      ? 'يمكنك تبديل هذا البوت ببوت مصري آخر فوراً وسيلعب مباشرة دون إضافته للمشاهدين.'
                      : 'سيتم نقل اللاعب إلى مقاعد المشاهدين فوراً واستبداله بالبوت المختار، ويمكنك إعادته للطاولة متى أردت.'}
                  </div>
                </div>
              </div>

              {/* Egyptian Bot Selection Grid */}
              <div
                style={{
                  padding: isMobile ? '10px' : '14px',
                  borderRadius: isMobile ? '10px' : '14px',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isMobile ? '8px' : '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="arabic-font" style={{ fontSize: isMobile ? '0.82rem' : '0.92rem', fontWeight: 900, color: 'var(--baffa-gold-primary)' }}>
                    🤖 اختر البوت المصري الذي تريده أن يلعب:
                  </div>
                  <span style={{ fontSize: isMobile ? '0.66rem' : '0.72rem', color: 'var(--baffa-text-muted)' }}>
                    البوت المختار: <b style={{ color: '#fbbf24' }}>{OFFICIAL_BAFFA_BOTS[selectedBotId]?.arabicName}</b>
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(110px, 1fr))' : 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: isMobile ? '6px' : '8px',
                    maxHeight: isMobile ? '160px' : '200px',
                    overflowY: 'auto',
                    padding: '2px',
                  }}
                >
                  {(Object.keys(OFFICIAL_BAFFA_BOTS) as BotId[]).map((bId) => {
                    const bot = OFFICIAL_BAFFA_BOTS[bId];
                    const isSelected = selectedBotId === bId;
                    const diffColors: Record<string, { bg: string; text: string; label: string }> = {
                      WEAK: { bg: 'rgba(34, 197, 94, 0.2)', text: '#4ade80', label: 'ضعيف' },
                      MEDIUM: { bg: 'rgba(234, 179, 8, 0.2)', text: '#facc15', label: 'متوسط' },
                      PRO: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa', label: 'محترف' },
                      EXPERT: { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171', label: 'خبير' },
                    };
                    const diff = diffColors[bot.difficulty] || diffColors.MEDIUM;
                    const botEmojis: Record<BotId, string> = {
                      EL_RAYEQ: '☕',
                      EL_QETT: '😼',
                      EL_TITO: '🔥',
                      RAQAM_WAHED: '👑',
                      EL_HEMA: '🧠',
                      EL_HOBA: '⚡',
                      EL_SAMY: '🎯',
                    };

                    return (
                      <button
                        key={bId}
                        type="button"
                        onClick={() => setSelectedBotId(bId)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          padding: isMobile ? '6px 8px' : '8px 10px',
                          borderRadius: isMobile ? '8px' : '10px',
                          backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 41, 59, 0.7)',
                          border: isSelected ? '2px solid var(--baffa-gold-primary)' : '1px solid rgba(255, 255, 255, 0.1)',
                          cursor: 'pointer',
                          textAlign: 'right',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 0 12px rgba(245, 158, 11, 0.35)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '3px' }}>
                          <span style={{ fontSize: isMobile ? '1rem' : '1.2rem' }}>{botEmojis[bId] || '🤖'}</span>
                          <span
                            style={{
                              fontSize: isMobile ? '0.6rem' : '0.65rem',
                              fontWeight: 800,
                              backgroundColor: diff.bg,
                              color: diff.text,
                              padding: '1px 4px',
                              borderRadius: '4px',
                            }}
                          >
                            {diff.label}
                          </span>
                        </div>
                        <div style={{ fontSize: isMobile ? '0.75rem' : '0.85rem', fontWeight: 900, color: isSelected ? 'var(--baffa-gold-primary)' : '#fff' }}>
                          {bot.arabicName}
                        </div>
                        <div style={{ fontSize: isMobile ? '0.62rem' : '0.68rem', color: '#94a3b8', marginTop: '2px', lineHeight: 1.2 }}>
                          {bot.personality.slice(0, 24)}...
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Confirm Substitution Button */}
                <button
                  type="button"
                  onClick={handleKickToSpectator}
                  style={{
                    marginTop: '4px',
                    padding: isMobile ? '8px 12px' : '11px 16px',
                    borderRadius: isMobile ? '8px' : '10px',
                    backgroundColor: targetPlayer.isBot ? '#0284c7' : '#e11d48',
                    color: '#fff',
                    border: 'none',
                    fontSize: isMobile ? '0.78rem' : '0.88rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: targetPlayer.isBot
                      ? '0 4px 14px rgba(2, 132, 199, 0.4)'
                      : '0 4px 14px rgba(225, 29, 72, 0.4)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span>{targetPlayer.isBot ? '🔄' : '⚡'}</span>
                  <span>
                    {targetPlayer.isBot
                      ? `استبدال بـ (${OFFICIAL_BAFFA_BOTS[selectedBotId]?.arabicName})`
                      : `طرد للمشاهدين واستبدال بـ (${OFFICIAL_BAFFA_BOTS[selectedBotId]?.arabicName})`}
                  </span>
                </button>
              </div>

              {/* Spectator Restoration Section */}
              <div
                style={{
                  padding: isMobile ? '10px' : '14px',
                  borderRadius: isMobile ? '10px' : '14px',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isMobile ? '8px' : '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="arabic-font" style={{ fontSize: isMobile ? '0.82rem' : '0.92rem', fontWeight: 900, color: '#38bdf8' }}>
                    👥 قائمة المشاهدين وإعادتهم للمقعد ({spectators.length})
                  </div>
                  <span style={{ fontSize: isMobile ? '0.66rem' : '0.72rem', color: 'var(--baffa-text-muted)' }}>
                    المقعد المستهدف: <b style={{ color: '#fff' }}>مقعد {Number(targetPlayer.seat) + 1}</b>
                  </span>
                </div>

                {spectators.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '6px' : '8px' }}>
                    <div style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: '#94a3b8' }}>
                      اضغط على زر الإعادة لإرجاع أي متفرج من القائمة إلى هذا المقعد فوراً:
                    </div>
                    {spectators.map((s) => (
                      <div
                        key={s.userId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: isMobile ? '6px 10px' : '8px 12px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(30, 41, 59, 0.7)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '8px' }}>
                          <span style={{ fontSize: isMobile ? '1rem' : '1.1rem' }}>👤</span>
                          <div>
                            <div style={{ fontSize: isMobile ? '0.78rem' : '0.85rem', fontWeight: 800, color: '#fff' }}>{s.username}</div>
                            <div style={{ fontSize: isMobile ? '0.64rem' : '0.68rem', color: '#64748b' }}>
                              {s.isConnected ? 'متصل الآن 🟢' : 'غير متصل 🔴'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleReturnSpectator(s.userId)}
                          style={{
                            padding: isMobile ? '4px 8px' : '6px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--baffa-gold-primary)',
                            color: '#080d1a',
                            border: 'none',
                            fontSize: isMobile ? '0.72rem' : '0.78rem',
                            fontWeight: 900,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>↩️</span>
                          <span>إرجاع</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: isMobile ? '8px 10px' : '12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px dashed rgba(255, 255, 255, 0.15)',
                      textAlign: 'center',
                      fontSize: isMobile ? '0.72rem' : '0.8rem',
                      color: 'var(--baffa-text-muted)',
                      lineHeight: 1.4,
                    }}
                  >
                    لا يوجد مشاهدون حالياً في الغرفة. عند نقل أي لاعب بشري للمشاهدين سيظهر اسمه هنا، ويمكنك إعادته إلى هذا المقعد في أي وقت لاحقاً.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
