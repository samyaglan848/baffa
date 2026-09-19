'use client';

import React, { useState } from 'react';
import { HeadToHeadStats } from '@baffa/shared';
import { Swords, Search, Trophy, History } from 'lucide-react';
import { API_URL } from '@/config/api';

interface HeadToHeadViewProps {
  currentUserId: string;
}

export const HeadToHeadView: React.FC<HeadToHeadViewProps> = ({ currentUserId }) => {
  const [opponentId, setOpponentId] = useState('');
  const [h2hData, setH2HData] = useState<HeadToHeadStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponentId.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(
        `${API_URL}/api/matches/head-to-head?userId1=${currentUserId}&userId2=${opponentId.trim()}`
      );
      if (res.ok) {
        const data = await res.json();
        setH2HData(data);
      } else {
        setH2HData(null);
      }
    } catch {
      setH2HData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="baffa-card"
      style={{
        padding: '24px',
        border: '1px solid var(--baffa-surface-glass-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Swords size={22} style={{ color: 'var(--baffa-gold-primary)' }} />
        <div>
          <h3 className="arabic-font" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>
            مبارياتنا (Head-to-Head)
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>
            Compare direct match history against any opponent
          </span>
        </div>
      </div>

      {/* Opponent Search Input */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={opponentId}
          onChange={(e) => setOpponentId(e.target.value)}
          placeholder="Enter opponent User ID"
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 'var(--baffa-radius-md)',
            backgroundColor: 'var(--baffa-bg-elevated)',
            border: '1px solid var(--baffa-surface-glass-border)',
            color: '#fff',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
        <button type="submit" disabled={loading} className="baffa-btn-primary" style={{ padding: '8px 16px' }}>
          <Search size={16} /> Compare
        </button>
      </form>

      {loading && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--baffa-text-muted)' }}>
          Calculating head-to-head metrics...
        </div>
      )}

      {searched && !loading && !h2hData && (
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--baffa-text-muted)', fontSize: '0.85rem' }}>
          No completed shared matches found between both accounts.
        </div>
      )}

      {h2hData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Comparison Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              padding: '16px',
              borderRadius: 'var(--baffa-radius-lg)',
              backgroundColor: 'var(--baffa-bg-elevated)',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--baffa-team1-color)' }}>
                {h2hData.user1.username} (You)
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--baffa-team1-color)' }}>
                {h2hData.user1Wins} Wins
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>
                ({h2hData.user1WinRate}%)
              </span>
            </div>

            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', display: 'block' }}>TOTAL</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--baffa-gold-primary)' }}>
                {h2hData.totalMatches} Matches
              </span>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--baffa-team2-color)' }}>
                {h2hData.user2.username}
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--baffa-team2-color)' }}>
                {h2hData.user2Wins} Wins
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>
                ({h2hData.user2WinRate}%)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
