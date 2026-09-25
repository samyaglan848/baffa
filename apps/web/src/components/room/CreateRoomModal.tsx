'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  PlusCircle,
  Users,
  Bot,
  Shield,
  Eye,
  Mic,
  MicOff,
  Clock,
  MessageSquare,
  MessageSquareOff,
  Smile,
  Gamepad2,
  Gavel,
  Radio,
  Check,
  Sparkles,
} from 'lucide-react';
import { RoomSettings, UserRole } from '@baffa/shared';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, settings: Partial<RoomSettings>, initialRole?: UserRole) => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [roomName, setRoomName] = useState('قعدة بَفّة المعلمين 🎴');
  const [targetScore, setTargetScore] = useState<101 | 151>(101);
  const [roundTimerSeconds, setRoundTimerSeconds] = useState<number>(20);
  const [teamPreset, setTeamPreset] = useState<'SOLO_VS_BOTS' | 'FOUR_HUMANS' | 'TWO_HUMANS_VS_BOTS'>('SOLO_VS_BOTS');
  const [initialRole, setInitialRole] = useState<UserRole>('PLAYER');
  const [allowJudge, setAllowJudge] = useState(true);
  const [allowSpectator, setAllowSpectator] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [quickChatEnabled, setQuickChatEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(
      roomName.trim() || 'قعدة بَفّة المعلمين 🎴',
      {
        targetScore,
        roundTimerSeconds,
        fillWithBots: teamPreset !== 'FOUR_HUMANS' || initialRole !== 'PLAYER',
        allowJudge: allowJudge || initialRole === 'JUDGE',
        allowSpectator: allowSpectator || initialRole === 'SPECTATOR',
        voiceEnabled,
        quickChatEnabled,
        reactionsEnabled,
        maxPlayers: 4,
      },
      initialRole
    );
    onClose();
  };

  const nameSuggestions = ['قعدة بَفّة 🎴', 'طاولة المعلمين ☕', 'دومينو الحبايب 🎲'];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 14, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px',
      }}
    >
      <div
        className="baffa-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          backgroundColor: 'rgba(15, 23, 42, 0.98)',
          border: '1.5px solid rgba(245, 158, 11, 0.35)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(245, 158, 11, 0.15)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Sticky Header */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(11, 18, 30, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div>
            <h2
              className="arabic-font"
              style={{
                fontSize: '1.25rem',
                fontWeight: 900,
                color: 'var(--baffa-gold-hover)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>إنشاء طاولة جديدة</span>
              <span style={{ fontSize: '1.1rem' }}>🎴</span>
            </h2>
            <p
              className="arabic-font"
              style={{
                fontSize: '0.8rem',
                color: 'var(--baffa-text-secondary)',
                margin: '3px 0 0 0',
              }}
            >
              اضبط قوانين الطاولة وتشكيلة اللعب وتفضيلات التواصل
            </p>
          </div>

          {/* Close Button (X) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--baffa-text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
              e.currentTarget.style.color = '#fca5a5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.color = 'var(--baffa-text-secondary)';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          id="create-room-form"
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* 1. Room Name */}
          <div>
            <label
              className="arabic-font"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--baffa-gold-primary)',
                marginBottom: '6px',
              }}
            >
              اسم الغرفة أو القعدة:
            </label>
            <input
              type="text"
              required
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="مثال: قعدة بَفّة المعلمين"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: 'var(--baffa-bg-elevated)',
                border: '1px solid var(--baffa-surface-glass-border)',
                color: '#fff',
                fontSize: '0.95rem',
                fontWeight: 600,
                outline: 'none',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--baffa-gold-primary)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--baffa-surface-glass-border)';
              }}
            />

            {/* Quick Name Suggestions */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
              {nameSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setRoomName(sug)}
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    backgroundColor: roomName === sug ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    color: roomName === sug ? 'var(--baffa-gold-hover)' : 'var(--baffa-text-muted)',
                    border: roomName === sug ? '1px solid var(--baffa-gold-primary)' : '1px solid rgba(255, 255, 255, 0.08)',
                    cursor: 'pointer',
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Your Role in the Room */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label
                className="arabic-font"
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--baffa-gold-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>دورك في الطاولة:</span>
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>
                (يمكنك تغييره لاحقاً في اللوبي)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {/* Player */}
              <button
                type="button"
                onClick={() => setInitialRole('PLAYER')}
                style={{
                  padding: '10px 8px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: initialRole === 'PLAYER' ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                  color: initialRole === 'PLAYER' ? '#080d1a' : '#fff',
                  border: initialRole === 'PLAYER' ? '2px solid var(--baffa-gold-hover)' : '1px solid var(--baffa-surface-glass-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: initialRole === 'PLAYER' ? '0 0 16px rgba(245, 158, 11, 0.4)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <Gamepad2 size={20} />
                <span className="arabic-font" style={{ fontSize: '0.88rem', fontWeight: 800 }}>لاعب أساسي</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.85 }}>تلعب بيدك</span>
              </button>

              {/* Judge */}
              <button
                type="button"
                onClick={() => setInitialRole('JUDGE')}
                style={{
                  padding: '10px 8px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: initialRole === 'JUDGE' ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                  color: initialRole === 'JUDGE' ? '#080d1a' : '#fff',
                  border: initialRole === 'JUDGE' ? '2px solid var(--baffa-gold-hover)' : '1px solid var(--baffa-surface-glass-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: initialRole === 'JUDGE' ? '0 0 16px rgba(245, 158, 11, 0.4)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <Gavel size={20} />
                <span className="arabic-font" style={{ fontSize: '0.88rem', fontWeight: 800 }}>حَكَم الماتش</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.85 }}>إدارة وتحكيم</span>
              </button>

              {/* Spectator */}
              <button
                type="button"
                onClick={() => setInitialRole('SPECTATOR')}
                style={{
                  padding: '10px 8px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: initialRole === 'SPECTATOR' ? 'var(--baffa-cyan-primary)' : 'var(--baffa-bg-elevated)',
                  color: initialRole === 'SPECTATOR' ? '#080d1a' : '#fff',
                  border: initialRole === 'SPECTATOR' ? '2px solid var(--baffa-cyan-primary)' : '1px solid var(--baffa-surface-glass-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: initialRole === 'SPECTATOR' ? '0 0 16px rgba(6, 182, 212, 0.4)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <Eye size={20} />
                <span className="arabic-font" style={{ fontSize: '0.88rem', fontWeight: 800 }}>متفرّج</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.85 }}>مشاهدة حية</span>
              </button>
            </div>

            {initialRole !== 'PLAYER' && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  fontSize: '0.75rem',
                  color: 'var(--baffa-gold-hover)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Sparkles size={14} style={{ flexShrink: 0 }} />
                <span>
                  {initialRole === 'JUDGE'
                    ? 'ستبدأ الطاولة بـ 4 بوتات وتتولى أنت التحكيم وسلطة القرارات دون أوراق مكشوفة لك.'
                    : 'ستلعب 4 بوتات وتجلس أنت متفرجاً للاستمتاع بالمشاهدة والتشجيع.'}
                </span>
              </div>
            )}
          </div>

          {/* 3. Match Rules (Target Score & Thinking Timer) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Target Score */}
            <div>
              <label
                className="arabic-font"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--baffa-gold-primary)',
                  marginBottom: '6px',
                }}
              >
                النقاط للفوز (البنط):
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setTargetScore(101)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: targetScore === 101 ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                    color: targetScore === 101 ? '#080d1a' : '#fff',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    border: targetScore === 101 ? '1px solid var(--baffa-gold-hover)' : '1px solid var(--baffa-surface-glass-border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  101 (كلاسيك)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetScore(151)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: targetScore === 151 ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                    color: targetScore === 151 ? '#080d1a' : '#fff',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    border: targetScore === 151 ? '1px solid var(--baffa-gold-hover)' : '1px solid var(--baffa-surface-glass-border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  151 (بطولة)
                </button>
              </div>
            </div>

            {/* Thinking Time */}
            <div>
              <label
                className="arabic-font"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--baffa-gold-primary)',
                  marginBottom: '6px',
                }}
              >
                <Clock size={14} />
                <span>وقت الدور:</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {[
                  { label: '10ث', sec: 10 },
                  { label: '20ث ⭐', sec: 20 },
                  { label: '30ث', sec: 30 },
                  { label: '60ث', sec: 60 },
                ].map((opt) => {
                  const isSelected = roundTimerSeconds === opt.sec;
                  return (
                    <button
                      key={opt.sec}
                      type="button"
                      onClick={() => setRoundTimerSeconds(opt.sec)}
                      style={{
                        padding: '8px 2px',
                        borderRadius: 'var(--baffa-radius-md)',
                        backgroundColor: isSelected ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                        color: isSelected ? '#080d1a' : '#fff',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        border: isSelected ? '1px solid var(--baffa-gold-hover)' : '1px solid var(--baffa-surface-glass-border)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Team Setup Presets */}
          <div>
            <label
              className="arabic-font"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--baffa-gold-primary)',
                marginBottom: '8px',
              }}
            >
              تشكيلة الطاولة واللاعبين:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {/* Preset 1: Solo vs Bots */}
              <div
                onClick={() => setTeamPreset('SOLO_VS_BOTS')}
                style={{
                  padding: '10px 8px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: teamPreset === 'SOLO_VS_BOTS' ? 'rgba(245, 158, 11, 0.15)' : 'var(--baffa-bg-elevated)',
                  border: teamPreset === 'SOLO_VS_BOTS' ? '2px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Bot size={18} style={{ color: 'var(--baffa-gold-primary)' }} />
                <span className="arabic-font" style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff' }}>
                  سولو ضد البوتات
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--baffa-text-muted)' }}>
                  أنت + بوت ضد 2 بوتات
                </span>
              </div>

              {/* Preset 2: 4 Humans */}
              <div
                onClick={() => setTeamPreset('FOUR_HUMANS')}
                style={{
                  padding: '10px 8px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: teamPreset === 'FOUR_HUMANS' ? 'rgba(245, 158, 11, 0.15)' : 'var(--baffa-bg-elevated)',
                  border: teamPreset === 'FOUR_HUMANS' ? '2px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Users size={18} style={{ color: 'var(--baffa-cyan-primary)' }} />
                <span className="arabic-font" style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff' }}>
                  4 لاعبين بشر
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--baffa-text-muted)' }}>
                  أصحابك عبر الكود
                </span>
              </div>

              {/* Preset 3: 2 Humans vs 2 Bots */}
              <div
                onClick={() => setTeamPreset('TWO_HUMANS_VS_BOTS')}
                style={{
                  padding: '10px 8px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: teamPreset === 'TWO_HUMANS_VS_BOTS' ? 'rgba(245, 158, 11, 0.15)' : 'var(--baffa-bg-elevated)',
                  border: teamPreset === 'TWO_HUMANS_VS_BOTS' ? '2px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Users size={18} style={{ color: '#34d399' }} />
                <span className="arabic-font" style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff' }}>
                  2 بشر ضد 2 بوتات
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--baffa-text-muted)' }}>
                  لعب تعاوني ضد AI
                </span>
              </div>
            </div>
          </div>

          {/* 5. Communication & Access Permissions */}
          <div>
            <label
              className="arabic-font"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--baffa-gold-primary)',
                marginBottom: '8px',
              }}
            >
              <Radio size={14} />
              <span>قنوات التواصل والصلاحيات:</span>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
              {/* Voice Chat */}
              <button
                type="button"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: voiceEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  border: voiceEnabled ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(239, 68, 68, 0.3)',
                  color: voiceEnabled ? '#34d399' : '#f87171',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                }}
              >
                {voiceEnabled ? <Mic size={15} /> : <MicOff size={15} />}
                <span className="arabic-font">المايك: {voiceEnabled ? 'مفعّل' : 'معطّل'}</span>
              </button>

              {/* Quick Chat */}
              <button
                type="button"
                onClick={() => setQuickChatEnabled(!quickChatEnabled)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: quickChatEnabled ? 'rgba(6, 182, 212, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  border: quickChatEnabled ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(239, 68, 68, 0.3)',
                  color: quickChatEnabled ? '#22d3ee' : '#f87171',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                }}
              >
                {quickChatEnabled ? <MessageSquare size={15} /> : <MessageSquareOff size={15} />}
                <span className="arabic-font">الشات: {quickChatEnabled ? 'مفعّل' : 'معطّل'}</span>
              </button>

              {/* Emojis */}
              <button
                type="button"
                onClick={() => setReactionsEnabled(!reactionsEnabled)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: reactionsEnabled ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  border: reactionsEnabled ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(239, 68, 68, 0.3)',
                  color: reactionsEnabled ? '#fbbf24' : '#f87171',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                }}
              >
                <Smile size={15} />
                <span className="arabic-font">الإيموجيز: {reactionsEnabled ? 'مفعّل' : 'معطّل'}</span>
              </button>

              {/* Allow Judge */}
              <button
                type="button"
                onClick={() => setAllowJudge(!allowJudge)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: allowJudge ? 'rgba(139, 92, 246, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  border: allowJudge ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(239, 68, 68, 0.3)',
                  color: allowJudge ? '#a78bfa' : '#f87171',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                }}
              >
                <Shield size={15} />
                <span className="arabic-font">دخول حَكَم: {allowJudge ? 'مسموح' : 'ممنوع'}</span>
              </button>

              {/* Allow Spectator */}
              <button
                type="button"
                onClick={() => setAllowSpectator(!allowSpectator)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: allowSpectator ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  border: allowSpectator ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(239, 68, 68, 0.3)',
                  color: allowSpectator ? '#60a5fa' : '#f87171',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                }}
              >
                <Eye size={15} />
                <span className="arabic-font">المتفرجون: {allowSpectator ? 'مسموح' : 'ممنوع'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Sticky Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(11, 18, 30, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Cancel Button */}
          <button
            type="button"
            onClick={onClose}
            className="baffa-btn-secondary"
            style={{
              padding: '10px 20px',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            إلغاء
          </button>

          {/* Submit Button */}
          <button
            type="submit"
            form="create-room-form"
            className="baffa-btn-primary"
            style={{
              flex: 1,
              padding: '11px 20px',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <PlusCircle size={18} />
            <span className="arabic-font">إنشاء الغرفة والدخول للوبي ⚡</span>
          </button>
        </div>
      </div>
    </div>
  );
};
