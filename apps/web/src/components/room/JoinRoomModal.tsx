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
        backgroundColor: 'rgba(6, 9, 14, 0.85)',
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
          border: '1px solid var(--baffa-surface-glass-border)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2
              className="arabic-font"
              style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--baffa-gold-hover)' }}
            >
              انضمام إلى غرفة
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)', marginTop: '2px' }}>
              Join room via 6-character room code
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--baffa-text-muted)', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--baffa-text-secondary)', marginBottom: '8px' }}>
              Enter Room Code
            </label>
            <input
              type="text"
              placeholder="e.g. 7K9WX2"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={10}
              autoFocus
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: 'var(--baffa-bg-elevated)',
                border: '1px solid var(--baffa-surface-glass-border)',
                color: '#fff',
                fontSize: '1.2rem',
                fontWeight: 800,
                letterSpacing: '3px',
                textAlign: 'center',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={!code.trim()}
            className="baffa-btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
          >
            <LogIn size={18} />
            Join Room
          </button>
        </form>
      </div>
    </div>
  );
};
