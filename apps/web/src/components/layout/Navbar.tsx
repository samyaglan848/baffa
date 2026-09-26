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
    <>
      <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '8px 12px' : '10px 20px',
        backgroundColor: 'rgba(8, 13, 22, 0.85)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(16px)',
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
              background: 'linear-gradient(145deg, #F5C518 0%, #D9A404 65%, #92400e 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 10px rgba(245, 197, 24, 0.35), inset 0 -2px 4px rgba(0, 0, 0, 0.4)',
              border: '1.5px solid #B8860B',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Bold Professional 'B' */}
            <span
              style={{
                fontSize: '1.45rem',
                fontWeight: 900,
                fontFamily: 'var(--baffa-font-sans), sans-serif',
                color: '#080d1a',
                lineHeight: 1,
                letterSpacing: '-0.5px',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
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
                color: 'var(--baffa-text-primary)',
                lineHeight: 1.1,
              }}
            >
              BAFFA
            </span>
            <span
              className="arabic-font"
              style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                color: 'var(--baffa-gold-primary)',
                letterSpacing: '0.5px',
                lineHeight: 1,
              }}
            >
              بَفّة الدومينو
            </span>
          </div>
        </div>

        {/* Navigation Tabs (Only when not actively inside a game table) - Desktop Header */}
        {!inRoom && (
          <nav
            className="desktop-nav-tabs"
            style={{
              gap: '4px',
              marginLeft: '12px',
            }}
          >
            <button
              onClick={() => onNavigate('HOME')}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: currentView === 'HOME' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                color: currentView === 'HOME' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
                border: currentView === 'HOME' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="العب"
            >
              <Play size={14} style={{ color: currentView === 'HOME' ? 'var(--baffa-gold-primary)' : 'inherit' }} /> Play (العب)
            </button>

            <button
              onClick={() => onNavigate('HISTORY')}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: currentView === 'HISTORY' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                color: currentView === 'HISTORY' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
                border: currentView === 'HISTORY' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="السجل"
            >
              <History size={14} style={{ color: currentView === 'HISTORY' ? 'var(--baffa-gold-primary)' : 'inherit' }} /> History (السجل)
            </button>

            <button
              onClick={() => onNavigate('STATS')}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: currentView === 'STATS' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                color: currentView === 'STATS' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
                border: currentView === 'STATS' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="الإحصائيات"
            >
              <BarChart3 size={14} style={{ color: currentView === 'STATS' ? 'var(--baffa-gold-primary)' : 'inherit' }} /> Stats (الإحصائيات)
            </button>

            <button
              onClick={() => onNavigate('PROFILE')}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--baffa-radius-md)',
                backgroundColor: currentView === 'PROFILE' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                color: currentView === 'PROFILE' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
                border: currentView === 'PROFILE' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="حسابي"
            >
              <UserIcon size={14} style={{ color: currentView === 'PROFILE' ? 'var(--baffa-gold-primary)' : 'inherit' }} /> Profile (حسابي)
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
              fontWeight: 700,
            }}
          >
            Exit Room
          </button>
        )}
      </div>

      {/* User Controls & Presence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '12px', flexShrink: 0 }}>
        {/* Connection status badge (Deep Emerald when online) */}
        <div
          title={isConnected ? 'Connected to BAFFA Server' : 'Disconnected'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '3px' : '6px',
            padding: isMobile ? '3px 7px' : '4px 10px',
            borderRadius: 'var(--baffa-radius-full)',
            backgroundColor: isConnected ? 'rgba(15, 107, 76, 0.12)' : 'rgba(244, 63, 94, 0.12)',
            border: `1.5px solid ${isConnected ? 'var(--baffa-success)' : 'rgba(244, 63, 94, 0.3)'}`,
            fontSize: isMobile ? '0.68rem' : '0.75rem',
            color: isConnected ? 'var(--baffa-success)' : 'var(--baffa-error)',
          }}
        >
          {isConnected ? <Wifi size={isMobile ? 12 : 14} /> : <WifiOff size={isMobile ? 12 : 14} />}
          {!isMobile && <span style={{ fontWeight: 800 }}>{isConnected ? 'ONLINE' : 'OFFLINE'}</span>}
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          style={{
            padding: isMobile ? '6px' : '8px',
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
          <Settings size={isMobile ? 16 : 18} />
        </button>

        {/* User Badge */}
        <div
          onClick={() => onNavigate('PROFILE')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '4px' : '8px',
            padding: isMobile ? '3px 6px' : '5px 12px',
            borderRadius: 'var(--baffa-radius-md)',
            backgroundColor: currentView === 'PROFILE' ? 'rgba(245, 158, 11, 0.15)' : 'var(--baffa-bg-surface)',
            border: currentView === 'PROFILE' ? '1px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            maxWidth: isMobile ? '110px' : '200px',
          }}
          title="عرض الملف الشخصي"
        >
          <UserAvatar
            avatar={currentUser.avatar}
            username={currentUser.username}
            size={isMobile ? 22 : 28}
            border="1.5px solid var(--baffa-gold-primary)"
            boxShadow="0 0 8px rgba(245, 158, 11, 0.35)"
          />
          {!isMobile && (
            <span style={{ 
              fontSize: '0.85rem', 
              fontWeight: 700, 
              color: currentView === 'PROFILE' ? 'var(--baffa-gold-hover)' : 'var(--baffa-text-primary)',
              maxWidth: '140px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {currentUser.username}
            </span>
          )}
        </div>
      </div>
    </header>

    {/* Mobile Bottom Navigation Bar (Phone Screens Only) */}
    {!inRoom && (
      <nav
        className="mobile-bottom-nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(8, 13, 22, 0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 -4px 25px rgba(0, 0, 0, 0.6)',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '6px 4px calc(6px + env(safe-area-inset-bottom, 4px))',
          zIndex: 60,
          maxWidth: '100vw',
          boxSizing: 'border-box',
        }}
      >
        {/* 1. Play (العب) */}
        <button
          onClick={() => onNavigate('HOME')}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            padding: '6px 2px',
            borderRadius: '10px',
            backgroundColor: currentView === 'HOME' ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
            color: currentView === 'HOME' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-muted)',
            transition: 'all 0.2s ease',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Play size={18} fill={currentView === 'HOME' ? 'var(--baffa-gold-primary)' : 'none'} />
          <span className="arabic-font" style={{ fontSize: '0.72rem', fontWeight: currentView === 'HOME' ? 900 : 700 }}>
            العب
          </span>
        </button>

        {/* 2. History (السجل) */}
        <button
          onClick={() => onNavigate('HISTORY')}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            padding: '6px 2px',
            borderRadius: '10px',
            backgroundColor: currentView === 'HISTORY' ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
            color: currentView === 'HISTORY' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-muted)',
            transition: 'all 0.2s ease',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <History size={18} />
          <span className="arabic-font" style={{ fontSize: '0.72rem', fontWeight: currentView === 'HISTORY' ? 900 : 700 }}>
            السجل
          </span>
        </button>

        {/* 3. Stats (الإحصائيات) */}
        <button
          onClick={() => onNavigate('STATS')}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            padding: '6px 2px',
            borderRadius: '10px',
            backgroundColor: currentView === 'STATS' ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
            color: currentView === 'STATS' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-muted)',
            transition: 'all 0.2s ease',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <BarChart3 size={18} />
          <span className="arabic-font" style={{ fontSize: '0.72rem', fontWeight: currentView === 'STATS' ? 900 : 700 }}>
            الإحصائيات
          </span>
        </button>

        {/* 4. Profile (حسابي) */}
        <button
          onClick={() => onNavigate('PROFILE')}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            padding: '6px 2px',
            borderRadius: '10px',
            backgroundColor: currentView === 'PROFILE' ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
            color: currentView === 'PROFILE' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-muted)',
            transition: 'all 0.2s ease',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <UserIcon size={18} />
          <span className="arabic-font" style={{ fontSize: '0.72rem', fontWeight: currentView === 'PROFILE' ? 900 : 700 }}>
            حسابي
          </span>
        </button>
      </nav>
    )}
  </>
  );
};
