'use client';

import React, { useEffect, useState } from 'react';
import { MatchDetailsResponse } from '@baffa/shared';
import { X, Trophy, AlertTriangle, ShieldCheck, Clock, Layers } from 'lucide-react';
import { API_URL } from '@/config/api';

interface MatchDetailsModalProps {
  matchId: string;
  onClose: () => void;
}

export const MatchDetailsModal: React.FC<MatchDetailsModalProps> = ({
  matchId,
  onClose,
}) => {
  const [details, setDetails] = useState<MatchDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDetails() {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/matches/details/${matchId}`);
        if (!res.ok) throw new Error('Failed to load match details');
        const data = await res.json();
        setDetails(data);
      } catch (err: any) {
        setError(err.message || 'Error loading details');
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [matchId]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(6, 9, 14, 0.9)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
      }}
    >
      <div
        className="baffa-card"
        style={{
          width: '90%',
          maxWidth: '560px',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '28px',
          border: '1px solid var(--baffa-surface-glass-border)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 className="arabic-font" style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--baffa-gold-hover)' }}>
              تفاصيل الماتش
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--baffa-text-muted)' }}>
              Match ID: {matchId}
            </span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--baffa-text-muted)', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--baffa-text-muted)' }}>
            Loading match timeline...
          </div>
        )}

        {error && (
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--baffa-team1-color)' }}>
            {error}
          </div>
        )}

        {details && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Final Score Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                padding: '16px',
                borderRadius: 'var(--baffa-radius-lg)',
                backgroundColor: 'var(--baffa-bg-elevated)',
                border: '1px solid var(--baffa-surface-glass-border)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--baffa-team1-color)' }}>
                  TEAM 1 {details.winningTeam === 1 && '🏆'}
                </span>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--baffa-team1-color)' }}>
                  {details.team1Score}
                </div>
              </div>

              <div style={{ textAlign: 'center', color: 'var(--baffa-text-muted)' }}>
                <span style={{ fontSize: '0.75rem', display: 'block' }}>TARGET</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--baffa-gold-primary)' }}>
                  {details.targetScore}
                </span>
              </div>

              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--baffa-team2-color)' }}>
                  TEAM 2 {details.winningTeam === 2 && '🏆'}
                </span>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--baffa-team2-color)' }}>
                  {details.team2Score}
                </div>
              </div>
            </div>

            {/* Participants Grid */}
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--baffa-text-secondary)', display: 'block', marginBottom: '8px' }}>
                Participants:
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {details.participants.map((p) => (
                  <div
                    key={p.seat}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'var(--baffa-bg-elevated)',
                      borderLeft: `4px solid ${p.team === 1 ? 'var(--baffa-team1-color)' : 'var(--baffa-team2-color)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#fff' }}>
                      {p.username}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--baffa-text-muted)' }}>
                      Team {p.team} (Seat {p.seat + 1})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Round Breakdown */}
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--baffa-text-secondary)', display: 'block', marginBottom: '8px' }}>
                Round Timeline ({details.rounds.length} rounds):
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {details.rounds.map((r) => (
                  <div
                    key={r.roundNumber}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'var(--baffa-bg-elevated)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 800, color: '#fff' }}>Round {r.roundNumber}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', marginLeft: '8px' }}>
                        Winner: Team {r.winningTeam} (+{r.roundScore} pts)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {r.reason === 'EMPTY_HAND' ? (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--baffa-success)' }}>
                          Empty Hand
                        </span>
                      ) : r.reason === 'BLOCKED' ? (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--baffa-warning)' }}>
                          قفلة (Blocked)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--baffa-team1-color)' }}>
                          قرار غش (Cheating)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="baffa-btn-secondary"
          style={{ width: '100%', marginTop: '20px' }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
