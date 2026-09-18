'use client';

import React, { useEffect, useState } from 'react';
import { MatchHistoryItem, PaginatedMatchHistory } from '@baffa/shared';
import { MatchDetailsModal } from './MatchDetailsModal';
import { History, ChevronLeft, ChevronRight, Trophy, Bot, User, Layers } from 'lucide-react';
import { CurrentUser } from '../../hooks/useGameSocket';

interface MatchHistoryScreenProps {
  currentUser: CurrentUser;
  onBackToHome: () => void;
}

export const MatchHistoryScreen: React.FC<MatchHistoryScreenProps> = ({
  currentUser,
  onBackToHome,
}) => {
  const [historyData, setHistoryData] = useState<PaginatedMatchHistory | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        const res = await fetch(`http://localhost:4000/api/matches/history?page=${page}&limit=8`);
        if (!res.ok) throw new Error('Failed to load history');
        const data = await res.json();
        setHistoryData(data);
      } catch {
        setHistoryData({ matches: [], total: 0, page: 1, totalPages: 1 });
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [page]);

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: '32px 16px',
        width: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1
            className="arabic-font"
            style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--baffa-gold-hover)' }}
          >
            سجل المباريات
          </h1>
          <span style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)' }}>
            Completed Match History & Archive
          </span>
        </div>

        <button onClick={onBackToHome} className="baffa-btn-secondary">
          Back to Home
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--baffa-text-muted)' }}>
          Loading match records...
        </div>
      ) : historyData?.matches.length === 0 ? (
        <div
          className="baffa-card"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--baffa-text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <History size={40} style={{ color: 'var(--baffa-text-disabled)' }} />
          <h3 className="arabic-font" style={{ fontSize: '1.3rem', color: '#fff' }}>
            لا توجد مباريات مسجلة حتى الآن
          </h3>
          <p style={{ fontSize: '0.85rem' }}>
            Complete your first match to record scores, timeline, and player statistics.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {historyData?.matches.map((match) => (
            <div
              key={match.id}
              onClick={() => setSelectedMatchId(match.id)}
              className="baffa-card"
              style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                border: '1px solid var(--baffa-surface-glass-border)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--baffa-gold-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--baffa-surface-glass-border)')}
            >
              {/* Score & Winner Tag */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--baffa-gold-muted)',
                    color: 'var(--baffa-gold-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Trophy size={20} />
                </div>

                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>
                    <span style={{ color: match.winningTeam === 1 ? 'var(--baffa-team1-color)' : 'var(--baffa-text-muted)' }}>
                      {match.team1Score}
                    </span>
                    <span style={{ margin: '0 6px', color: 'var(--baffa-text-disabled)' }}>-</span>
                    <span style={{ color: match.winningTeam === 2 ? 'var(--baffa-team2-color)' : 'var(--baffa-text-muted)' }}>
                      {match.team2Score}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', marginTop: '2px' }}>
                    Target: {match.targetScore} • {match.roundsCount} Rounds
                  </div>
                </div>
              </div>

              {/* Participants */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--baffa-text-secondary)' }}>
                {match.hasBots && (
                  <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(6, 182, 212, 0.15)', color: 'var(--baffa-cyan-primary)', fontSize: '0.7rem' }}>
                    With Bots
                  </span>
                )}
                <span>{new Date(match.startedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {historyData && historyData.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="baffa-btn-secondary"
                style={{ padding: '6px 12px' }}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)' }}>
                Page {page} of {historyData.totalPages}
              </span>
              <button
                disabled={page >= historyData.totalPages}
                onClick={() => setPage(page + 1)}
                className="baffa-btn-secondary"
                style={{ padding: '6px 12px' }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Match Details Modal */}
      {selectedMatchId && (
        <MatchDetailsModal
          matchId={selectedMatchId}
          onClose={() => setSelectedMatchId(null)}
        />
      )}
    </div>
  );
};
