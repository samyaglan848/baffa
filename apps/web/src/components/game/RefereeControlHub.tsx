'use client';

import React, { useState } from 'react';
import { SpectatorInfo, TeamId } from '@baffa/shared';

interface RefereeControlHubProps {
  roundNumber: number;
  isMatchActive: boolean;
  isRoundFinished?: boolean;
  spectators?: SpectatorInfo[];
  onVoidRound: (reason?: string) => void;
  onGrantExtraTime: (seconds?: number) => void;
  onTerminateMatch: (winnerTeam?: TeamId, reason?: string) => void;
  onMuteSpectator: (userId: string, muteType: 'CHAT' | 'VOICE', mute: boolean) => void;
  onTriggerBot?: () => void;
  onRequestNextRound?: () => void;
}

export const RefereeControlHub: React.FC<RefereeControlHubProps> = ({
  roundNumber,
  isMatchActive,
  isRoundFinished = false,
  spectators = [],
  onVoidRound,
  onGrantExtraTime,
  onTerminateMatch,
  onMuteSpectator,
  onTriggerBot,
  onRequestNextRound,
}) => {
  const [showSpectatorDrawer, setShowSpectatorDrawer] = useState(false);
  const [showTerminateDialog, setShowTerminateDialog] = useState(false);
  const [selectedWinnerTeam, setSelectedWinnerTeam] = useState<TeamId>(1);
  const [terminateReason, setTerminateReason] = useState('إنهاء المباراة بقرار إداري من الحكم');

  const handleVoidRound = () => {
    onVoidRound('إلغاء وإعادة الجولة بقرار من الحكم');
  };

  const handleExtraTime = () => {
    onGrantExtraTime(20);
  };

  const confirmTerminate = () => {
    onTerminateMatch(selectedWinnerTeam, terminateReason);
    setShowTerminateDialog(false);
  };

  return (
    <>
      {/* Top Floating Referee Ribbon */}
      <div
        dir="rtl"
        style={{
          width: '100%',
          maxWidth: '840px',
          margin: '0 auto',
          padding: '3px 12px',
          background: 'linear-gradient(90deg, rgba(8, 13, 26, 0.95) 0%, rgba(18, 26, 46, 0.95) 50%, rgba(8, 13, 26, 0.95) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.5)',
          borderRadius: '20px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(245, 158, 11, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          boxSizing: 'border-box',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          minHeight: '34px',
        }}
      >
        {/* Judge Badge & Role Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '7px',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid var(--baffa-gold-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.88rem',
              boxShadow: '0 0 8px rgba(245, 158, 11, 0.3)',
            }}
          >
            ⚖️
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="arabic-font" style={{ fontSize: '0.78rem', fontWeight: 900, color: 'var(--baffa-gold-primary)', whiteSpace: 'nowrap' }}>
              تحكم الحكم • ج{roundNumber}
            </span>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                boxShadow: '0 0 6px #22c55e',
                display: 'inline-block',
              }}
            />
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
          {/* Instant Next Round Button when Round Finished */}
          {isRoundFinished && onRequestNextRound && (
            <button
              onClick={onRequestNextRound}
              style={{
                padding: '3px 10px',
                borderRadius: '8px',
                fontSize: '0.74rem',
                fontWeight: 900,
                backgroundColor: 'var(--baffa-gold-primary)',
                color: '#080d1a',
                border: '1px solid var(--baffa-gold-hover)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 0 12px rgba(245, 158, 11, 0.6)',
                animation: 'pulse 1.2s infinite',
                whiteSpace: 'nowrap',
              }}
              title="بدء الجولة التالية فوراً"
            >
              <span>⚡</span>
              <span className="arabic-font">الجولة التالية</span>
            </button>
          )}

          {/* Quick Bot Trigger Button */}
          {onTriggerBot && !isRoundFinished && (
            <button
              onClick={onTriggerBot}
              disabled={!isMatchActive}
              style={{
                padding: '3px 9px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                fontWeight: 800,
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                color: 'var(--baffa-gold-primary)',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                cursor: isMatchActive ? 'pointer' : 'not-allowed',
                opacity: isMatchActive ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
              title="إعطاء إشارة للبوت لبدء ولعب دوره فوراً"
            >
              <span>⚡</span>
              <span className="arabic-font">دور البوت</span>
            </button>
          )}

          {/* Grant Extra Time */}
          <button
            onClick={handleExtraTime}
            disabled={!isMatchActive}
            style={{
              padding: '3px 9px',
              borderRadius: '8px',
              fontSize: '0.72rem',
              fontWeight: 800,
              backgroundColor: 'rgba(8, 51, 68, 0.75)',
              color: '#38bdf8',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              cursor: isMatchActive ? 'pointer' : 'not-allowed',
              opacity: isMatchActive ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
            title="منح 20 ثانية إضافية للتفكير في الدور الحالي"
          >
            <span>⏱️</span>
            <span className="arabic-font">+20ث</span>
          </button>

          {/* Void / Replay Round */}
          <button
            onClick={handleVoidRound}
            disabled={!isMatchActive}
            style={{
              padding: '3px 9px',
              borderRadius: '8px',
              fontSize: '0.72rem',
              fontWeight: 800,
              backgroundColor: 'rgba(69, 26, 3, 0.75)',
              color: '#fde68a',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              cursor: isMatchActive ? 'pointer' : 'not-allowed',
              opacity: isMatchActive ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
            title="إلغاء الجولة وتوزيع كروت جديدة دون تعديل النقاط"
          >
            <span>🔄</span>
            <span className="arabic-font">إعادة الجولة</span>
          </button>

          {/* Spectator Management */}
          <button
            onClick={() => setShowSpectatorDrawer(!showSpectatorDrawer)}
            style={{
              padding: '3px 9px',
              borderRadius: '8px',
              fontSize: '0.72rem',
              fontWeight: 800,
              backgroundColor: 'rgba(23, 23, 23, 0.75)',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
            title="إدارة المشاهدين وكتم الصوت والدردشة"
          >
            <span>👀</span>
            <span className="arabic-font">المشاهدون ({spectators.length})</span>
          </button>

          {/* Terminate Match */}
          <button
            onClick={() => setShowTerminateDialog(true)}
            disabled={!isMatchActive}
            style={{
              padding: '3px 9px',
              borderRadius: '8px',
              fontSize: '0.72rem',
              fontWeight: 800,
              backgroundColor: 'rgba(69, 10, 10, 0.75)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              cursor: isMatchActive ? 'pointer' : 'not-allowed',
              opacity: isMatchActive ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
            title="إنهاء المباراة وإعلان الفائز فوراً"
          >
            <span>🛑</span>
            <span className="arabic-font">إنهاء</span>
          </button>
        </div>
      </div>

      {/* Spectator Management Drawer Modal */}
      {showSpectatorDrawer && (
        <div
          onClick={() => setShowSpectatorDrawer(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(3, 7, 18, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px',
            direction: 'rtl',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: '#0c1322',
              border: '1.5px solid var(--baffa-surface-glass-border)',
              borderRadius: '18px',
              padding: '18px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 800 }}>
                <span>👀</span>
                <span className="arabic-font">قائمة المشاهدين المتواجدين ({spectators.length})</span>
              </div>
              <button
                onClick={() => setShowSpectatorDrawer(false)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
              {spectators.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                  لا يوجد مشاهدون حالياً في الغرفة.
                </p>
              ) : (
                spectators.map((spec) => (
                  <div
                    key={spec.userId}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid var(--baffa-gold-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          color: 'var(--baffa-gold-primary)',
                        }}
                      >
                        {spec.username.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800 }}>{spec.username}</div>
                        <span style={{ fontSize: '0.7rem', color: spec.isConnected ? '#4ade80' : '#94a3b8' }}>
                          {spec.isConnected ? 'متصل' : 'غير متصل'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Toggle Voice Mute */}
                      <button
                        onClick={() => onMuteSpectator(spec.userId, 'VOICE', !spec.isVoiceMuted)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: spec.isVoiceMuted ? '#16a34a' : '#991b1b',
                          color: '#fff',
                        }}
                      >
                        {spec.isVoiceMuted ? 'إلغاء كتم 🔊' : 'كتم مايك 🔇'}
                      </button>

                      {/* Toggle Chat Mute */}
                      <button
                        onClick={() => onMuteSpectator(spec.userId, 'CHAT', !spec.isMuted)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: spec.isMuted ? '#16a34a' : '#c2410c',
                          color: '#fff',
                        }}
                      >
                        {spec.isMuted ? 'فك الشات 💬' : 'كتم شات ❌'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSpectatorDrawer(false)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminate Match Dialog */}
      {showTerminateDialog && (
        <div
          onClick={() => setShowTerminateDialog(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(3, 7, 18, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px',
            direction: 'rtl',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: '#0c1322',
              border: '1.5px solid #ef4444',
              borderRadius: '18px',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.9), 0 0 25px rgba(239, 68, 68, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171' }}>
              <span style={{ fontSize: '1.4rem' }}>🛑</span>
              <h3 className="arabic-font" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>
                إنهاء المباراة رسمياً بقرار إداري
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--baffa-text-muted)' }}>
              اختر الفريق الفائز لاعتماد النتيجة رسمياً وإنهاء كافة الجولات بقرار من حكم الطاولة:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={() => setSelectedWinnerTeam(1)}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: selectedWinnerTeam === 1 ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                  backgroundColor: selectedWinnerTeam === 1 ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                  color: selectedWinnerTeam === 1 ? '#60a5fa' : '#94a3b8',
                }}
              >
                الفريق 1 (المقاعد 1 و 3)
              </button>
              <button
                onClick={() => setSelectedWinnerTeam(2)}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: selectedWinnerTeam === 2 ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                  backgroundColor: selectedWinnerTeam === 2 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255,255,255,0.05)',
                  color: selectedWinnerTeam === 2 ? '#f87171' : '#94a3b8',
                }}
              >
                الفريق 2 (المقاعد 2 و 4)
              </button>
            </div>

            <input
              type="text"
              value={terminateReason}
              onChange={(e) => setTerminateReason(e.target.value)}
              placeholder="سبب الإنهاء الإداري..."
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: '0.82rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                onClick={() => setShowTerminateDialog(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#cbd5e1',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                إلغاء
              </button>
              <button
                onClick={confirmTerminate}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  backgroundColor: '#dc2626',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                تأكيد إنهاء المباراة ⚠️
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
