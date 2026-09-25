'use client';

import React, { useEffect, useState } from 'react';
import { MatchHistoryItem, PaginatedMatchHistory } from '@baffa/shared';
import { MatchDetailsModal } from './MatchDetailsModal';
import { History, ChevronLeft, ChevronRight, Trophy, Bot, User, Layers } from 'lucide-react';
import { CurrentUser } from '../../hooks/useGameSocket';
import { API_URL } from '@/config/api';

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
        const res = await fetch(`${API_URL}/api/matches/history?page=${page}&limit=8`);
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
            style={{ fontSize: '1.8rem', fontWeight: 900, color: '#111827' }}
          >
            سجل المباريات 🎴
          </h1>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            أرشيف المباريات ونتائج الجولات السابقة
          </span>
        </div>

        <button onClick={onBackToHome} className="baffa-btn-secondary">
          العودة للرئيسية
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          جاري تحميل سجل المباريات...
        </div>
      ) : historyData?.matches.length === 0 ? (
        <div
          className="baffa-card"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: '#6b7280',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            border: '2px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          <History size={40} style={{ color: '#d97706' }} />
          <h3 className="arabic-font" style={{ fontSize: '1.3rem', fontWeight: 900, color: '#111827' }}>
            لا توجد مباريات مسجلة حتى الآن
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            العب أول ماتش لك لحفظ النتيجة والجدول الزمني وإحصائيات الفوز.
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
                border: '1.5px solid rgba(245, 158, 11, 0.25)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--baffa-gold-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.25)')}
            >
              {/* Score & Winner Tag */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: '#fef3c7',
                    color: '#d97706',
                    border: '1.5px solid #f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Trophy size={20} />
                </div>

                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#111827' }}>
                    <span style={{ color: match.winningTeam === 1 ? 'var(--baffa-team1-color)' : '#9ca3af' }}>
                      {match.team1Score}
                    </span>
                    <span style={{ margin: '0 6px', color: '#d1d5db' }}>-</span>
                    <span style={{ color: match.winningTeam === 2 ? 'var(--baffa-team2-color)' : '#9ca3af' }}>
                      {match.team2Score}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                    الهدف: {match.targetScore} • {match.roundsCount} جولات
                  </div>
                </div>
              </div>

              {/* Participants */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#4b5563' }}>
                {match.hasBots && (
                  <span style={{ padding: '2px 8px', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b', fontSize: '0.72rem', fontWeight: 700 }}>
                    مع بوتات
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
