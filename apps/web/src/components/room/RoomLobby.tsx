'use client';

import React, { useState, useEffect } from 'react';
import {
  BotId,
  OFFICIAL_BAFFA_BOTS,
  PlayerSeat,
  RoomDetails,
  RoomSeatInfo,
  RoomSettings,
  UserRole,
} from '@baffa/shared';
import { CurrentUser } from '../../hooks/useGameSocket';
import { UserAvatar } from '../common/UserAvatar';
import { useGameAudio } from '../../hooks/useGameAudio';
import {
  Copy,
  Check,
  Play,
  Bot,
  User,
  ArrowLeftRight,
  Settings,
  Shield,
  Eye,
  Gavel,
  Clock,
  Mic,
  MicOff,
  MessageSquare,
  MessageSquareOff,
  Smile,
  Radio,
  X,
  Link,
  Share2,
} from 'lucide-react';

interface RoomLobbyProps {
  room: RoomDetails;
  currentUser: CurrentUser;
  myRole: UserRole;
  errorMessage?: string | null;
  onSelectSeat: (seat: PlayerSeat) => void;
  onAdminMoveSeat: (fromSeat: PlayerSeat, toSeat: PlayerSeat) => void;
  onAdminToggleBot: (seat: PlayerSeat, enable: boolean, botId?: BotId) => void;
  onAdminUpdateSettings: (settings: Partial<RoomSettings>) => void;
  onAdminStartMatch: () => void;
  onJoinAsJudge: () => void;
  onJoinAsSpectator: () => void;
  onLeaveRoom: () => void;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  room,
  currentUser,
  myRole,
  errorMessage,
  onSelectSeat,
  onAdminMoveSeat,
  onAdminToggleBot,
  onAdminUpdateSettings,
  onAdminStartMatch,
  onJoinAsJudge,
  onJoinAsSpectator,
  onLeaveRoom,
}) => {
  const { playSound } = useGameAudio(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [swapFromSeat, setSwapFromSeat] = useState<PlayerSeat | null>(null);
  const [editingBotSeat, setEditingBotSeat] = useState<PlayerSeat | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Responsive device state for mobile screen optimization
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setIsStarting(false);
  }, [room.matchStatus, errorMessage]);

  const handleStartMatch = () => {
    playSound('click');
    setIsStarting(true);
    onAdminStartMatch();
    setTimeout(() => {
      setIsStarting(false);
    }, 7000);
  };

  const isJudge =
    myRole === 'JUDGE' ||
    Boolean(room.judge && (room.judge.userId === currentUser.id || room.judge.username === currentUser.username));

  const isSpectator =
    myRole === 'SPECTATOR' ||
    Boolean(room.spectator && (room.spectator.userId === currentUser.id || room.spectator.username === currentUser.username));

  const isPlayer = !isJudge && !isSpectator;

  const isAdmin =
    room.currentAdminId === currentUser.id ||
    room.ownerId === currentUser.id ||
    room.originalAdminId === currentUser.id;

  const canStartMatch =
    isAdmin ||
    isJudge ||
    Boolean(room.judge && (room.judge.userId === currentUser.id || room.judge.username === currentUser.username));

  const allSeatsOccupied = room.seats.every((s) => s.occupied);
  const canClickStart = isJudge || isSpectator || allSeatsOccupied;

  const getInviteUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/?room=${room.code}`;
    }
    return `/?room=${room.code}`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getInviteUrl());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const url = getInviteUrl();
    const text = `تعال نلعب قعدة دومينو في بَفّة 🎴!\nكود الطاولة: ${room.code}\nادخل الطاولة مباشرة من الرابط:\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleSeatClick = (seat: PlayerSeat) => {
    const targetSeatInfo = room.seats[seat];
    // If the target seat is already occupied by another real human player, cannot take it!
    const isOtherHuman =
      targetSeatInfo?.occupied &&
      !targetSeatInfo.isBot &&
      targetSeatInfo.playerId !== currentUser.id;

    if (isOtherHuman) {
      return;
    }

    if (swapFromSeat !== null && isAdmin) {
      if (swapFromSeat !== seat) {
        onAdminMoveSeat(swapFromSeat, seat);
      }
      setSwapFromSeat(null);
    } else {
      onSelectSeat(seat);
    }
  };

  const renderSeatCard = (
    seatInfo: RoomSeatInfo,
    positionLabel: string
  ) => {
    const isCurrentUser =
      isPlayer &&
      !seatInfo.isBot &&
      seatInfo.occupied &&
      seatInfo.playerId === currentUser.id;
    const isOtherHuman = seatInfo.occupied && !seatInfo.isBot && !isCurrentUser;
    const isBotSeat = seatInfo.isBot;
    const teamColor = seatInfo.team === 1 ? 'var(--baffa-team1-color)' : 'var(--baffa-team2-color)';
    const teamBg = seatInfo.team === 1 ? 'var(--baffa-team1-bg)' : 'var(--baffa-team2-bg)';
    const isSwapSource = swapFromSeat === seatInfo.seat;
    const botProfile = seatInfo.botId ? OFFICIAL_BAFFA_BOTS[seatInfo.botId] : undefined;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: isMobile ? '1 1 0' : undefined, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
        <div
          onClick={() => handleSeatClick(seatInfo.seat)}
          style={{
            width: isMobile ? '100%' : '200px',
            maxWidth: isMobile ? '125px' : '200px',
            minHeight: isMobile ? '100px' : '155px',
            padding: isMobile ? '6px 6px' : '14px',
            borderRadius: isMobile ? 'var(--baffa-radius-md)' : 'var(--baffa-radius-xl)',
            backgroundColor: seatInfo.occupied ? '#ffffff' : '#fdfbf7',
            border: isSwapSource
              ? '2px solid var(--baffa-gold-primary)'
              : seatInfo.occupied
              ? `2px solid ${teamColor}`
              : '2px dashed rgba(245, 158, 11, 0.35)',
            boxShadow: isSwapSource
              ? '0 0 24px var(--baffa-gold-primary)'
              : seatInfo.occupied
              ? `0 4px 16px rgba(0, 0, 0, 0.06)`
              : 'none',
            cursor: isOtherHuman ? 'not-allowed' : 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            backdropFilter: 'blur(12px)',
            transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: isOtherHuman ? 0.85 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isOtherHuman) {
              e.currentTarget.style.transform = 'translateY(-4px)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* Top Header inside card */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span
              style={{
                padding: isMobile ? '1px 5px' : '2px 8px',
                borderRadius: '4px',
                backgroundColor: teamColor,
                color: '#fff',
                fontSize: isMobile ? '0.58rem' : '0.65rem',
                fontWeight: 900,
                letterSpacing: '0.5px',
              }}
            >
              فريق {seatInfo.team}
            </span>
          </div>

          {/* Seat Content */}
          {seatInfo.occupied ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '12px', margin: isMobile ? '4px 0' : '10px 0' }}>
              <div
                style={{
                  width: isMobile ? '32px' : '46px',
                  height: isMobile ? '32px' : '46px',
                  borderRadius: '50%',
                  backgroundColor: teamBg,
                  color: teamColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `2px solid ${teamColor}`,
                  boxShadow: `0 0 14px ${teamColor}`,
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                <UserAvatar
                  avatar={isCurrentUser ? currentUser.avatar : seatInfo.avatar}
                  username={seatInfo.username || undefined}
                  isBot={seatInfo.isBot}
                  botId={seatInfo.botId}
                  size={isMobile ? 32 : 46}
                />
              </div>
              <div style={{ overflow: 'hidden', minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? '0.78rem' : '0.95rem', fontWeight: 800, color: 'var(--baffa-text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {seatInfo.isBot && botProfile ? botProfile.arabicName : seatInfo.username}
                </div>
                <div style={{ fontSize: isMobile ? '0.65rem' : '0.75rem', color: seatInfo.isBot ? 'var(--baffa-cyan-primary)' : 'var(--baffa-gold-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>
                    {seatInfo.isBot ? `بوت (${botProfile?.difficulty || 'عادي'})` : isCurrentUser ? 'أنت' : 'لاعب'}
                  </span>
                  {!seatInfo.isBot && seatInfo.presence === 'AWAY' && (
                    <span style={{ color: '#fbbf24', fontSize: '0.62rem', backgroundColor: 'rgba(245, 158, 11, 0.25)', padding: '1px 4px', borderRadius: '4px', animation: 'pulse 1s infinite', fontWeight: 900 }}>
                      ⚠️ خارج
                    </span>
                  )}
                  {!seatInfo.isBot && (!seatInfo.isConnected || seatInfo.presence === 'DISCONNECTED') && (
                    <span style={{ color: '#f87171', fontSize: '0.6rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '1px 3px', borderRadius: '4px' }}>
                      (منقطع)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '14px 0', color: 'var(--baffa-text-muted)' }}>
              <span className="arabic-font" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--baffa-gold-hover)' }}>
                مقعد شاغر
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-secondary)', marginTop: '2px' }}>
                اضغط للجلوس
              </span>
            </div>
          )}

          {/* Bot selection dropdown for admin */}
          {isAdmin && editingBotSeat === seatInfo.seat && (
            <div
              style={{
                position: 'absolute',
                top: '45px',
                left: '8px',
                right: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                borderRadius: 'var(--baffa-radius-md)',
                padding: '10px',
                zIndex: 50,
                boxShadow: '0 8px 30px rgba(245, 158, 11, 0.25)',
                border: '1.5px solid var(--baffa-gold-primary)',
                backdropFilter: 'blur(16px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--baffa-gold-primary)', marginBottom: '8px' }}>
                اختر البوت المصري:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                {seatInfo.isBot && (
                  <div
                    onClick={() => {
                      onAdminToggleBot(seatInfo.seat, false);
                      setEditingBotSeat(null);
                    }}
                    style={{
                      padding: '6px 8px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'rgba(239, 68, 68, 0.18)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#fca5a5',
                      marginBottom: '4px',
                    }}
                  >
                    <span className="arabic-font" style={{ fontWeight: 800 }}>إخلاء المقعد (إزالة البوت)</span>
                    <X size={14} />
                  </div>
                )}
                {Object.values(OFFICIAL_BAFFA_BOTS).map((b) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      onAdminToggleBot(seatInfo.seat, true, b.id);
                      setEditingBotSeat(null);
                    }}
                    style={{
                      padding: '6px 8px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(245, 158, 11, 0.2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)')}
                  >
                    <span className="arabic-font" style={{ fontWeight: 800, color: 'var(--baffa-text-primary)' }}>{b.arabicName}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--baffa-gold-primary)', fontWeight: 700 }}>{b.difficulty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Seat Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span
              className="arabic-font"
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: isCurrentUser
                  ? 'var(--baffa-gold-hover)'
                  : isBotSeat
                  ? 'var(--baffa-cyan-primary)'
                  : isOtherHuman
                  ? '#94a3b8'
                  : 'var(--baffa-success)',
              }}
            >
              {isCurrentUser
                ? (isMobile ? '✨ مقعدك' : '✨ مقعدك الحالي')
                : isBotSeat
                ? (isMobile ? '🤖 بوت' : '🤖 بوت (اضغط للجلوس مكانه)')
                : isOtherHuman
                ? (isMobile ? '👤 لاعب' : '👤 لاعب حقيقي (مشغول)')
                : (isMobile ? '🟢 شاغر' : '🟢 مقعد شاغر (اضغط للجلوس)')}
            </span>

            {isAdmin && (
              <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setSwapFromSeat(swapFromSeat === seatInfo.seat ? null : seatInfo.seat)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: isSwapSource ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                    color: isSwapSource ? '#080d1a' : 'var(--baffa-text-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                  title="تبديل مكان المقعد"
                >
                  <ArrowLeftRight size={13} />
                </button>

                <button
                  onClick={() => setEditingBotSeat(editingBotSeat === seatInfo.seat ? null : seatInfo.seat)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: seatInfo.isBot ? 'rgba(6, 182, 212, 0.25)' : 'var(--baffa-bg-elevated)',
                    color: seatInfo.isBot ? 'var(--baffa-cyan-primary)' : 'var(--baffa-text-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                  title={seatInfo.isBot ? 'تغيير شخصية البوت' : 'إضافة بوت في المقعد'}
                >
                  <Bot size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        <span
          className="arabic-font"
          style={{
            fontSize: isMobile ? '0.72rem' : '0.8rem',
            color: 'var(--baffa-text-muted)',
            fontWeight: 700,
            maxWidth: isMobile ? '110px' : undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          {positionLabel}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header Info */}
      <div
        className="baffa-card"
        style={{
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--baffa-text-primary)' }}>
              {room.name}
            </h1>
            {isAdmin && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  backgroundColor: 'var(--baffa-gold-muted)',
                  color: 'var(--baffa-gold-primary)',
                  borderRadius: 'var(--baffa-radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <Shield size={12} /> Room Admin
              </span>
            )}
            {isJudge && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  color: 'var(--baffa-team1-color)',
                  borderRadius: 'var(--baffa-radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <Gavel size={12} /> أنت حَكَم الطاولة
              </span>
            )}
            {isSpectator && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  backgroundColor: 'rgba(6, 182, 212, 0.2)',
                  color: 'var(--baffa-cyan-primary)',
                  borderRadius: 'var(--baffa-radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <Eye size={12} /> أنت متفرّج
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)', marginTop: '4px' }}>
            Egyptian Domino 2v2 (Counter-Clockwise)
          </p>
        </div>

        {/* Room Code Badge & Sharing Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Room Code */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 12px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: 'var(--baffa-bg-elevated)',
              border: '1px solid var(--baffa-surface-glass-border)',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>الكود:</span>
            <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '2px', color: 'var(--baffa-gold-hover)' }}>
              {room.code}
            </span>
            <button
              onClick={handleCopyCode}
              style={{ color: copiedCode ? 'var(--baffa-success)' : 'var(--baffa-text-secondary)', padding: '2px 4px' }}
              title="نسخ كود الغرفة"
            >
              {copiedCode ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          {/* Copy Direct Invite Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: copiedLink ? 'rgba(16, 185, 129, 0.2)' : 'var(--baffa-bg-elevated)',
              border: copiedLink ? '1px solid rgba(16, 185, 129, 0.6)' : '1px solid var(--baffa-surface-glass-border)',
              color: copiedLink ? '#34d399' : 'var(--baffa-text-primary)',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="نسخ رابط مباشر للدخول إلى الطاولة فوراً"
          >
            {copiedLink ? <Check size={15} /> : <Link size={15} />}
            <span className="arabic-font">{copiedLink ? 'تم نسخ الرابط!' : 'نسخ الرابط 🔗'}</span>
          </button>

          {/* WhatsApp Share Button */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: 'var(--baffa-radius-md)',
              background: 'linear-gradient(135deg, #25D366, #128C7E)',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              boxShadow: '0 0 14px rgba(37, 211, 102, 0.35)',
              transition: 'all 0.15s ease',
            }}
            title="مشاركة دعوة الطاولة عبر واتساب"
          >
            <Share2 size={15} />
            <span className="arabic-font">مشاركة واتساب 💬</span>
          </button>
        </div>
      </div>

      {/* Prominent Role Selector Bar */}
      <div
        className="baffa-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          backgroundColor: '#ffffff',
          border: '1.5px solid rgba(245, 158, 11, 0.35)',
          boxShadow: '0 4px 20px rgba(245, 158, 11, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>🎭</span>
            <span className="arabic-font" style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--baffa-text-primary)' }}>
              اختر دورك الحالي في الغرفة:
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--baffa-text-muted)' }}>
            يمكنك تغيير دورك في أي وقت قبل بدء الماتش
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: isMobile ? '6px' : '10px' }}>
          {/* 1. Player Button */}
          <button
            onClick={() => onSelectSeat(0)}
            style={{
              padding: isMobile ? '8px 4px' : '12px 14px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: isPlayer ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
              color: isPlayer ? '#080d1a' : 'var(--baffa-text-primary)',
              border: isPlayer ? '2px solid var(--baffa-gold-hover)' : '1px solid var(--baffa-surface-glass-border)',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isMobile ? '4px' : '8px',
              transition: 'all 0.2s ease',
              boxShadow: isPlayer ? '0 0 16px rgba(245, 158, 11, 0.5)' : 'none',
            }}
          >
            <span style={{ fontSize: isMobile ? '0.9rem' : '1.1rem' }}>🎮</span>
            <span className="arabic-font" style={{ fontSize: isMobile ? '0.78rem' : '0.95rem' }}>لاعب</span>
          </button>

          {/* 2. Judge Button */}
          <button
            onClick={onJoinAsJudge}
            style={{
              padding: isMobile ? '8px 4px' : '12px 14px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: isJudge ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
              color: isJudge ? '#080d1a' : 'var(--baffa-text-primary)',
              border: isJudge ? '2px solid var(--baffa-gold-hover)' : '1px solid var(--baffa-surface-glass-border)',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isMobile ? '4px' : '8px',
              transition: 'all 0.2s ease',
              boxShadow: isJudge ? '0 0 16px rgba(245, 158, 11, 0.5)' : 'none',
            }}
          >
            <Gavel size={isMobile ? 14 : 18} />
            <span className="arabic-font" style={{ fontSize: isMobile ? '0.78rem' : '0.95rem' }}>حَكَم</span>
          </button>

          {/* 3. Spectator Button */}
          <button
            onClick={onJoinAsSpectator}
            style={{
              padding: isMobile ? '8px 4px' : '12px 14px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: isSpectator ? '#111827' : 'var(--baffa-bg-elevated)',
              color: isSpectator ? '#fbbf24' : 'var(--baffa-text-primary)',
              border: isSpectator ? '2px solid #f59e0b' : '1px solid var(--baffa-surface-glass-border)',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isMobile ? '4px' : '8px',
              transition: 'all 0.2s ease',
              boxShadow: isSpectator ? '0 0 16px rgba(245, 158, 11, 0.4)' : 'none',
            }}
          >
            <Eye size={isMobile ? 14 : 18} />
            <span className="arabic-font" style={{ fontSize: isMobile ? '0.78rem' : '0.95rem' }}>متفرّج</span>
          </button>
        </div>
      </div>

      {/* Room Error Banner */}
      {errorMessage &&
        !errorMessage.toLowerCase().includes('in progress') &&
        !errorMessage.toLowerCase().includes('spectator') &&
        !errorMessage.toLowerCase().includes('already') && (
        <div
          className="animate-fade-in"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            color: '#fca5a5',
            fontSize: '0.9rem',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Admin / Judge Settings Bar */}
      {(isAdmin || isJudge) && (
        <div
          className="baffa-card"
          style={{
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          {/* Row 1: Target Score */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={18} style={{ color: 'var(--baffa-gold-primary)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>هدف الماتش (Target Score):</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => onAdminUpdateSettings({ targetScore: 101 })}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: room.settings.targetScore === 101 ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                  color: room.settings.targetScore === 101 ? '#000' : '#fff',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                }}
              >
                101 نقطة
              </button>
              <button
                type="button"
                onClick={() => onAdminUpdateSettings({ targetScore: 151 })}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: room.settings.targetScore === 151 ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                  color: room.settings.targetScore === 151 ? '#000' : '#fff',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                }}
              >
                151 نقطة
              </button>
            </div>
          </div>

          {/* Row 2: Thinking Time (Turn Timer) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: 'var(--baffa-gold-primary)' }} />
              <span className="arabic-font" style={{ fontWeight: 800, fontSize: '0.95rem' }}>مدة التفكير (عداد الثواني):</span>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { label: '5 ثواني', sec: 5 },
                { label: '10 ثواني', sec: 10 },
                { label: '20 ثانية', sec: 20 },
                { label: '30 ثانية', sec: 30 },
                { label: 'دقيقة', sec: 60 },
              ].map((opt) => {
                const isSelected = (room.settings.roundTimerSeconds || 20) === opt.sec;
                return (
                  <button
                    key={opt.sec}
                    type="button"
                    onClick={() => onAdminUpdateSettings({ roundTimerSeconds: opt.sec })}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: isSelected ? 'var(--baffa-gold-primary)' : 'var(--baffa-bg-elevated)',
                      color: isSelected ? '#000' : '#fff',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      border: isSelected ? '1px solid var(--baffa-gold-primary)' : '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Communication & Social Controls (Voice, Chat, Emojis) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={18} style={{ color: 'var(--baffa-gold-primary)' }} />
              <span className="arabic-font" style={{ fontWeight: 800, fontSize: '0.95rem' }}>التحكم في التواصل والدردشة:</span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {/* Voice Chat Toggle */}
              <button
                type="button"
                onClick={() => onAdminUpdateSettings({ voiceEnabled: !(room.settings.voiceEnabled !== false) })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: room.settings.voiceEnabled !== false ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: room.settings.voiceEnabled !== false ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(239, 68, 68, 0.4)',
                  color: room.settings.voiceEnabled !== false ? '#34d399' : '#f87171',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="تفعيل أو كتم المحادثة الصوتية (المايك) لجميع الحاضرين"
              >
                {room.settings.voiceEnabled !== false ? <Mic size={16} /> : <MicOff size={16} />}
                <span className="arabic-font">المايك والصوت: {room.settings.voiceEnabled !== false ? 'مفعّل' : 'معطّل'}</span>
              </button>

              {/* Quick Chat Toggle */}
              <button
                type="button"
                onClick={() => onAdminUpdateSettings({ quickChatEnabled: !(room.settings.quickChatEnabled !== false) })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: room.settings.quickChatEnabled !== false ? 'rgba(6, 182, 212, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: room.settings.quickChatEnabled !== false ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(239, 68, 68, 0.4)',
                  color: room.settings.quickChatEnabled !== false ? '#22d3ee' : '#f87171',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="تفعيل أو قفل الشات والرسائل السريعة"
              >
                {room.settings.quickChatEnabled !== false ? <MessageSquare size={16} /> : <MessageSquareOff size={16} />}
                <span className="arabic-font">الشات والرسائل: {room.settings.quickChatEnabled !== false ? 'مفعّل' : 'معطّل'}</span>
              </button>

              {/* Emojis / Reactions Toggle */}
              <button
                type="button"
                onClick={() => onAdminUpdateSettings({ reactionsEnabled: !(room.settings.reactionsEnabled !== false) })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: room.settings.reactionsEnabled !== false ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: room.settings.reactionsEnabled !== false ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(239, 68, 68, 0.4)',
                  color: room.settings.reactionsEnabled !== false ? '#fbbf24' : '#f87171',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="تفعيل أو قفل التفاعلات والإيموجيز"
              >
                <Smile size={16} style={{ opacity: room.settings.reactionsEnabled !== false ? 1 : 0.4 }} />
                <span className="arabic-font">الإيموجيز والتفاعل: {room.settings.reactionsEnabled !== false ? 'مفعّل' : 'معطّل'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player View: Rules & Features Summary Badge (when not Admin/Judge) */}
      {!isAdmin && !isJudge && (
        <div
          className="baffa-card"
          style={{
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={16} style={{ color: 'var(--baffa-gold-primary)' }} />
            <span className="arabic-font" style={{ fontSize: '0.85rem', color: 'var(--baffa-text-secondary)', fontWeight: 600 }}>
              قواعد اللقاء المضبوطة بواسطة الأدمن:
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--baffa-gold-hover)' }}>
              {room.settings.targetScore} نقطة
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>•</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--baffa-text-secondary)' }}>
              {room.settings.roundTimerSeconds || 20}ث للتفكير
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: room.settings.voiceEnabled !== false ? '#34d399' : '#94a3b8' }}>
              {room.settings.voiceEnabled !== false ? <Mic size={14} /> : <MicOff size={14} />}
              <span>{room.settings.voiceEnabled !== false ? 'صوت مفعّل' : 'صوت معطّل'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: room.settings.quickChatEnabled !== false ? '#22d3ee' : '#94a3b8' }}>
              {room.settings.quickChatEnabled !== false ? <MessageSquare size={14} /> : <MessageSquareOff size={14} />}
              <span>{room.settings.quickChatEnabled !== false ? 'شات مفعّل' : 'شات معطّل'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: room.settings.reactionsEnabled !== false ? '#fbbf24' : '#94a3b8' }}>
              <Smile size={14} />
              <span>{room.settings.reactionsEnabled !== false ? 'إيموجي مفعّل' : 'إيموجي معطّل'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Seating Table Arena (2v2 Opposite Layout) */}
      <div
        className="baffa-card"
        style={{
          padding: isMobile ? '16px 8px' : '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isMobile ? '12px' : '24px',
          position: 'relative',
          background: 'radial-gradient(ellipse at 50% 50%, #fef08a 0%, #f59e0b 50%, #d97706 100%)',
          border: '3px solid #111827',
          outline: '2.5px solid #fbbf24',
          borderRadius: isMobile ? '16px' : '32px',
          boxShadow: '0 8px 30px rgba(245, 158, 11, 0.25)',
        }}
      >
        {/* North Seat (Team 1 Partner) */}
        {renderSeatCard(
          room.seats[2],
          room.seats[2]?.playerId === currentUser.id
            ? 'فريق 1 (أنت)'
            : room.seats[2]?.isBot
            ? `فريق 1 (🤖 بوت: ${room.seats[2]?.username || 'السامي'})`
            : `فريق 1 (${room.seats[2]?.username || 'زميلك'})`
        )}

        {/* Middle Row: West Seat + Center Table Felt + East Seat */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: '750px',
            gap: isMobile ? '6px' : '16px',
          }}
        >
          {renderSeatCard(
            room.seats[3],
            room.seats[3]?.playerId === currentUser.id
              ? 'فريق 2 (أنت)'
              : room.seats[3]?.isBot
              ? `فريق 2 (🤖 بوت: ${room.seats[3]?.username || 'رقم واحد'})`
              : `فريق 2 (${room.seats[3]?.username || 'لاعب'})`
          )}

          <div
            style={{
              flex: isMobile ? '0 1 55px' : 1,
              height: isMobile ? '55px' : '120px',
              borderRadius: isMobile ? '8px' : 'var(--baffa-radius-xl)',
              border: '2px dashed #111827',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '2px' : '12px',
              textAlign: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              minWidth: isMobile ? '36px' : '120px',
              maxWidth: isMobile ? '60px' : 'none',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
            }}
          >
            <span className="arabic-font" style={{ fontSize: isMobile ? '0.9rem' : '1.4rem', fontWeight: 900, color: '#111827' }}>
              بَفّة
            </span>
            <span style={{ fontSize: isMobile ? '0.55rem' : '0.75rem', color: 'var(--baffa-text-secondary)', marginTop: '1px' }}>
              فريق 1 ضد 2
            </span>
          </div>

          {renderSeatCard(
            room.seats[1],
            room.seats[1]?.playerId === currentUser.id
              ? 'فريق 2 (أنت)'
              : room.seats[1]?.isBot
              ? `فريق 2 (🤖 بوت: ${room.seats[1]?.username || 'القط'})`
              : `فريق 2 (${room.seats[1]?.username || 'لاعب'})`
          )}
        </div>

        {/* South Seat (Team 1 User/Captain or Bot) */}
        {renderSeatCard(
          room.seats[0],
          room.seats[0]?.playerId === currentUser.id
            ? 'فريق 1 (أنت)'
            : room.seats[0]?.isBot
            ? `فريق 1 (🤖 بوت: ${room.seats[0]?.username || 'الرايق'})`
            : `فريق 1 (${room.seats[0]?.username || 'لاعب'})`
        )}
      </div>

      {/* Lobby Action Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {canStartMatch && !isJudge && !isSpectator && !allSeatsOccupied && (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: 'var(--baffa-gold-primary)',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              textAlign: 'center',
            }}
          >
            <span>⚠️</span>
            <span className="arabic-font">
              المقاعد غير مكتملة. يمكنك انتظار انضمام أصدقائك عبر كود الغرفة ({room.code}) أو إضافة بوت في المقاعد الشاغرة يدويًا بالضغط على أيقونة البوت 🤖.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', gap: isMobile ? '10px' : '16px', width: '100%' }}>
          <button onClick={onLeaveRoom} className="baffa-btn-secondary" style={{ width: isMobile ? '100%' : 'auto' }}>
            مغادرة الغرفة (Leave Room)
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: isMobile ? '100%' : 'auto' }}>
            {canStartMatch ? (
              <button
                onClick={handleStartMatch}
                disabled={!canClickStart || isStarting}
                className="baffa-btn-primary"
                style={{
                  width: isMobile ? '100%' : 'auto',
                  padding: isMobile ? '12px 20px' : '14px 36px',
                  fontSize: isMobile ? '1rem' : '1.1rem',
                  backgroundColor: isSpectator ? 'var(--baffa-cyan-primary)' : undefined,
                  color: isSpectator ? '#080d1a' : undefined,
                  opacity: !canClickStart || isStarting ? 0.6 : 1,
                  cursor: !canClickStart || isStarting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                {isStarting ? (
                  <>
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        border: '2.5px solid rgba(8, 13, 26, 0.3)',
                        borderTopColor: '#080d1a',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    />
                    <span className="arabic-font" style={{ fontSize: isMobile ? '1rem' : '1.15rem' }}>
                      جارٍ تجهيز الطاولة وبدء الماتش...
                    </span>
                  </>
                ) : (
                  <>
                    <Play size={20} />
                    <span className="arabic-font" style={{ fontSize: isMobile ? '1rem' : '1.15rem' }}>
                      {isJudge
                        ? 'ابدأ الماتش (كحكم) ⚡'
                        : isSpectator
                        ? 'ابدأ المشاهدة ⚡'
                        : 'ابدأ الماتش ⚡'}
                    </span>
                  </>
                )}
              </button>
            ) : (
              <div style={{ color: 'var(--baffa-text-muted)', fontSize: '0.9rem', textAlign: 'center', width: '100%' }}>
                في انتظار الأدمن لبدء الماتش...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
