'use client';

import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        marginTop: 'auto',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        color: 'var(--baffa-text-muted)',
        fontSize: '0.85rem',
        fontWeight: 800,
        letterSpacing: '1px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        backgroundColor: 'var(--baffa-bg-canvas)',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      <span>MADE BY AL_SAMY</span>
    </footer>
  );
};
