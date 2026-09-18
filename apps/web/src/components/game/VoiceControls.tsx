'use client';

import React from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceControlsProps {
  isMuted: boolean;
  isAdminDisabled?: boolean;
  isJudgeMuted?: boolean;
  activePeersCount?: number;
  onToggleMute: () => void;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  isMuted,
  isAdminDisabled = false,
  isJudgeMuted = false,
  activePeersCount = 0,
  onToggleMute,
}) => {
  const isRestricted = isAdminDisabled || isJudgeMuted;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={onToggleMute}
        className="arabic-font"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 15px',
          borderRadius: '24px',
          backgroundColor: isRestricted
            ? 'rgba(239, 68, 68, 0.15)'
            : 'rgba(12, 20, 32, 0.94)',
          border: isRestricted
            ? '1.5px solid rgba(239, 68, 68, 0.65)'
            : isMuted
            ? '1.5px solid rgba(239, 68, 68, 0.75)'
            : '1.5px solid rgba(16, 185, 129, 0.75)',
          boxShadow: isRestricted
            ? '0 4px 18px rgba(0, 0, 0, 0.75), 0 0 14px rgba(239, 68, 68, 0.35)'
            : isMuted
            ? '0 4px 18px rgba(0, 0, 0, 0.75), 0 0 14px rgba(239, 68, 68, 0.35)'
            : '0 4px 18px rgba(0, 0, 0, 0.75), 0 0 14px rgba(16, 185, 129, 0.35)',
          backdropFilter: 'blur(12px)',
          color: isRestricted || isMuted ? '#fca5a5' : '#6ee7b7',
          fontSize: '0.86rem',
          fontWeight: 800,
          cursor: 'pointer',
          transition: 'all 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = isRestricted || isMuted
            ? '0 6px 22px rgba(0, 0, 0, 0.85), 0 0 20px rgba(239, 68, 68, 0.55)'
            : '0 6px 22px rgba(0, 0, 0, 0.85), 0 0 20px rgba(16, 185, 129, 0.55)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = isRestricted || isMuted
            ? '0 4px 18px rgba(0, 0, 0, 0.75), 0 0 14px rgba(239, 68, 68, 0.35)'
            : '0 4px 18px rgba(0, 0, 0, 0.75), 0 0 14px rgba(16, 185, 129, 0.35)';
        }}
        title={
          isAdminDisabled
            ? 'المايك محظور (معطّل من إعدادات الغرفة) 🚫'
            : isJudgeMuted
            ? 'المايك محظور بقرار من حكم المباراة ⚖️'
            : isMuted
            ? 'اضغط لتشغيل المايك'
            : 'اضغط لقفل المايك'
        }
      >
        {isAdminDisabled ? (
          <>
            <MicOff size={16} color="#ef4444" />
            <span>المايك محظور 🚫</span>
          </>
        ) : isJudgeMuted ? (
          <>
            <MicOff size={16} color="#ef4444" />
            <span>المايك محظور (حَكَم) ⚖️</span>
          </>
        ) : isMuted ? (
          <>
            <MicOff size={16} color="#ef4444" />
            <span>المايك مقفول 🔇</span>
          </>
        ) : (
          <>
            <Mic size={16} color="#10b981" />
            <span>المايك شغال 🎙️</span>
            {activePeersCount > 0 && (
              <span
                style={{
                  fontSize: '0.72rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  padding: '1px 6px',
                  borderRadius: '8px',
                  color: '#cbd5e1',
                  marginRight: '2px',
                }}
              >
                {activePeersCount}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
};
