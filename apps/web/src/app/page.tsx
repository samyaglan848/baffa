'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SanitizedGameState, UserRole, PlayerSeat, TeamId, BotId, OFFICIAL_BAFFA_BOTS } from '@baffa/shared';
import { useGameSocket, CurrentUser } from '../hooks/useGameSocket';
import { useGameAudio } from '../hooks/useGameAudio';
import { Navbar, AppView } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { HomeScreen } from '../components/home/HomeScreen';
import { RoomLobby } from '../components/room/RoomLobby';
import { GameTable } from '../components/game/GameTable';
import { MatchHistoryScreen } from '../components/history/MatchHistoryScreen';
import { StatisticsScreen } from '../components/statistics/StatisticsScreen';
import { ProfileScreen } from '../components/profile/ProfileScreen';
import { PublicProfileModal } from '../components/profile/PublicProfileModal';
import { SettingsModal } from '../components/settings/SettingsModal';
import { AuthModal } from '../components/auth/AuthModal';

export default function App() {
  const [mounted, setMounted] = useState(false);
  const { playSound } = useGameAudio(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    socket,
    isConnected,
    currentUser,
    myRole,
    room,
    gameState,
    errorMessage,
    latestBotMessage,
    latestNotification,
    setLatestNotification,
    latestRefereeDecision,
    createRoom,
    joinRoom,
    joinAsJudge,
    joinAsSpectator,
    selectSeat,
    adminMoveSeat,
    adminToggleBot,
    adminUpdateSettings,
    adminStartMatch,
    playTile,
    passTurn,
    judgeReportCheating,
    judgeWarnPlayer,
    judgeDirectRedCard,
    judgeMuteAction,
    judgeVoidRound,
    judgeGrantExtraTime,
    judgeTerminateMatch,
    judgeSubSeat,
    dismissRefereeDecision,
    requestNextRound,
    requestRematch,
    leaveRoom,
    dismissNotification,
    setAuthSession,
    updateCurrentUser,
    triggerBotTurn,
  } = useGameSocket();

  const [currentView, setCurrentView] = useState<AppView>('HOME');
  const [showSettings, setShowSettings] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedPublicUser, setSelectedPublicUser] = useState<string | null>(null);

  // Auto-join if URL contains ?room=CODE or ?join=CODE or sessionStorage has active room
  const autoJoinAttemptedRef = useRef(false);
  const [isReconnectingRoom, setIsReconnectingRoom] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || room) {
      if (room) setIsReconnectingRoom(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code =
      params.get('room') ||
      params.get('join') ||
      params.get('code') ||
      sessionStorage.getItem('baffa_active_room_code');

    if (code) {
      setIsReconnectingRoom(true);
    }
  }, [room]);

  // If an error occurs while reconnecting (e.g. room not found or closed), immediately abort loading
  useEffect(() => {
    if (errorMessage && isReconnectingRoom) {
      setIsReconnectingRoom(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('baffa_active_room_code');
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('room');
        currentUrl.searchParams.delete('join');
        currentUrl.searchParams.delete('code');
        currentUrl.searchParams.delete('role');
        window.history.replaceState({}, '', currentUrl.pathname);
      }
    }
  }, [errorMessage, isReconnectingRoom]);

  // Safety Timeout: Never let the user get stuck on "جاري العودة إلى الطاولة..." for more than 4 seconds
  useEffect(() => {
    if (!isReconnectingRoom || room) return;

    const timeout = setTimeout(() => {
      console.warn('[RECONNECT_SAFEGUARD] Room reconnect timed out after 4s. Returning to home.');
      setIsReconnectingRoom(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('baffa_active_room_code');
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('room');
        currentUrl.searchParams.delete('join');
        currentUrl.searchParams.delete('code');
        currentUrl.searchParams.delete('role');
        window.history.replaceState({}, '', currentUrl.pathname);
      }
      setLatestNotification({
        type: 'INFO',
        message: 'Could not rejoin the table (it may have ended).',
        arabicMessage: 'لم نتمكن من العودة إلى الطاولة (قد تكون انتهت أو أُغلقت).',
        timestamp: Date.now(),
      });
      setTimeout(() => setLatestNotification(null), 7000);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [isReconnectingRoom, room]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isConnected || room || autoJoinAttemptedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const code =
      params.get('room') ||
      params.get('join') ||
      params.get('code') ||
      sessionStorage.getItem('baffa_active_room_code');
    const asRole = params.get('role');

    if (code) {
      autoJoinAttemptedRef.current = true;
      const cleanCode = code.trim().toUpperCase();
      sessionStorage.setItem('baffa_active_room_code', cleanCode);
      if (asRole === 'JUDGE') {
        joinAsJudge(cleanCode);
      } else if (asRole === 'SPECTATOR') {
        joinAsSpectator(cleanCode);
      } else {
        joinRoom(cleanCode);
      }
      // Keep query param in browser address bar so copy-paste or F5 refresh ALWAYS stays in room!
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get('room') !== cleanCode) {
        currentUrl.searchParams.set('room', cleanCode);
        window.history.replaceState({}, '', currentUrl.toString());
      }
    }
  }, [isConnected, room, joinRoom, joinAsJudge, joinAsSpectator]);

  // Keep URL search query in sync whenever room code exists
  useEffect(() => {
    if (typeof window === 'undefined' || !room?.code) return;
    sessionStorage.setItem('baffa_active_room_code', room.code);
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get('room') !== room.code) {
      currentUrl.searchParams.set('room', room.code);
      window.history.replaceState({}, '', currentUrl.toString());
    }
  }, [room?.code]);

  // Play audio alert for notifications received in lobby or home screen (GameTable handles its own audio)
  useEffect(() => {
    if (!latestNotification) return;
    const isPlaying = Boolean(
      room &&
      (gameState || room.matchStatus === 'PLAYING') &&
      ['PLAYING', 'ROUND_FINISHED', 'MATCH_FINISHED', 'DEALING'].includes(gameState?.status || '')
    );
    if (isPlaying) return;

    if (latestNotification.type === 'WARNING' || latestNotification.type === 'ALERT') {
      playSound('warning');
    } else if (latestNotification.type === 'SUCCESS') {
      playSound('pop');
    }
  }, [latestNotification, room, gameState, playSound]);

  if (!mounted || (isReconnectingRoom && !room)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--baffa-bg-canvas)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            className="animate-float"
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, var(--baffa-gold-primary), #b45309)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <span className="arabic-font" style={{ fontSize: '2rem', fontWeight: 900, color: '#080d1a' }}>
              بَفّة
            </span>
          </div>
          <p className="arabic-font" style={{ color: 'var(--baffa-gold-hover)', fontSize: '1.05rem', fontWeight: 700 }}>
            {isReconnectingRoom ? 'جاري العودة إلى الطاولة...' : 'جاري تشغيل منصة بَفّة...'}
          </p>
          {isReconnectingRoom && (
            <button
              onClick={() => {
                setIsReconnectingRoom(false);
                if (typeof window !== 'undefined') {
                  sessionStorage.removeItem('baffa_active_room_code');
                  const url = new URL(window.location.href);
                  url.searchParams.delete('room');
                  url.searchParams.delete('join');
                  url.searchParams.delete('code');
                  url.searchParams.delete('role');
                  window.history.replaceState({}, '', url.pathname);
                }
                setCurrentView('HOME');
              }}
              className="baffa-btn-secondary arabic-font"
              style={{
                marginTop: '18px',
                padding: '8px 22px',
                fontSize: '0.88rem',
                borderRadius: '20px',
                cursor: 'pointer',
              }}
            >
              إلغاء والعودة للرئيسية ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleQuickPlay = () => {
    createRoom(
      'لعب سريع (بَفّة قهوة)',
      {
        targetScore: 101,
        fillWithBots: true,
        maxPlayers: 4,
        allowJudge: true,
        allowSpectator: true,
        voiceEnabled: true,
        quickChatEnabled: true,
        reactionsEnabled: true,
        selectedBotId: 'EL_SAMY',
      },
      'ADMIN'
    );
    setCurrentView('HOME');
  };

  const handleLeaveRoom = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('baffa_active_room_code');
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('room');
      currentUrl.searchParams.delete('join');
      currentUrl.searchParams.delete('code');
      currentUrl.searchParams.delete('role');
      window.history.replaceState({}, '', currentUrl.pathname);
    }
    leaveRoom();
    setLatestNotification({
      type: 'INFO',
      message: 'You have left the room.',
      arabicMessage: 'لقد غادرت الغرفة.',
      timestamp: Date.now(),
    });
    setTimeout(() => {
      setLatestNotification(null);
    }, 12000);
    setCurrentView('HOME');
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('baffa_user');
      localStorage.removeItem('baffa_token');
      sessionStorage.removeItem('baffa_user');
      sessionStorage.removeItem('baffa_token');
      sessionStorage.removeItem('baffa_active_room_code');
    }
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const guestUser: CurrentUser = {
      id: `user_guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      username: `لاعب_${randomNum}`,
      avatar: 'avatar-1',
      token: undefined,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('baffa_user', JSON.stringify(guestUser));
      sessionStorage.setItem('baffa_user', JSON.stringify(guestUser));
    }
    setAuthSession(guestUser, '');
    setCurrentView('HOME');
    setShowAuthModal(true);
  };

  // Immediate seamless game table view with zero delay
  const activeGameState: SanitizedGameState | null = (() => {
    if (gameState) return gameState;
    if (!room || room.matchStatus !== 'PLAYING') return null;

    const isJudgeFallback = myRole === 'JUDGE' || Boolean(room.judge);
    const isSpectatorFallback = myRole === 'SPECTATOR' || Boolean(room.spectator);
    const effectiveRoleFallback: UserRole = isJudgeFallback ? 'JUDGE' : isSpectatorFallback ? 'SPECTATOR' : myRole;

    const defaultBots = [
      { name: 'الرايق', botId: 'EL_RAYEQ' as const, avatar: 'bot-rayeq' },
      { name: 'القط', botId: 'EL_QETT' as const, avatar: 'bot-qett' },
      { name: 'السامي', botId: 'EL_SAMY' as const, avatar: 'bot-samy' },
      { name: 'رقم واحد', botId: 'RAQAM_WAHED' as const, avatar: 'bot-raqam-wahed' },
    ];

    const fallbackPlayers = room.seats.map((s, idx) => {
      const isBotSeat = s.isBot || (isJudgeFallback && !s.occupied);
      const botProfile = s.botId ? OFFICIAL_BAFFA_BOTS[s.botId] : undefined;
      const botName = botProfile?.arabicName || s.username || defaultBots[idx]?.name || `بوت ${idx + 1}`;
      const botAvatar = botProfile?.avatar || s.avatar || defaultBots[idx]?.avatar || 'bot-rayeq';

      return {
        seat: (s.seat ?? idx) as PlayerSeat,
        team: ((s.seat ?? idx) === 0 || (s.seat ?? idx) === 2 ? 1 : 2) as TeamId,
        playerId: s.playerId || `bot_${idx}`,
        username: isBotSeat ? botName : (s.username || `Player ${idx + 1}`),
        avatar: isBotSeat ? botAvatar : (s.avatar || `avatar-${idx + 1}`),
        isBot: isBotSeat,
        botId: s.botId || (isBotSeat ? (defaultBots[idx]?.botId as BotId) : undefined),
        isConnected: true,
        isReady: true,
        hiddenTilesCount: 7,
        warnings: 0,
        isChatMuted: false,
        isReactionsMuted: false,
        isVoiceMuted: false,
      };
    });

    return {
      matchId: `match_${room.id}`,
      roomId: room.id,
      status: 'PLAYING',
      roundNumber: 1,
      targetScore: room.settings.targetScore || 101,
      team1Score: 0,
      team2Score: 0,
      currentTurnSeat: 0,
      starterSeat: 0,
      chain: { tiles: [], leftEndValue: null, rightEndValue: null },
      players: fallbackPlayers,
      myHand: [],
      mySeat: isJudgeFallback || isSpectatorFallback ? null : 0,
      myRole: effectiveRoleFallback,
      myLegalMoves: [],
      canPass: false,
      lastRoundResult: null,
      matchResult: null,
      consecutivePassCount: 0,
      sequenceNumber: 1,
      cheatingEvent: null,
      turnTimeLimit: room.settings.roundTimerSeconds || 20,
      turnStartTime: Date.now(),
    };
  })();

  const isPlayingGame = Boolean(
    room &&
    activeGameState &&
    room.matchStatus === 'PLAYING' &&
    ['PLAYING', 'ROUND_FINISHED', 'MATCH_FINISHED', 'DEALING'].includes(activeGameState.status)
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: isPlayingGame ? '100dvh' : undefined,
        minHeight: isPlayingGame ? undefined : '100vh',
        maxHeight: isPlayingGame ? '100dvh' : undefined,
        overflow: isPlayingGame ? 'hidden' : 'auto',
        backgroundColor: 'var(--baffa-bg-canvas)',
      }}
    >
      {!isPlayingGame && (
        <Navbar
          isConnected={isConnected}
          currentUser={currentUser}
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view)}
          onOpenSettings={() => setShowSettings(true)}
          onLeaveRoom={handleLeaveRoom}
          inRoom={!!room}
        />
      )}

      {/* Global Error Banner */}
      {errorMessage &&
        !errorMessage.toLowerCase().includes('in progress') &&
        !errorMessage.toLowerCase().includes('spectator') &&
        !errorMessage.toLowerCase().includes('already') && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.95)',
            color: '#fff',
            padding: '10px 24px',
            textAlign: 'center',
            fontSize: '0.9rem',
            fontWeight: 700,
            zIndex: 50,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Global Room/Match Notification Toast (Visible on Home, Lobby & GameTable) */}
      {latestNotification && (
        <div
          className="animate-float arabic-font"
          style={{
            position: 'fixed',
            top: isPlayingGame ? '46px' : '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '7px 16px',
            borderRadius: '20px',
            backgroundColor:
              latestNotification.type === 'ALERT'
                ? 'rgba(239, 68, 68, 0.98)'
                : latestNotification.type === 'WARNING'
                ? 'rgba(245, 158, 11, 0.98)'
                : latestNotification.type === 'SUCCESS'
                ? 'rgba(16, 185, 129, 0.98)'
                : 'rgba(15, 23, 42, 0.98)',
            color: '#fff',
            fontSize: '0.82rem',
            fontWeight: 800,
            zIndex: 999999,
            border: '1.5px solid rgba(255, 255, 255, 0.4)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(16px)',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textAlign: 'center',
            maxWidth: '92vw',
          }}
        >
          <span style={{ fontSize: '1.05rem' }}>
            {latestNotification.type === 'ALERT'
              ? '🚨'
              : latestNotification.type === 'WARNING'
              ? '⚠️'
              : latestNotification.type === 'SUCCESS'
              ? '✅'
              : 'ℹ️'}
          </span>
          <span>{latestNotification.arabicMessage || latestNotification.message}</span>
          <button
            onClick={() => {
              if (dismissNotification) dismissNotification();
              else setLatestNotification(null);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.3)',
              border: '1.5px solid rgba(255, 255, 255, 0.7)',
              borderRadius: '50%',
              color: '#fff',
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginLeft: '6px',
              fontSize: '0.75rem',
              fontWeight: 900,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
            title="إغلاق التنبيه نهائياً"
            aria-label="إغلاق التنبيه"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content View Switcher */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: isPlayingGame ? '100%' : undefined, overflow: isPlayingGame ? 'hidden' : 'auto' }}>
        {/* If in Room Lobby */}
        {room && !isPlayingGame && (
          <RoomLobby
            room={room}
            currentUser={currentUser}
            myRole={myRole}
            errorMessage={errorMessage}
            onSelectSeat={selectSeat}
            onAdminMoveSeat={adminMoveSeat}
            onAdminToggleBot={adminToggleBot}
            onAdminUpdateSettings={adminUpdateSettings}
            onAdminStartMatch={adminStartMatch}
            onJoinAsJudge={() => joinAsJudge(room.id)}
            onJoinAsSpectator={() => joinAsSpectator(room.id)}
            onLeaveRoom={handleLeaveRoom}
          />
        )}

        {/* If in Active Game Table (Straight to felt table with dealing animations) */}
        {isPlayingGame && activeGameState && room && (
          <GameTable
            key={room.id}
            gameState={activeGameState}
            socket={socket}
            room={room}
            currentUserId={currentUser.id}
            currentUserAvatar={currentUser.avatar}
            myRole={myRole}
            latestBotMessage={latestBotMessage}
            latestNotification={latestNotification}
            latestRefereeDecision={latestRefereeDecision}
            onPlayTile={playTile}
            onPassTurn={passTurn}
            onJudgeDeclareCheating={judgeReportCheating}
            onJudgeWarnPlayer={judgeWarnPlayer}
            onJudgeDirectRedCard={judgeDirectRedCard}
            onJudgeMuteAction={judgeMuteAction}
            onJudgeVoidRound={judgeVoidRound}
            onJudgeGrantExtraTime={judgeGrantExtraTime}
            onJudgeTerminateMatch={judgeTerminateMatch}
            onJudgeSubSeat={judgeSubSeat}
            onDismissRefereeDecision={dismissRefereeDecision}
            onDismissNotification={dismissNotification}
            onRequestNextRound={requestNextRound}
            onRematch={requestRematch}
            onLeaveMatch={handleLeaveRoom}
            onTriggerBot={triggerBotTurn}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {/* Top-Level Views when not in a room */}
        {!room && (
          <>
            {currentView === 'HOME' && (
              <HomeScreen
                currentUser={currentUser}
                onCreateRoom={(name, settings, initialRole) => createRoom(name, settings, initialRole)}
                onJoinRoom={(code) => joinRoom(code)}
                onJoinAsJudge={(code) => joinAsJudge(code)}
                onJoinAsSpectator={(code) => joinAsSpectator(code)}
                onQuickPlay={handleQuickPlay}
                onAuthSuccess={(user, token) => setAuthSession(user, token)}
              />
            )}

            {currentView === 'HISTORY' && (
              <MatchHistoryScreen
                currentUser={currentUser}
                onBackToHome={() => setCurrentView('HOME')}
              />
            )}

            {currentView === 'STATS' && (
              <StatisticsScreen
                currentUser={currentUser}
                onBackToHome={() => setCurrentView('HOME')}
              />
            )}

            {currentView === 'PROFILE' && (
              <ProfileScreen
                currentUser={currentUser}
                onBackToHome={() => setCurrentView('HOME')}
                onLogout={handleLogout}
                onProfileUpdated={(updated) => {
                  updateCurrentUser({
                    username: updated.displayName || updated.username,
                    avatar: updated.customAvatarUrl || updated.avatarUrl || updated.avatarId || 'avatar-1',
                  });
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Auth Modal (Login / Register) */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(user, token) => {
          setAuthSession(user, token);
          setShowAuthModal(false);
        }}
      />

      {/* Public Profile Modal */}
      {selectedPublicUser && (
        <PublicProfileModal
          identifier={selectedPublicUser}
          currentUserId={currentUser.id}
          token={currentUser.token}
          onClose={() => setSelectedPublicUser(null)}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        currentUser={currentUser}
        onClose={() => setShowSettings(false)}
        onLogout={handleLogout}
      />

      {!isPlayingGame && <Footer />}
    </div>
  );
}
