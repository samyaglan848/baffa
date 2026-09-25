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
        backgroundColor: 'rgba(6, 9, 14, 0.88)',
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
          border: '1px solid var(--baffa-surface-glass-border)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 className="arabic-font" style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--baffa-gold-hover)' }}>
              الإعدادات
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--baffa-text-muted)' }}>
              Preferences & Audio Controls
            </span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--baffa-text-muted)', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Sound Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--baffa-surface-glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Volume2 size={18} style={{ color: 'var(--baffa-gold-primary)' }} />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>Sound Effects</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Tile click & table sounds</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => handleToggleSound(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--baffa-gold-primary)' }}
            />
          </div>

          {/* Voice Chat Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--baffa-surface-glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Mic size={18} style={{ color: 'var(--baffa-cyan-primary)' }} />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>Voice Chat</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>WebRTC audio streaming</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => handleToggleVoice(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--baffa-gold-primary)' }}
            />
          </div>

          {/* Reduced Motion Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--baffa-surface-glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Eye size={18} style={{ color: 'var(--baffa-warning)' }} />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>Reduced Motion</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Minimize animations</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => handleToggleReducedMotion(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--baffa-gold-primary)' }}
            />
          </div>

          {/* Language Foundation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--baffa-surface-glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Globe size={18} style={{ color: 'var(--baffa-text-secondary)' }} />
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>Language (اللغة)</span>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: 'var(--baffa-bg-elevated)',
                color: '#fff',
                border: '1px solid var(--baffa-surface-glass-border)',
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
              <LogOut size={16} /> Sign Out ({currentUser.username})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
