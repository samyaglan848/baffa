'use client';

import React, { useState } from 'react';
import { X, Volume2, Mic, Eye, Globe, LogOut, Check } from 'lucide-react';
import { CurrentUser } from '../../hooks/useGameSocket';

interface SettingsModalProps {
  isOpen: boolean;
  currentUser: CurrentUser;
  onClose: () => void;
  onLogout: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onLogout,
}) => {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('baffa_sound_enabled') !== 'false';
    }
    return true;
  });

  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('baffa_voice_enabled') !== 'false';
    }
    return true;
  });

  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('baffa_reduced_motion') === 'true';
    }
    return false;
  });

  const [language, setLanguage] = useState<'ar' | 'en'>('ar');

  const handleToggleSound = (val: boolean) => {
    setSoundEnabled(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('baffa_sound_enabled', String(val));
    }
  };

  const handleToggleVoice = (val: boolean) => {
    setVoiceEnabled(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('baffa_voice_enabled', String(val));
    }
  };

  const handleToggleReducedMotion = (val: boolean) => {
    setReducedMotion(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('baffa_reduced_motion', String(val));
      if (val) {
        document.body.classList.add('reduced-motion');
      } else {
        document.body.classList.remove('reduced-motion');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
      }}
    >
      <div
        className="baffa-card"
        style={{
          width: '90%',
          maxWidth: '460px',
          padding: '28px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '2px solid #f59e0b',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.25), 0 0 35px rgba(245, 158, 11, 0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 className="arabic-font" style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827', margin: 0 }}>
              الإعدادات ⚙️
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              التحكم في الصوت والصورة واللغة
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f3f4f6',
              border: '1px solid #e5e7eb',
              color: '#4b5563',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.color = '#dc2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.color = '#4b5563';
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Sound Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Volume2 size={18} style={{ color: '#d97706' }} />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111827' }}>المؤثرات الصوتية</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>أصوات رمي الدومينو والطاولة</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => handleToggleSound(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
            />
          </div>

          {/* Voice Chat Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Mic size={18} style={{ color: '#d97706' }} />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111827' }}>الدردشة الصوتية</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>بث صوتي حي عبر WebRTC</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => handleToggleVoice(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
            />
          </div>

          {/* Reduced Motion Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Eye size={18} style={{ color: '#d97706' }} />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111827' }}>تقليل الحركات (Reduced Motion)</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>تقليل تأثيرات الحركة للمحافظة على الأداء</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => handleToggleReducedMotion(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
            />
          </div>

          {/* Language Foundation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Globe size={18} style={{ color: '#d97706' }} />
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111827' }}>اللغة (Language)</span>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: '#fcfbf7',
                color: '#111827',
                fontWeight: 700,
                border: '1.5px solid #e5e7eb',
                outline: 'none',
                fontSize: '0.85rem',
              }}
            >
              <option value="ar">العربية (Arabic)</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Account & Logout */}
          {currentUser.token && (
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="baffa-btn-danger"
              style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <LogOut size={16} /> تسجيل الخروج ({currentUser.username})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
