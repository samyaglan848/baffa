'use client';

import React, { useState } from 'react';
import { PlayerSeat, SanitizedGameState } from '@baffa/shared';
import { ShieldAlert, AlertTriangle, Check, X } from 'lucide-react';

interface JudgePanelProps {
  gameState: SanitizedGameState;
  onDeclareCheating: (offendingSeat: PlayerSeat, reason: string) => void;
}

export const JudgePanel: React.FC<JudgePanelProps> = ({
  gameState,
  onDeclareCheating,
}) => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<PlayerSeat>(0);
  const [reason, setReason] = useState('Unauthorized communication detected');

  const handleConfirm = () => {
    onDeclareCheating(selectedSeat, reason);
    setShowConfirmModal(false);
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={20} style={{ color: 'var(--baffa-team1-color)' }} />
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--baffa-team1-color)' }}>
            JUDGE CONTROL PANEL
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>
            (Public table monitoring mode — zero private hands visible)
          </span>
        </div>

        <button
          onClick={() => setShowConfirmModal(true)}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--baffa-radius-sm)',
            backgroundColor: 'var(--baffa-error)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
          }}
        >
          <AlertTriangle size={16} />
          <span className="arabic-font">احتساب قرار غش</span>
          <span>(Declare Cheating)</span>
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(6, 9, 14, 0.9)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 150,
          }}
        >
          <div
            className="baffa-card"
            style={{
              width: '90%',
              maxWidth: '460px',
              padding: '28px',
              border: '2px solid var(--baffa-error)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <AlertTriangle size={28} style={{ color: 'var(--baffa-error)' }} />
              <div>
                <h3
                  className="arabic-font"
                  style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--baffa-error)' }}
                >
                  تأكيد قرار الغش؟
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--baffa-text-muted)' }}>
                  Confirm Judge Cheating Penalty
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--baffa-text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
              Declaring cheating will immediately terminate the current round, forfeit it, and award the offending team's remaining points to the opposing team.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '6px' }}>
                Select Offending Seat
              </label>
              <select
                value={selectedSeat}
                onChange={(e) => setSelectedSeat(Number(e.target.value) as PlayerSeat)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'var(--baffa-bg-elevated)',
                  color: '#fff',
                  border: '1px solid var(--baffa-surface-glass-border)',
                  outline: 'none',
                  fontSize: '0.9rem',
                }}
              >
                {gameState.players.map((p) => (
                  <option key={p.seat} value={p.seat}>
                    Seat {p.seat + 1} ({p.username} - Team {p.team})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)', marginBottom: '6px' }}>
                Reason / Infraction
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'var(--baffa-bg-elevated)',
                  color: '#fff',
                  border: '1px solid var(--baffa-surface-glass-border)',
                  outline: 'none',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="baffa-btn-secondary"
                style={{ flex: 1 }}
              >
                <X size={16} /> Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="baffa-btn-danger"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Check size={16} /> Confirm Penalty
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
