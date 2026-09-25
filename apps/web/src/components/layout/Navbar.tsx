'use client';

import React, { useState, useEffect } from 'react';
import { CurrentUser } from '../../hooks/useGameSocket';
import { UserAvatar } from '../common/UserAvatar';
import {
  Wifi,
  WifiOff,
  User as UserIcon,
  Play,
  History,
  BarChart3,
  Settings,
} from 'lucide-react';

export type AppView = 'HOME' | 'HISTORY' | 'STATS' | 'PROFILE';

interface NavbarProps {
  isConnected: boolean;
  currentUser: CurrentUser;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onLeaveRoom?: () => void;
  inRoom?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  isConnected,
  currentUser,
  currentView,
  onNavigate,
  onOpenSettings,
  onLeaveRoom,
  inRoom = false,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '8px 12px' : '10px 20px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderBottom: '1.5px solid rgba(245, 158, 11, 0.25)',
        boxShadow: '0 2px 10px rgba(245, 158, 11, 0.06)',
        backdropFilter: 'blur(12px)',
        zIndex: 40,
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Brand Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          onClick={() => onNavigate('HOME')}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          {/* Professional Luxury 'B' Emblem */}
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              background: 'linear-gradient(145deg, #fbbf24 0%, #d97706 50%, #92400e 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(245, 158, 11, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.6), inset 0 -2px 4px rgba(0, 0, 0, 0.4)',
              border: '1.5px solid rgba(255, 255, 255, 0.3)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Subtle Metallic Diagonal Sheen */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '-50%',
                width: '200%',
                height: '100%',
                background: 'linear-gradient(60deg, transparent 40%, rgba(255, 255, 255, 0.35) 50%, transparent 60%)',
                pointerEvents: 'none',
              }}
            />
            {/* Bold Professional 'B' with subtle 3D shadow */}
            <span
              style={{
                fontSize: '1.45rem',
                fontWeight: 900,
                fontFamily: 'var(--baffa-font-sans), sans-serif',
                color: '#080d1a',
                lineHeight: 1,
                letterSpacing: '-0.5px',
                textShadow: '0 1px 0 rgba(255, 255, 255, 0.4)',
                transform: 'translateY(-0.5px)',
                userSelect: 'none',
              }}
            >
              B
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '1.35rem',
                fontWeight: 900,
                letterSpacing: '2.5px',
                color: '#111827',
                lineHeight: 1.1,
              }}
            >
              BAFFA
            </span>
            <span
              className="arabic-font"
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--baffa-gold-dark)',
                letterSpacing: '0.5px',
                lineHeight: 1,
              }}
            >
              بَفّة الدومينو
            </span>
          </div>
        </div>

        {/* Navigation Tabs (Only when not actively inside a game table) */}
        {!inRoom && (
          <nav style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '2px' : '4px', marginLeft: isMobile ? '4px' : '12px' }}>
            <button
              onClick={() => onNavigate('HOME')}
              style={{
                padding: isMobile ? '6px 8px' : '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: currentView === 'HOME' ? 'var(--baffa-bg-elevated)' : 'transparent',
                color: currentView === 'HOME' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="العب"
            >
              <Play size={14} /> {!isMobile && 'Play (العب)'}
            </button>

            <button
              onClick={() => onNavigate('HISTORY')}
              style={{
                padding: isMobile ? '6px 8px' : '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: currentView === 'HISTORY' ? 'var(--baffa-bg-elevated)' : 'transparent',
                color: currentView === 'HISTORY' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="السجل"
            >
              <History size={14} /> {!isMobile && 'History (السجل)'}
            </button>

            <button
              onClick={() => onNavigate('STATS')}
              style={{
                padding: isMobile ? '6px 8px' : '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: currentView === 'STATS' ? 'var(--baffa-bg-elevated)' : 'transparent',
                color: currentView === 'STATS' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="الإحصائيات"
            >
              <BarChart3 size={14} /> {!isMobile && 'Stats (الإحصائيات)'}
            </button>

            <button
              onClick={() => onNavigate('PROFILE')}
              style={{
                padding: isMobile ? '6px 8px' : '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: currentView === 'PROFILE' ? 'var(--baffa-bg-elevated)' : 'transparent',
                color: currentView === 'PROFILE' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="حسابي"
            >
              <UserIcon size={14} /> {!isMobile && 'Profile (حسابي)'}
            </button>
          </nav>
        )}

        {inRoom && onLeaveRoom && (
          <button
            onClick={onLeaveRoom}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              borderRadius: 'var(--baffa-radius-sm)',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--baffa-team1-color)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              fontWeight: 600,
            }}
          >
            Exit Room
          </button>
        )}
      </div>

      {/* User Controls & Presence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '12px' }}>
        {/* Connection status badge */}
        <div
          title={isConnected ? 'Connected to BAFFA Server' : 'Disconnected'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '3px' : '6px',
            padding: isMobile ? '3px 7px' : '4px 10px',
            borderRadius: 'var(--baffa-radius-full)',
            backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
            border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            fontSize: isMobile ? '0.68rem' : '0.75rem',
            color: isConnected ? 'var(--baffa-success)' : 'var(--baffa-error)',
          }}
        >
          {isConnected ? <Wifi size={isMobile ? 12 : 14} /> : <WifiOff size={isMobile ? 12 : 14} />}
          {!isMobile && <span style={{ fontWeight: 600 }}>{isConnected ? 'ONLINE' : 'OFFLINE'}</span>}
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          style={{
            padding: '8px',
            borderRadius: 'var(--baffa-radius-md)',
            backgroundColor: 'var(--baffa-bg-elevated)',
            color: 'var(--baffa-text-secondary)',
            border: '1px solid var(--baffa-surface-glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Settings"
        >
          <Settings size={18} />
        </button>

        {/* User Badge */}
        <div
          onClick={() => onNavigate('PROFILE')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '6px' : '8px',
            padding: isMobile ? '4px 8px' : '5px 12px',
            borderRadius: 'var(--baffa-radius-md)',
            backgroundColor: currentView === 'PROFILE' ? 'rgba(245, 158, 11, 0.15)' : 'var(--baffa-bg-surface)',
            border: currentView === 'PROFILE' ? '1px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            maxWidth: isMobile ? '120px' : '200px',
          }}
          title="عرض الملف الشخصي"
        >
          <UserAvatar
            avatar={currentUser.avatar}
            username={currentUser.username}
            size={isMobile ? 24 : 28}
            border="1.5px solid var(--baffa-gold-primary)"
            boxShadow="0 0 8px rgba(245, 158, 11, 0.35)"
          />
          <span style={{ 
            fontSize: isMobile ? '0.78rem' : '0.85rem', 
            fontWeight: 700, 
            color: currentView === 'PROFILE' ? 'var(--baffa-gold-hover)' : 'var(--baffa-text-primary)',
            maxWidth: isMobile ? '70px' : '140px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {currentUser.username}
          </span>
        </div>
      </div>
    </header>
  );
};
