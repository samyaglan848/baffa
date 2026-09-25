'use client';

import React, { useState } from 'react';
import { X, LogIn } from 'lucide-react';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (code: string) => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  onClose,
  onJoin,
}) => {
  const [code, setCode] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onJoin(code.trim().toUpperCase());
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.65)',
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
          width: '90%',
          maxWidth: '440px',
          padding: '32px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '2px solid #f59e0b',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.25), 0 0 35px rgba(245, 158, 11, 0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2
              className="arabic-font"
              style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827', margin: 0 }}
            >
              انضمام إلى طاولة 🎲
            </h2>
            <p className="arabic-font" style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '4px', margin: 0 }}>
              أدخل كود الغرفة المكوّن من 6 خانات
            </p>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label className="arabic-font" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 800, color: '#111827', marginBottom: '8px' }}>
              كود الغرفة (Room Code):
            </label>
            <input
              type="text"
              placeholder="مثال: 7K9WX2"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={10}
              autoFocus
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: '#fcfbf7',
                border: '2px solid #f59e0b',
                color: '#111827',
                fontSize: '1.3rem',
                fontWeight: 900,
                letterSpacing: '4px',
                textAlign: 'center',
                outline: 'none',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={!code.trim()}
            className="baffa-btn-primary"
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '12px',
              fontSize: '1.05rem',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: code.trim() ? 'pointer' : 'not-allowed',
              opacity: code.trim() ? 1 : 0.6,
            }}
          >
            <LogIn size={18} />
            <span className="arabic-font">دخول الطاولة ⚡</span>
          </button>
        </form>
      </div>
    </div>
  );
};
