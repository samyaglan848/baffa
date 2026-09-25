'use client';

import React, { useEffect, useState } from 'react';
import { UserStatistics } from '@baffa/shared';
import { BarChart3, Trophy, Flame, Zap, Bot, Users, ArrowLeft, Clock } from 'lucide-react';
import { CurrentUser } from '../../hooks/useGameSocket';
import { API_URL } from '@/config/api';

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
        const res = await fetch(`${API_URL}/api/matches/stats/${currentUser.id}`);
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
            style={{ fontSize: '1.8rem', fontWeight: 900, color: '#111827' }}
          >
            الإحصائيات الشاملة 📊
          </h1>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            تحليل الأداء التنافسي ونسب الفوز وسجل الجولات
          </span>
        </div>

        <button onClick={onBackToHome} className="baffa-btn-secondary">
          <ArrowLeft size={16} /> العودة للرئيسية
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          جاري تحميل الإحصائيات...
        </div>
      )}

      {stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Overall Section */}
          <div className="baffa-card" style={{ padding: '24px', border: '1.5px solid rgba(245, 158, 11, 0.25)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy size={20} style={{ color: '#d97706' }} /> المؤشرات التنافسية العامة
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fcfbf7', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>نسبة الفوز</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#d97706' }}>{stats.winRate}%</div>
              </div>
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fcfbf7', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>إجمالي الجولات</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#111827' }}>{stats.totalRounds}</div>
              </div>
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fcfbf7', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>فوز الجولات</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981' }}>{stats.roundWinRate}%</div>
              </div>
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fcfbf7', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>إجمالي النقط المحروقة</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#b45309' }}>{stats.totalPipsScored}</div>
              </div>
            </div>
          </div>

          {/* Streaks & Performance */}
          <div className="baffa-card" style={{ padding: '24px', border: '1.5px solid rgba(245, 158, 11, 0.25)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame size={20} style={{ color: '#d97706' }} /> سلسلة الانتصارات والمعدلات
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fcfbf7', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>السلسلة الحالية</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#d97706' }}>{stats.currentStreak}</div>
              </div>
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fcfbf7', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>أفضل سلسلة</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#b45309' }}>{stats.bestStreak}</div>
              </div>
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fcfbf7', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>متوسط الجولات/ماتش</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#111827' }}>{stats.averageRoundsPerMatch}</div>
              </div>
            </div>
          </div>

          {/* Human vs Bot Statistics Separation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Human vs Human */}
            <div className="baffa-card" style={{ padding: '20px', border: '1.5px solid rgba(245, 158, 11, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Users size={20} style={{ color: '#d97706' }} />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#111827' }}>
                  مواجهات اللاعبين البشر
                </h4>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#111827' }}>
                {stats.humanMatchesWon} فوز / {stats.humanMatchesLost} خسارة
              </div>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                نسبة الفوز التنافسي: {stats.humanWinRate}%
              </span>
            </div>

            {/* Against Bots */}
            <div className="baffa-card" style={{ padding: '20px', border: '1.5px solid rgba(245, 158, 11, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Bot size={20} style={{ color: '#d97706' }} />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#111827' }}>
                  مواجهات البوتات
                </h4>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#111827' }}>
                {stats.botMatchesWon} فوز / {stats.botMatchesLost} خسارة
              </div>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                نسبة الفوز ضد الذكاء الاصطناعي: {stats.botWinRate}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
