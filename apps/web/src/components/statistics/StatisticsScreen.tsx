'use client';

import React, { useEffect, useState } from 'react';
import { UserStatistics } from '@baffa/shared';
import { BarChart3, Trophy, Flame, Zap, Bot, Users, ArrowLeft, Clock } from 'lucide-react';
import { CurrentUser } from '../../hooks/useGameSocket';

interface StatisticsScreenProps {
  currentUser: CurrentUser;
  onBackToHome: () => void;
}

export const StatisticsScreen: React.FC<StatisticsScreenProps> = ({
  currentUser,
  onBackToHome,
}) => {
  const [stats, setStats] = useState<UserStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch(`http://localhost:4000/api/matches/stats/${currentUser.id}`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [currentUser.id]);

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: '32px 16px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1
            className="arabic-font"
            style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--baffa-gold-hover)' }}
          >
            الإحصائيات الشاملة
          </h1>
          <span style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)' }}>
            Comprehensive Performance & Competitive Analytics
          </span>
        </div>

        <button onClick={onBackToHome} className="baffa-btn-secondary">
          <ArrowLeft size={16} /> Back to Home
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--baffa-text-muted)' }}>
          Loading statistics...
        </div>
      )}

      {stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Overall Section */}
          <div className="baffa-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy size={20} style={{ color: 'var(--baffa-gold-primary)' }} /> Overall Match Metrics
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--baffa-bg-elevated)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Win Rate</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--baffa-gold-primary)' }}>{stats.winRate}%</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--baffa-bg-elevated)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Total Rounds</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>{stats.totalRounds}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--baffa-bg-elevated)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Round Win Rate</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--baffa-success)' }}>{stats.roundWinRate}%</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--baffa-bg-elevated)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Total Pips Scored</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--baffa-cyan-primary)' }}>{stats.totalPipsScored}</div>
              </div>
            </div>
          </div>

          {/* Streaks & Performance */}
          <div className="baffa-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame size={20} style={{ color: 'var(--baffa-warning)' }} /> Streaks & Milestones
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--baffa-bg-elevated)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Current Streak</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--baffa-warning)' }}>{stats.currentStreak}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--baffa-bg-elevated)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Best Win Streak</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--baffa-gold-hover)' }}>{stats.bestStreak}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--baffa-bg-elevated)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>Avg Rounds / Match</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>{stats.averageRoundsPerMatch}</div>
              </div>
            </div>
          </div>

          {/* Human vs Bot Statistics Separation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Human vs Human */}
            <div className="baffa-card" style={{ padding: '20px', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Users size={20} style={{ color: 'var(--baffa-cyan-primary)' }} />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--baffa-cyan-primary)' }}>
                  Human Matches
                </h4>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>
                {stats.humanMatchesWon}W / {stats.humanMatchesLost}L
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--baffa-text-muted)' }}>
                Competitive Win Rate: {stats.humanWinRate}%
              </span>
            </div>

            {/* Against Bots */}
            <div className="baffa-card" style={{ padding: '20px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Bot size={20} style={{ color: 'var(--baffa-gold-primary)' }} />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--baffa-gold-primary)' }}>
                  Bot Matches
                </h4>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>
                {stats.botMatchesWon}W / {stats.botMatchesLost}L
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--baffa-text-muted)' }}>
                Practice Win Rate: {stats.botWinRate}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
