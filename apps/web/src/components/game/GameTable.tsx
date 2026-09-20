'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BotChatMessage,
  BotId,
  ChainEnd,
  DominoTile as DominoTileType,
  NotificationPayload,
  PlayerSeat,
  SanitizedGameState,
  SanitizedPlayerState,
  ClientEvents,
  ServerEvents,
  UserRole,
  RoomDetails,
  RefereeDecisionBroadcastPayload,
  TeamId,
} from '@baffa/shared';
import { DominoTile } from '../common/DominoTile';
import { UserAvatar } from '../common/UserAvatar';
import { JudgePanel } from './JudgePanel';
import { VoiceControls } from './VoiceControls';
import { MicPermissionModal } from './MicPermissionModal';
import { ChatAndReactions } from './ChatAndReactions';
import { RefereeDecisionModal } from './RefereeDecisionModal';
import { RefereeControlHub } from './RefereeControlHub';
import { useDominoLayout } from './useDominoLayout';
import { useElementSize } from '../../hooks/useElementSize';
import { MatchDetailsModal } from '../history/MatchDetailsModal';
import { useWebRTCVoice } from '../../hooks/useWebRTCVoice';
import { useGameAudio } from '../../hooks/useGameAudio';
import { Socket } from 'socket.io-client';
import {
  Bot,
  User,
  ArrowLeft,
  Trophy,
  RotateCcw,
  ListOrdered,
  Zap,
  Eye,
  X,
} from 'lucide-react';
import { API_URL } from '@/config/api';

// Persistent registry of announced rounds
const globalAnnouncedRounds = new Set<string>();

interface GameTableProps {
  gameState: SanitizedGameState;
  socket: Socket | null;
  room?: RoomDetails | null;
  currentUserId: string;
  currentUserAvatar?: string;
  myRole: UserRole;
  latestBotMessage: BotChatMessage | null;
  latestNotification: NotificationPayload | null;
  latestRefereeDecision?: RefereeDecisionBroadcastPayload | null;
  onPlayTile: (tile: DominoTileType, end?: ChainEnd) => void;
  onPassTurn: () => void;
  onJudgeDeclareCheating: (offendingSeat: PlayerSeat, reason: string) => void;
  onJudgeWarnPlayer?: (seat: PlayerSeat, reason?: string) => void;
  onJudgeDirectRedCard?: (seat: PlayerSeat, reason?: string) => void;
  onJudgeMuteAction?: (
    targetType: 'SEAT' | 'SPECTATOR',
    identifier: { seat?: PlayerSeat; userId?: string },
    muteType: 'CHAT' | 'REACTIONS' | 'VOICE',
    mute: boolean
  ) => void;
  onJudgeVoidRound?: (reason?: string) => void;
  onJudgeGrantExtraTime?: (seconds?: number) => void;
  onJudgeTerminateMatch?: (winnerTeam?: TeamId, reason?: string) => void;
  onJudgeSubSeat?: (
    action: 'KICK_TO_SPECTATOR' | 'RETURN_FROM_SPECTATOR' | 'SUB_SPECTATOR_TO_SEAT',
    seat: PlayerSeat,
    spectatorUserId?: string,
    botId?: BotId
  ) => void;
  onDismissRefereeDecision?: () => void;
  onDismissNotification?: () => void;
  onRequestNextRound: () => void;
  onRematch?: (roomId?: string) => void;
  onLeaveMatch: () => void;
  onTriggerBot?: (roomId?: string) => void;
}

export const GameTable: React.FC<GameTableProps> = ({
  gameState,
  socket,
  room,
  currentUserId,
  currentUserAvatar,
  myRole,
  latestBotMessage,
  latestNotification,
  latestRefereeDecision,
  onPlayTile,
  onPassTurn,
  onJudgeDeclareCheating,
  onJudgeWarnPlayer,
  onJudgeDirectRedCard,
  onJudgeMuteAction,
  onJudgeVoidRound,
  onJudgeGrantExtraTime,
  onJudgeTerminateMatch,
  onJudgeSubSeat,
  onDismissRefereeDecision,
  onDismissNotification,
  onRequestNextRound,
  onRematch,
  onLeaveMatch,
  onTriggerBot,
}) => {
  const { playSound } = useGameAudio(true);
  
  // Local UI State
  const [selectedJudgeTarget, setSelectedJudgeTarget] = useState<SanitizedPlayerState | null>(null);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showMatchTrophyModal, setShowMatchTrophyModal] = useState(false);
  const [invalidMoveToast, setInvalidMoveToast] = useState<string | null>(null);
  const [isRematchLoading, setIsRematchLoading] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  
  // In-table round end sequence states
  const [roundEndStage, setRoundEndStage] = useState<'IDLE' | 'REVEALED' | 'FLYING' | 'SCORE_PULSE' | 'DONE'>('IDLE');
  const [flyingVectors, setFlyingVectors] = useState<Record<string, { x: number; y: number }>>({});
  const [nextRoundCountdown, setNextRoundCountdown] = useState<number>(5);
  
  const [boardRef, boardSize] = useElementSize<HTMLDivElement>();
  const boardElRef = useRef<HTMLDivElement | null>(null);
  const setBoardRef = useCallback((el: HTMLDivElement | null) => {
    boardElRef.current = el;
    boardRef(el);
  }, [boardRef]);
  const { layout: placedTiles, bounds, openEnds } = useDominoLayout(gameState.chain.tiles, boardSize.width, boardSize.height);

  // Drag and Drop state - optimized with direct DOM ghost transform for 120fps
  const [dragState, setDragState] = useState<{
    tile: DominoTileType;
    index: number;
    validEnds: ChainEnd[];
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    tile: DominoTileType;
    index: number;
    startX: number;
    startY: number;
    validEnds: ChainEnd[];
  } | null>(null);
  const isDraggingRef = useRef(false);

  // Responsive device & orientation state for mobile and landscape screen optimization
  const [screenMode, setScreenMode] = useState<{
    isMobile: boolean;
    isLandscape: boolean;
    isPortraitMobile: boolean;
    isShortScreen: boolean;
  }>({
    isMobile: false,
    isLandscape: false,
    isPortraitMobile: false,
    isShortScreen: false,
  });

  useEffect(() => {
    const updateScreen = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      const isShort = h <= 540;
      const isLand = w > h && isShort;
      const isMob = w < 768 || isShort || (isTouch && Math.max(w, h) <= 1024);
      const isPortMob = isMob && !isLand;

      setScreenMode({
        isMobile: isMob,
        isLandscape: isLand,
        isPortraitMobile: isPortMob,
        isShortScreen: isShort,
      });
    };

    updateScreen();
    window.addEventListener('resize', updateScreen);
    window.addEventListener('orientationchange', updateScreen);
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', updateScreen);
    }
    return () => {
      window.removeEventListener('resize', updateScreen);
      window.removeEventListener('orientationchange', updateScreen);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', updateScreen);
      }
    };
  }, []);

  const { isMobile, isLandscape, isPortraitMobile, isShortScreen } = screenMode;
  
  // True center and bounding box of placed tiles on the felt table
  const boardCenterX = (bounds.minX + bounds.maxX) / 2;
  const boardCenterY = (bounds.minY + bounds.maxY) / 2;
  const boardSpanX = Math.max(bounds.maxX - bounds.minX + 88 + 24, 160);
  const boardSpanY = Math.max(bounds.maxY - bounds.minY + 88 + 24, 160);

  const availW = boardSize.width > 0 ? boardSize.width : (isLandscape ? 480 : isMobile ? 260 : 600);
  const availH = boardSize.height > 0 ? boardSize.height : (isLandscape ? 160 : isMobile ? 180 : 300);

  // fitScale guarantees the domino chain fits 100% inside the available space without ever overflowing or clipping
  const scaleX = availW / boardSpanX;
  const scaleY = availH / boardSpanY;
  const maxScale = isLandscape ? 0.70 : isMobile ? 0.70 : 1.0;
  const fitScale = Math.min(maxScale, Math.min(scaleX, scaleY));
  
  const animatedRoundKeyRef = useRef<string | null>(null);
  const roundEndTimersRef = useRef<NodeJS.Timeout[]>([]);
  const hasInitializedAudioRef = useRef(false);

  // Turn Thinking Timer countdown
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (gameState.status !== 'PLAYING' || !gameState.turnTimeLimit || !gameState.turnStartTime) {
      setTurnSecondsLeft(null);
      return;
    }

    const updateRemaining = () => {
      const elapsed = Math.floor((Date.now() - (gameState.turnStartTime || Date.now())) / 1000);
      const remaining = Math.max(0, (gameState.turnTimeLimit || 20) - elapsed);
      setTurnSecondsLeft(remaining);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 250);
    return () => clearInterval(interval);
  }, [gameState.status, gameState.currentTurnSeat, gameState.turnStartTime, gameState.turnTimeLimit]);

  const isJudge =
    gameState.myRole === 'JUDGE' ||
    myRole === 'JUDGE' ||
    Boolean(room?.judge?.userId === currentUserId);
  const isSpectator =
    !isJudge &&
    (gameState.myRole === 'SPECTATOR' ||
      myRole === 'SPECTATOR' ||
      Boolean(room?.spectator && room.spectator.userId === currentUserId));
  const isAllBots = Boolean(room?.seats && room.seats.length === 4 && room.seats.every((s) => s.isBot));
  const isObserver = (isJudge || isSpectator || isAllBots) && gameState.mySeat === null;
  const effectiveRole = isJudge ? 'JUDGE' : isSpectator ? 'SPECTATOR' : myRole;
  const mySeat = isObserver ? null : gameState.mySeat;
  const isMyTurn = !isObserver && mySeat !== null && gameState.currentTurnSeat === mySeat && gameState.status === 'PLAYING';
  const myLegalMoves = !isObserver ? (gameState.myLegalMoves || []) : [];

  // Recently passed players tracking: seat -> timestamp
  const [recentlyPassedSeats, setRecentlyPassedSeats] = useState<Record<number, number>>({});
  const hasAutoPassedRef = useRef(false);
  const [, setPassTick] = useState(0);

  // Authoritative tile placement vs pass detection
  const prevChainTilesCountRef = useRef(gameState.chain.tiles.length);
  const prevConsecutivePassCountRef = useRef(gameState.consecutivePassCount);
  const prevTurnSeatRef = useRef<number | null>(gameState.currentTurnSeat);
  const lastTileSoundTimeRef = useRef(0);
  const lastPassSoundTimeRef = useRef(0);

  useEffect(() => {
    if (gameState.status !== 'PLAYING') {
      prevChainTilesCountRef.current = gameState.chain.tiles.length;
      prevConsecutivePassCountRef.current = gameState.consecutivePassCount;
      prevTurnSeatRef.current = gameState.currentTurnSeat;
      return;
    }

    const prevCount = prevChainTilesCountRef.current;
    const currentCount = gameState.chain.tiles.length;
    const prevPasses = prevConsecutivePassCountRef.current;
    const currentPasses = gameState.consecutivePassCount;
    const prevTurn = prevTurnSeatRef.current;

    // CASE 1: A tile was placed on the board! (Strictly plays ONLY tile clack sound)
    if (currentCount > prevCount) {
      if (Date.now() - lastTileSoundTimeRef.current > 120) {
        playSound('tile');
        lastTileSoundTimeRef.current = Date.now();
      }
    }
    // CASE 2: No tile placed, but a player passed! (Strictly plays ONLY pass double-knock sound)
    else if (
      currentPasses > prevPasses ||
      (currentCount === prevCount &&
        prevTurn !== null &&
        prevTurn !== gameState.currentTurnSeat &&
        gameState.players.find((p) => Number(p.seat) === prevTurn)?.lastAction === 'PASS')
    ) {
      if (prevTurn !== null) {
        setRecentlyPassedSeats((prev) => ({ ...prev, [prevTurn]: Date.now() }));
      }
      if (Date.now() - lastPassSoundTimeRef.current > 200) {
        playSound('pass');
        lastPassSoundTimeRef.current = Date.now();
      }
    }

    prevChainTilesCountRef.current = currentCount;
    prevConsecutivePassCountRef.current = currentPasses;
    prevTurnSeatRef.current = gameState.currentTurnSeat;
  }, [
    gameState.chain.tiles.length,
    gameState.consecutivePassCount,
    gameState.currentTurnSeat,
    gameState.status,
    gameState.players,
    playSound,
  ]);

  // Turn announcement chime when it becomes the user's turn
  const prevIsMyTurnRef = useRef(isMyTurn);
  useEffect(() => {
    if (gameState.status === 'PLAYING' && isMyTurn && !prevIsMyTurnRef.current) {
      playSound('turn');
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn, gameState.status, playSound]);

  // Audio pop when bot speaks
  const prevBotMsgTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (latestBotMessage && latestBotMessage.timestamp !== prevBotMsgTimeRef.current) {
      prevBotMsgTimeRef.current = latestBotMessage.timestamp;
      playSound('pop');
    }
  }, [latestBotMessage, playSound]);

  // Periodic tick to automatically dismiss pass badge after 3.2s
  useEffect(() => {
    const hasActivePass = Object.values(recentlyPassedSeats).some((t) => Date.now() - t < 3200);
    if (!hasActivePass) return;
    const interval = setInterval(() => setPassTick((t) => t + 1), 400);
    return () => clearInterval(interval);
  }, [recentlyPassedSeats]);

  // Automatic pass for the human player when they have no playable cards
  useEffect(() => {
    if (!isMyTurn || !gameState.canPass || gameState.status !== 'PLAYING') {
      hasAutoPassedRef.current = false;
      return;
    }

    if (hasAutoPassedRef.current) return;

    const timer = setTimeout(() => {
      hasAutoPassedRef.current = true;
      if (mySeat !== null) {
        setRecentlyPassedSeats((prev) => ({ ...prev, [Number(mySeat)]: Date.now() }));
      }
      onPassTurn();
    }, 800);

    return () => clearTimeout(timer);
  }, [isMyTurn, gameState.canPass, gameState.status, onPassTurn, mySeat]);

  // Automated Watchdog: If round is PLAYING (or stuck in DEALING) and turn belongs to a bot or observer, ensure turn triggers
  useEffect(() => {
    if (gameState.status !== 'PLAYING' && gameState.status !== 'DEALING') return;

    const currentTurn = gameState.currentTurnSeat;
    const currentTurnPlayer = gameState.players.find((p) => Number(p.seat) === currentTurn);
    const isBotTurn = Boolean(currentTurnPlayer?.isBot);

    if (isBotTurn && onTriggerBot) {
      // Watchdog safety net: only ping server if the bot is genuinely stalled (server plays in 2000ms)
      const watchdogDelay = 4000;
      const timer = setTimeout(() => {
        onTriggerBot(gameState.roomId);
      }, watchdogDelay);
      return () => clearTimeout(timer);
    }
  }, [gameState.status, gameState.currentTurnSeat, gameState.chain.tiles.length, isObserver, onTriggerBot, gameState.roomId, gameState.players]);

  const myPlayerState = gameState.players.find((p) => p.playerId === currentUserId);
  const mySpectator =
    (room?.spectators || []).find((s) => s.userId === currentUserId) ||
    (room?.spectator?.userId === currentUserId ? room.spectator : null);

  const isAdmin =
    myRole === 'ADMIN' ||
    room?.ownerId === currentUserId ||
    room?.currentAdminId === currentUserId ||
    room?.originalAdminId === currentUserId;

  const isPresidingJudge = Boolean(isJudge || room?.judge?.userId === currentUserId);

  // Crucial: The Room Admin and Presiding Judge are NEVER blocked by room settings!
  const isAdminVoiceDisabled = Boolean(
    !isAdmin && !isPresidingJudge && room?.settings && room.settings.voiceEnabled === false
  );

  const isJudgeVoiceMuted = isPresidingJudge
    ? false
    : Boolean(myPlayerState?.isVoiceMuted || mySpectator?.isVoiceMuted);

  const isAdminChatDisabled = Boolean(
    !isAdmin && !isPresidingJudge && room?.settings && room.settings.quickChatEnabled === false
  );

  const isJudgeChatMuted = isPresidingJudge
    ? false
    : Boolean(myPlayerState?.isChatMuted || mySpectator?.isChatMuted);

  const isAdminReactionsDisabled = Boolean(
    !isAdmin && !isPresidingJudge && room?.settings && room.settings.reactionsEnabled === false
  );

  const isJudgeReactionsMuted = isPresidingJudge
    ? false
    : Boolean(myPlayerState?.isReactionsMuted || mySpectator?.isReactionsMuted);

  const {
    isMuted,
    isVoiceConnected,
    activePeers,
    isSpeaking,
    toggleMute,
    showPermissionGuide,
    setShowPermissionGuide,
    requestMicrophonePermission,
  } = useWebRTCVoice({
    socket,
    roomId: gameState.roomId,
    currentUserId,
    enabled: !isAdminVoiceDisabled,
    isForcedMuted: isJudgeVoiceMuted,
  });

  const handleToggleVoice = useCallback(() => {
    if (isJudgeVoiceMuted) {
      alert('المايك محظور عنك حالياً بقرار من حكم المباراة ⚖️');
      return;
    }

    if (isAdminVoiceDisabled) {
      alert('المايك محظور في هذه الغرفة من إعدادات الآدمن 🚫');
      return;
    }

    // If Admin or Judge clicks mic while room voice is disabled globally, auto-re-enable it for everyone!
    if ((isAdmin || isPresidingJudge) && room?.settings && room.settings.voiceEnabled === false) {
      if (socket && room?.id) {
        socket.emit(ClientEvents.ADMIN_UPDATE_SETTINGS, {
          roomId: room.id,
          settings: { voiceEnabled: true },
          user: { id: currentUserId, role: myRole },
        });
      }
    }

    toggleMute();
  }, [
    isJudgeVoiceMuted,
    isAdminVoiceDisabled,
    isAdmin,
    isPresidingJudge,
    room?.settings,
    room?.id,
    socket,
    currentUserId,
    myRole,
    toggleMute,
  ]);

  // Card dealing sequence tracking and shuffle sound
  const [isDealingRound, setIsDealingRound] = useState(false);
  const activeDealingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (gameState.status !== 'PLAYING') {
      setIsDealingRound(false);
      return;
    }

    const roundKey = `${gameState.matchId}_round_${gameState.roundNumber}`;
    if (activeDealingKeyRef.current !== roundKey || (gameState.chain.tiles.length === 0 && !activeDealingKeyRef.current)) {
      activeDealingKeyRef.current = roundKey;
      setIsDealingRound(true);
      playSound('shuffle');

      const timer = setTimeout(() => {
        setIsDealingRound(false);
      }, 1400);

      return () => clearTimeout(timer);
    }
  }, [gameState.matchId, gameState.roundNumber, gameState.status, playSound, gameState.chain.tiles.length]);

  // Real-time sound alert on anti-cheat warnings, referee decisions & match notifications
  useEffect(() => {
    if (!latestNotification) return;
    if (latestNotification.type === 'WARNING' || latestNotification.type === 'ALERT') {
      playSound('warning');
    } else if (latestNotification.type === 'SUCCESS') {
      playSound('pop');
    }
  }, [latestNotification, playSound]);

  // In-Table Round End Animation Sequence (Reveal -> Fly to score -> Pulse score -> Done)
  useEffect(() => {
    if (gameState.status === 'ROUND_FINISHED' || gameState.status === 'MATCH_FINISHED') {
      if (!gameState.lastRoundResult) return;

      const currentRoundKey = `${gameState.matchId}_round_${gameState.roundNumber}_${gameState.status}`;
      if (animatedRoundKeyRef.current === currentRoundKey) {
        return; // Already initiated this round's animation sequence
      }
      animatedRoundKeyRef.current = currentRoundKey;

      // Clear any prior pending timers
      roundEndTimersRef.current.forEach(clearTimeout);
      roundEndTimersRef.current = [];

      const isRefereePenalty = Boolean(gameState.lastRoundResult?.cheatingDetails);
      if (isRefereePenalty) {
        setRoundEndStage('DONE');
        setNextRoundCountdown(4);
        playSound('win');
        if (gameState.status === 'MATCH_FINISHED') {
          setShowMatchTrophyModal(true);
        }
        return;
      }

      // Stage 1: Reveal cards immediately in place
      setRoundEndStage('REVEALED');
      setNextRoundCountdown(2);

      // Stage 2: Keep cards revealed for 4.2s total before flying so players comfortably inspect tiles
      const t1 = setTimeout(() => {
        const scoreBadge = document.getElementById('table-score-badge');
        let targetX = window.innerWidth * 0.75;
        let targetY = 60;
        if (scoreBadge) {
          const targetRect = scoreBadge.getBoundingClientRect();
          targetX = targetRect.left + targetRect.width / 2;
          targetY = targetRect.top + targetRect.height / 2;
        }

        const losingTiles = document.querySelectorAll('[data-losing-tile="true"]');
        const vectors: Record<string, { x: number; y: number }> = {};
        losingTiles.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const curX = rect.left + rect.width / 2;
          const curY = rect.top + rect.height / 2;
          const tileId = el.getAttribute('data-tile-id');
          if (tileId) {
            vectors[tileId] = {
              x: Math.round(targetX - curX),
              y: Math.round(targetY - curY),
            };
          }
        });
        setFlyingVectors(vectors);
        setRoundEndStage('FLYING');
      }, 1000);

      // Stage 3: Hit scoreboard, pulse score delta badge, update score & play sound
      const t2 = setTimeout(() => {
        setRoundEndStage('SCORE_PULSE');
        const winnerTeam = gameState.lastRoundResult?.winnerTeam;
        const myTeam = mySeat !== null ? Number(mySeat) % 2 : null;
        if (myTeam !== null && winnerTeam !== undefined) {
          if (winnerTeam === myTeam) {
            playSound('win');
          } else {
            playSound('defeat');
          }
        } else {
          playSound('win');
        }
      }, 1700);

      // Stage 4: Settled, show next round countdown & button
      const t3 = setTimeout(() => {
        setRoundEndStage('DONE');
        if (gameState.status === 'MATCH_FINISHED') {
          setShowMatchTrophyModal(true);
        }
      }, 2300);

      roundEndTimersRef.current = [t1, t2, t3];
    } else {
      if (gameState.status === 'PLAYING' || gameState.status === 'DEALING') {
        animatedRoundKeyRef.current = null;
        roundEndTimersRef.current.forEach(clearTimeout);
        roundEndTimersRef.current = [];
        setRoundEndStage('IDLE');
        setFlyingVectors({});
        setIsRematchLoading(false);
      }
    }
  }, [gameState.status, gameState.roundNumber, gameState.lastRoundResult, gameState.matchId, playSound]);

  // Clean up sequence timers on unmount
  useEffect(() => {
    return () => {
      roundEndTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  // Automatic countdown when round ends
  useEffect(() => {
    if (roundEndStage !== 'DONE' || gameState.status !== 'ROUND_FINISHED') return;
    const timer = setInterval(() => {
      setNextRoundCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onRequestNextRound && gameState.players.some((p) => p.isBot)) {
            onRequestNextRound();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [roundEndStage, gameState.status, onRequestNextRound, gameState.players]);
  const isRoundOver = gameState.status === 'ROUND_FINISHED' || gameState.status === 'MATCH_FINISHED';

  const triggerInvalid = useCallback(() => {
    if (!isMyTurn || isRoundOver) return;
    playSound('invalid');
    setInvalidMoveToast('الكارت ده مينفعش هنا');
    setTimeout(() => setInvalidMoveToast(null), 2000);
  }, [isMyTurn, isRoundOver, playSound]);

  const handleTileClick = useCallback((tile: DominoTileType) => {
    if (!isMyTurn || isRoundOver) return;

    const legal = myLegalMoves.find(
      (m) =>
        (m.tile[0] === tile[0] && m.tile[1] === tile[1]) ||
        (m.tile[0] === tile[1] && m.tile[1] === tile[0])
    );

    if (!legal) {
      triggerInvalid();
      return;
    }

    // Play tile directly without popup prompt (user uses drag & drop to choose specific end)
    onPlayTile(legal.tile, legal.validEnds[0]);
    setSelectedTileIndex(null);
  }, [isMyTurn, isRoundOver, myLegalMoves, onPlayTile, triggerInvalid]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMyTurn || myRole !== 'PLAYER') return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      const handSize = gameState.myHand.length;
      if (handSize === 0) return;

      if (e.key === 'ArrowRight') {
        setSelectedTileIndex(prev => prev === null ? 0 : Math.min(prev + 1, handSize - 1));
      } else if (e.key === 'ArrowLeft') {
        setSelectedTileIndex(prev => prev === null ? handSize - 1 : Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (selectedTileIndex !== null) {
          handleTileClick(gameState.myHand[selectedTileIndex]);
        }
      } else if (e.key === 'Escape') {
        setSelectedTileIndex(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMyTurn, myRole, gameState.myHand, selectedTileIndex, handleTileClick]);

  const handleRematch = useCallback(() => {
    playSound('click');
    setIsRematchLoading(true);
    setShowMatchTrophyModal(false);
    setShowDetailsModal(false);

    const targetRoom = gameState?.roomId || room?.id;
    console.log('[GAMETABLE] handleRematch triggered', { targetRoom, hasSocket: !!socket, connected: socket?.connected });

    // 1. Primary socket emit
    if (socket && targetRoom) {
      socket.emit(ClientEvents.REMATCH_REQUEST, {
        roomId: targetRoom,
        user: { id: currentUserId },
      });
    }

    // 2. onRematch hook handler
    if (onRematch) {
      onRematch(targetRoom);
    }

    // 3. HTTP endpoint fallback
    if (typeof window !== 'undefined') {
      const apiUrl = API_URL;
      fetch(`${apiUrl}/api/matches/rematch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: targetRoom, userId: currentUserId }),
      }).catch(() => {});
    }

    setTimeout(() => {
      setIsRematchLoading(false);
    }, 2500);
  }, [onRematch, playSound, socket, gameState?.roomId, currentUserId, room?.id]);

  // Listen to ServerEvents.REMATCH_STARTED and ROOM_ERROR to immediately clear loading & modals
  useEffect(() => {
    if (!socket) return;
    const onRematchStarted = () => {
      console.log('[GAMETABLE] ServerEvents.REMATCH_STARTED received');
      setIsRematchLoading(false);
      setShowMatchTrophyModal(false);
      setShowDetailsModal(false);
      setRoundEndStage('IDLE');
      setFlyingVectors({});
      setSelectedTileIndex(null);
    };
    const onRoomError = (data: { message: string }) => {
      setIsRematchLoading(false);
      if (
        data.message &&
        (data.message.toLowerCase().includes('in progress') ||
          data.message.toLowerCase().includes('spectator') ||
          data.message.toLowerCase().includes('already'))
      ) {
        return;
      }
      setInvalidMoveToast(data.message || 'حدث خطأ أثناء بدء المباراة');
      setTimeout(() => setInvalidMoveToast(null), 3500);
    };

    socket.on(ServerEvents.REMATCH_STARTED, onRematchStarted);
    socket.on(ServerEvents.ROOM_ERROR, onRoomError);
    return () => {
      socket.off(ServerEvents.REMATCH_STARTED, onRematchStarted);
      socket.off(ServerEvents.ROOM_ERROR, onRoomError);
    };
  }, [socket]);

  // Reset local end-of-match states whenever a new match starts or status is active
  useEffect(() => {
    setIsRematchLoading(false);
    if (gameState.status === 'PLAYING' || gameState.status === 'DEALING') {
      setShowMatchTrophyModal(false);
      setShowDetailsModal(false);
      setRoundEndStage('IDLE');
      setFlyingVectors({});
      setSelectedTileIndex(null);
    }
  }, [gameState.matchId, gameState.status]);

  // Drag and Drop pointer handling
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const dist = Math.hypot(dx, dy);

      if (!isDraggingRef.current && dist > 7) {
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%) scale(1.18) rotate(-6deg)`;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const current = dragRef.current;
      const wasDragging = isDraggingRef.current;

      dragRef.current = null;
      isDraggingRef.current = false;
      setDragState(null);
      setIsDragging(false);

      if (!current) return;

      if (!wasDragging) {
        // Regular Click/Tap without drag!
        setSelectedTileIndex(current.index);
        handleTileClick(current.tile);
        return;
      }

      const boardEl = boardElRef.current;
      if (!boardEl) return;
      const boardRect = boardEl.getBoundingClientRect();

      const dropX = e.clientX;
      const dropY = e.clientY;

      const tableFelt = boardEl.closest('[data-table-felt="true"]');
      const tableRect = tableFelt ? tableFelt.getBoundingClientRect() : boardRect;

      // If dropped back into the hand row area, cancel drag cleanly without error
      if (dropY > tableRect.bottom - 90) {
        return;
      }

      // If dropped far outside the felt table, cancel cleanly without error
      if (
        dropX < tableRect.left - 50 ||
        dropX > tableRect.right + 50 ||
        dropY < tableRect.top - 50 ||
        dropY > tableRect.bottom + 30
      ) {
        return;
      }

      // Drag and Drop placement logic
      if (current.validEnds.length === 0) {
        triggerInvalid();
        return;
      }

      // First tile opening move
      if (gameState.chain.tiles.length === 0) {
        onPlayTile(current.tile, 'LEFT');
        setSelectedTileIndex(null);
        return;
      }

      // Only one valid end
      if (current.validEnds.length === 1) {
        onPlayTile(current.tile, current.validEnds[0]);
        setSelectedTileIndex(null);
        return;
      }

      // Two valid ends: pick the one closest to drop release!
      const boardCenterX = boardRect.left + boardRect.width / 2;
      const boardCenterY = boardRect.top + boardRect.height / 2;
      const scale = fitScale > 0 ? fitScale : 1;

      const dropBoardX = (dropX - boardCenterX) / scale;
      const dropBoardY = (dropY - boardCenterY) / scale;

      const distToRight = Math.hypot(
        dropBoardX - openEnds.RIGHT.x,
        dropBoardY - openEnds.RIGHT.y
      );
      const distToLeft = Math.hypot(
        dropBoardX - openEnds.LEFT.x,
        dropBoardY - openEnds.LEFT.y
      );

      const targetEnd: ChainEnd = distToRight <= distToLeft ? 'RIGHT' : 'LEFT';
      onPlayTile(current.tile, targetEnd);
      setSelectedTileIndex(null);
    };

    const handlePointerCancel = () => {
      dragRef.current = null;
      isDraggingRef.current = false;
      setDragState(null);
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [fitScale, gameState.chain.tiles.length, handleTileClick, onPlayTile, openEnds, playSound, triggerInvalid]);

  const getRelativeSeat = (targetSeat: number) => {
    const base = mySeat !== null ? mySeat : 0;
    const diff = (targetSeat - base + 4) % 4;
    switch(diff) {
      case 0: return 'BOTTOM'; // Me
      case 1: return 'RIGHT';  // Right Opponent (Counter-clockwise next)
      case 2: return 'TOP';    // Partner
      case 3: return 'LEFT';   // Left Opponent
      default: return 'BOTTOM';
    }
  };

  const relativePlayers = {
    BOTTOM: (gameState.players || []).find(p => p && getRelativeSeat(p.seat) === 'BOTTOM'),
    TOP: (gameState.players || []).find(p => p && getRelativeSeat(p.seat) === 'TOP'),
    LEFT: (gameState.players || []).find(p => p && getRelativeSeat(p.seat) === 'LEFT'),
    RIGHT: (gameState.players || []).find(p => p && getRelativeSeat(p.seat) === 'RIGHT'),
  };

  const getSeatTeam = (seat: number | null | undefined): 1 | 2 => {
    const s = Number(seat);
    return s === 0 || s === 2 ? 1 : 2;
  };

  const getTeamLabel = (teamId: 1 | 2): string => {
    const customName = teamId === 1
      ? (room?.settings as any)?.team1Name || (room as any)?.team1Name || (gameState as any)?.team1Name
      : (room?.settings as any)?.team2Name || (room as any)?.team2Name || (gameState as any)?.team2Name;

    if (customName && typeof customName === 'string' && customName.trim().length > 0) {
      const trimmed = customName.trim();
      return trimmed.startsWith('فريق') ? trimmed : `فريق ${trimmed}`;
    }
    return teamId === 1 ? 'فريق 1' : 'فريق 2';
  };

  const lastRound = gameState.lastRoundResult;
  const losingTeam = lastRound ? (lastRound.winnerTeam === 1 ? 2 : 1) : null;
  const myTeam = mySeat !== null ? getSeatTeam(mySeat) : 1;
  const isMyTeamWinner = lastRound ? lastRound.winnerTeam === myTeam : false;

  // Show pre-round score while cards are flying, then update when they hit the score badge
  const isPreScoreUpdate = isRoundOver && lastRound && (roundEndStage === 'REVEALED' || roundEndStage === 'FLYING');

  const displayTeam1Score = isPreScoreUpdate && lastRound.winnerTeam === 1
    ? gameState.team1Score - lastRound.roundScore
    : gameState.team1Score;

  const displayTeam2Score = isPreScoreUpdate && lastRound.winnerTeam === 2
    ? gameState.team2Score - lastRound.roundScore
    : gameState.team2Score;

  const myTeamScore = myTeam === 2 ? displayTeam2Score : displayTeam1Score;
  const opponentScore = myTeam === 2 ? displayTeam1Score : displayTeam2Score;

  // ----- MAIN TABLE RENDERING LOGIC -----

  const renderBadgeOnly = (player: SanitizedPlayerState | undefined, relation: string, orientation: 'row' | 'column' = 'row') => {
    if (!player) return null;
    const isCurrentTurn = gameState.currentTurnSeat === player.seat && gameState.status === 'PLAYING';
    const isSpeakingBot = Boolean(latestBotMessage && player.isBot && player.botId === latestBotMessage.botId);
    const isMe = mySeat === player.seat;
    const isPassed = (Date.now() - (recentlyPassedSeats[Number(player.seat)] || 0)) < 3000;
    const isPlayerSpeaking = Boolean(player.playerId && isSpeaking(player.playerId));
    const warnings = player.warnings || 0;
    const seatInfo = room?.seats?.[player.seat];
    const effectiveAvatar = (isMe ? (currentUserAvatar || player.avatar) : player.avatar) || seatInfo?.avatar;
    const isAway = Boolean(!player.isBot && (seatInfo?.presence === 'AWAY' || (player as any).presence === 'AWAY'));

    return (
      <div style={{ position: 'relative', display: 'flex', flexDirection: orientation === 'column' ? 'column' : 'row', alignItems: 'center', gap: '6px' }}>
        {/* Anti-cheat Away Presence Bubble on Avatar */}
        {isAway && (
          <div
            className="animate-float arabic-font"
            style={{
              position: 'absolute',
              bottom: orientation === 'column' ? '100%' : '110%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '10px',
              padding: '4px 12px',
              borderRadius: '16px',
              backgroundColor: 'rgba(239, 68, 68, 0.98)',
              color: '#fff',
              fontWeight: 900,
              fontSize: '0.8rem',
              whiteSpace: 'nowrap',
              zIndex: 60,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 4px 16px rgba(239, 68, 68, 0.85), 0 0 10px rgba(239, 68, 68, 0.5)',
              border: '1.5px solid rgba(255, 255, 255, 0.6)',
              animation: 'pulse 1s infinite',
            }}
          >
            <span style={{ fontSize: '0.95rem' }}>⚠️</span>
            <span>خارج اللعبة</span>
            <div
              style={{
                position: 'absolute',
                bottom: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid rgba(239, 68, 68, 0.98)',
              }}
            />
          </div>
        )}

        {/* Pass Announcement Bubble on Avatar */}
        {isPassed && !isAway && (
          <div
            className="animate-float arabic-font"
            style={{
              position: 'absolute',
              bottom: orientation === 'column' ? '100%' : '110%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '10px',
              padding: '5px 16px',
              borderRadius: '20px',
              backgroundColor: 'rgba(220, 38, 38, 0.95)',
              color: '#fff',
              fontWeight: 900,
              fontSize: '0.92rem',
              whiteSpace: 'nowrap',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 20px rgba(220, 38, 38, 0.7), 0 0 15px rgba(220, 38, 38, 0.4)',
              border: '1.5px solid rgba(255, 255, 255, 0.4)',
              animation: 'pulse 1s infinite',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>✋</span>
            <span>فوت!</span>
            <div
              style={{
                position: 'absolute',
                bottom: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid rgba(220, 38, 38, 0.95)',
              }}
            />
          </div>
        )}

        {isSpeakingBot && !isPassed && (
          <div className="animate-float" style={{
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '10px', padding: '6px 14px',
            borderRadius: '16px', backgroundColor: 'var(--baffa-gold-primary)', color: '#080d1a',
            fontWeight: 800, fontSize: '0.85rem', whiteSpace: 'nowrap', zIndex: 40,
            boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
          }}>
            <span className="arabic-font">{latestBotMessage?.text}</span>
            <div style={{ position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid var(--baffa-gold-primary)' }} />
          </div>
        )}

        <div style={{
          padding: orientation === 'column'
            ? (isLandscape ? '2px 4px' : '5px 8px')
            : (isLandscape ? '2px 6px' : '4px 10px'),
          borderRadius: isLandscape ? '8px' : '12px',
          backgroundColor: isCurrentTurn ? 'rgba(245, 158, 11, 0.15)' : 'rgba(18, 29, 45, 0.82)',
          border: isCurrentTurn ? '2px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
          boxShadow: isCurrentTurn ? 'var(--baffa-shadow-glow-gold)' : '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: orientation, alignItems: 'center', gap: isLandscape ? '4px' : '6px', transition: 'all 0.3s ease',
          backdropFilter: 'blur(4px)',
          position: 'relative',
        }}>
          {isCurrentTurn && turnSecondsLeft !== null && (
            <div style={{
              position: 'absolute',
              top: orientation === 'column' ? '-11px' : '-10px',
              right: orientation === 'column' ? '50%' : '14px',
              transform: orientation === 'column' ? 'translateX(50%)' : 'none',
              backgroundColor: turnSecondsLeft <= 5 ? '#ef4444' : '#f59e0b',
              color: '#000',
              fontWeight: 900,
              fontSize: isLandscape ? '0.62rem' : '0.7rem',
              borderRadius: '12px',
              padding: '1px 5px',
              boxShadow: turnSecondsLeft <= 5 ? '0 0 12px rgba(239, 68, 68, 0.9)' : '0 0 10px rgba(245, 158, 11, 0.7)',
              zIndex: 35,
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              animation: turnSecondsLeft <= 5 ? 'pulse 0.6s infinite' : 'none',
            }}>
              <span>{turnSecondsLeft}</span>
              <span style={{ fontSize: '0.62rem' }}>ث</span>
            </div>
          )}

          {/* Player Avatar */}
          <div style={{
            width: isLandscape ? '22px' : '28px', height: isLandscape ? '22px' : '28px', borderRadius: '50%', backgroundColor: 'var(--baffa-bg-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: isCurrentTurn ? '2px solid var(--baffa-gold-primary)' : '1px solid rgba(255,255,255,0.15)',
            boxShadow: isCurrentTurn ? '0 0 10px rgba(245, 158, 11, 0.7), inset 0 0 6px rgba(245, 158, 11, 0.3)' : 'none',
            position: 'relative', transition: 'all 0.3s ease', flexShrink: 0,
            overflow: 'hidden'
          }}>
            <UserAvatar
              avatar={effectiveAvatar}
              username={player.username}
              isBot={player.isBot}
              botId={player.botId}
              size={isLandscape ? 22 : 28}
            />
          </div>

          {/* Active Speaking Mic Indicator next to each player */}
          {!player.isBot && (
            <div
              style={{
                width: isLandscape ? '16px' : '20px',
                height: isLandscape ? '16px' : '20px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isLandscape ? '8px' : '10px',
                backgroundColor: isPlayerSpeaking
                  ? 'rgba(34, 197, 94, 0.35)'
                  : player.isVoiceMuted
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'rgba(255, 255, 255, 0.08)',
                border: isPlayerSpeaking
                  ? '2px solid #22c55e'
                  : player.isVoiceMuted
                  ? '1px solid rgba(239, 68, 68, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: isPlayerSpeaking
                  ? '0 0 12px rgba(34, 197, 94, 0.9), inset 0 0 6px rgba(34, 197, 94, 0.6)'
                  : 'none',
                color: isPlayerSpeaking ? '#4ade80' : player.isVoiceMuted ? '#f87171' : '#9ca3af',
                animation: isPlayerSpeaking ? 'pulse 0.8s infinite' : 'none',
                transition: 'all 0.2s ease',
              }}
              title={
                isPlayerSpeaking
                  ? `${player.username} يتحدث الآن 🎙️`
                  : player.isVoiceMuted
                  ? 'الميكروفون مكتوم بقرار من الحكم 🔇'
                  : 'الميكروفون متصل'
              }
            >
              {player.isVoiceMuted ? '🔇' : '🎙️'}
            </div>
          )}

          {/* Player Name and Role/Warnings */}
          <div style={{ textAlign: orientation === 'column' ? 'center' : 'left' }}>
            <div style={{ fontSize: isLandscape ? '0.7rem' : isMobile ? '0.75rem' : '0.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>{player.username}</span>
              {isAway && (
                <span
                  className="arabic-font"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.9)',
                    color: '#fff',
                    fontSize: '0.62rem',
                    fontWeight: 900,
                    padding: '1px 5px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)',
                    animation: 'pulse 1s infinite',
                  }}
                  title="اللاعب في تبويب أو نافذة أخرى حالياً"
                >
                  ⚠️ خارج اللعبة
                </span>
              )}
              {warnings === 1 && (
                <button
                  onClick={(e) => {
                    if (isJudge) {
                      e.stopPropagation();
                      setSelectedJudgeTarget(player);
                    }
                  }}
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.25)',
                    border: '1px solid rgba(245, 158, 11, 0.6)',
                    color: '#fbbf24',
                    fontSize: '9px',
                    fontWeight: 900,
                    padding: '0 4px',
                    borderRadius: '3px',
                    cursor: isJudge ? 'pointer' : 'default',
                    outline: 'none',
                  }}
                  title={isJudge ? 'كارت أصفر أول (1/2) - اضغط لإدارة القرارات' : 'كارت أصفر أول (1/2)'}
                >
                  🟨 1
                </button>
              )}
              {warnings >= 2 && (
                <button
                  onClick={(e) => {
                    if (isJudge) {
                      e.stopPropagation();
                      setSelectedJudgeTarget(player);
                    }
                  }}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.3)',
                    border: '1px solid #ef4444',
                    color: '#f87171',
                    fontSize: '9px',
                    fontWeight: 900,
                    padding: '0 4px',
                    borderRadius: '3px',
                    cursor: isJudge ? 'pointer' : 'default',
                    outline: 'none',
                  }}
                  title={isJudge ? 'إنذاران / كارت أحمر (2/2) - اضغط لإدارة القرارات' : 'إنذاران / كارت أحمر (2/2)'}
                >
                  🟥 2
                </button>
              )}
              {player.isChatMuted && (
                <span style={{ fontSize: '10px' }} title="الشات مكتوم">
                  💬❌
                </span>
              )}
              {player.isReactionsMuted && (
                <span style={{ fontSize: '10px' }} title="التفاعلات مكتومة">
                  🙂❌
                </span>
              )}
            </div>
            {relation && (
              <div className="arabic-font" style={{ fontSize: '0.67rem', color: isMe ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-muted)' }}>
                {relation}
              </div>
            )}
          </div>
        </div>

        {/* Dedicated Judge Decision Controls */}
        {isJudge && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedJudgeTarget(player);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: 'rgba(245, 158, 11, 0.16)',
              border: '1px solid var(--baffa-gold-primary)',
              color: '#fde68a',
              fontSize: '10px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4), 0 0 8px rgba(245, 158, 11, 0.2)',
              whiteSpace: 'nowrap',
            }}
            title="لوحة قرارات الحكم واحتساب الغش والكتم والتبديل"
          >
            <span style={{ fontSize: '10px' }}>⚖️</span>
            <span className="arabic-font">قرار</span>
          </button>
        )}
      </div>
    );
  };

  const renderHiddenCards = (
    player: SanitizedPlayerState | undefined,
    orientation: 'row' | 'column',
    relSeat?: 'TOP' | 'LEFT' | 'RIGHT' | 'BOTTOM'
  ) => {
    if (!player) return null;
    const playerSeatNum = Number(player.seat);
    const isMe = mySeat !== null && Number(mySeat) === playerSeatNum;
    if (isMe) return null;

    const playerTeam = player.team ?? getSeatTeam(playerSeatNum);
    const isLosingPlayer = isRoundOver && losingTeam !== null && playerTeam === losingTeam;
    const revealedHand = isRoundOver ? lastRound?.revealedHands?.find((h) => Number(h.seat) === playerSeatNum) : null;

    // When round is finished: reveal actual opponent & partner tiles in-place!
    if (isRoundOver) {
      const tilesToDisplay: DominoTileType[] = (revealedHand && revealedHand.tiles && revealedHand.tiles.length > 0)
        ? revealedHand.tiles
        : Array.from({ length: Math.max(0, Math.min(7, Number(player.hiddenTilesCount) || 0)) }).map(() => [0, 0] as DominoTileType);

      if (tilesToDisplay.length === 0) return null;

      const isFlying = roundEndStage === 'FLYING' || roundEndStage === 'SCORE_PULSE' || roundEndStage === 'DONE';

      return (
        <div style={{ display: 'flex', flexDirection: orientation, gap: '6px', alignItems: 'center' }}>
          {tilesToDisplay.map((tile, idx) => {
            const tileKey = `tile-${playerSeatNum}-${idx}`;
            const vector = flyingVectors[tileKey];
            const staggerDelay = (playerSeatNum * 100) + (idx * 60);

            return (
              <div
                key={idx}
                data-losing-tile={isLosingPlayer ? 'true' : 'false'}
                data-tile-id={tileKey}
                className={
                  isLosingPlayer && isFlying
                    ? 'animate-tile-fly'
                    : roundEndStage === 'REVEALED'
                    ? 'animate-tile-reveal'
                    : ''
                }
                style={{
                  '--fly-x': `${vector?.x ?? (window.innerWidth * 0.7 - 200)}px`,
                  '--fly-y': `${vector?.y ?? -200}px`,
                  '--fly-delay': `${staggerDelay}ms`,
                  filter: isLosingPlayer
                    ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.75))'
                    : 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))',
                  position: 'relative',
                  zIndex: isLosingPlayer ? 45 : 20,
                } as React.CSSProperties}
              >
                <DominoTile
                  tile={tile}
                  size={isLandscape ? 'xs' : isMobile ? 'xs' : 'sm'}
                  isVertical={orientation === 'row'}
                  isFaceDown={false}
                  disabled={true}
                />
              </div>
            );
          })}
        </div>
      );
    }

    // Normal play: show face-down tiles with staggered dealing animations from table center
    const tileCount = Math.max(0, Math.min(7, Number(player.hiddenTilesCount) || 0));
    if (tileCount === 0) return null;

    const dealAnimClass = isDealingRound
      ? relSeat === 'TOP'
        ? 'animate-deal-top'
        : relSeat === 'LEFT'
        ? 'animate-deal-left'
        : relSeat === 'BOTTOM'
        ? 'animate-deal-bottom'
        : 'animate-deal-right'
      : '';

    return (
      <div style={{ display: 'flex', flexDirection: orientation, gap: isLandscape ? '2px' : isMobile ? '2px' : '4px' }}>
        {Array.from({ length: tileCount }).map((_, idx) => (
          <div
            key={idx}
            className={dealAnimClass}
            style={{
              animationDelay: isDealingRound ? `${idx * 90}ms` : undefined,
              marginTop: orientation === 'column' && idx > 0 ? (isLandscape ? '-14px' : isMobile ? '-12px' : '-8px') : undefined,
            }}
          >
            <DominoTile
              tile={[0, 0]}
              isFaceDown={true}
              size={isLandscape ? 'xs' : isMobile ? 'xs' : 'sm'}
              isVertical={orientation === 'row'}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100dvh', width: '100vw', maxWidth: '100vw', backgroundColor: '#090d13', overflow: 'hidden' }}>
      {isJudge && (
        <div style={{ zIndex: 40, width: '100%', padding: '2px 8px 0', display: 'flex', justifyContent: 'center' }}>
          <RefereeControlHub
            roundNumber={gameState.roundNumber}
            isMatchActive={gameState.status === 'PLAYING'}
            isRoundFinished={gameState.status === 'ROUND_FINISHED'}
            spectators={room?.spectators || (room?.spectator ? [room.spectator] : [])}
            onVoidRound={onJudgeVoidRound || (() => {})}
            onGrantExtraTime={onJudgeGrantExtraTime || (() => {})}
            onTerminateMatch={onJudgeTerminateMatch || (() => {})}
            onMuteSpectator={(userId, muteType, mute) => {
              onJudgeMuteAction?.('SPECTATOR', { userId }, muteType, mute);
            }}
            onTriggerBot={onTriggerBot ? () => onTriggerBot(gameState.roomId) : undefined}
            onRequestNextRound={onRequestNextRound}
          />
        </div>
      )}

      {/* Official Floating Referee Decision Notification Banner (Auto-dismisses in 3 seconds) */}
      {latestRefereeDecision && (
        <div
          style={{
            position: 'fixed',
            top: '18px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10005,
            width: '92%',
            maxWidth: '540px',
            pointerEvents: 'none',
          }}
        >
          {(() => {
            const action = latestRefereeDecision.actionType || '';
            const isRed = action.includes('RED') || action.includes('CHEATING') || action.includes('2');
            const isYellow = action.includes('YELLOW') || action.includes('1');
            const isVoid = action.includes('VOID');
            const isTime = action.includes('TIME');
            const isMute = action.includes('MUTE');

            const themeColor = isRed
              ? '#ef4444'
              : isYellow
              ? 'var(--baffa-gold-primary)'
              : isVoid
              ? 'var(--baffa-cyan-primary)'
              : isTime
              ? '#22c55e'
              : isMute
              ? '#fb923c'
              : '#a855f7';

            const themeGlow = isRed
              ? 'rgba(239, 68, 68, 0.5)'
              : isYellow
              ? 'rgba(245, 158, 11, 0.5)'
              : isVoid
              ? 'rgba(6, 182, 212, 0.5)'
              : isTime
              ? 'rgba(34, 197, 94, 0.5)'
              : isMute
              ? 'rgba(249, 115, 22, 0.5)'
              : 'rgba(168, 85, 247, 0.5)';

            const badgeEmoji = isRed
              ? '🟥'
              : isYellow
              ? '🟨'
              : isVoid
              ? '🔄'
              : isTime
              ? '⏱️'
              : isMute
              ? '🔇'
              : '⚖️';

            return (
              <div
                className="animate-referee-toast arabic-font"
                style={{
                  pointerEvents: 'auto',
                  backgroundColor: '#0a101f',
                  border: `2px solid ${themeColor}`,
                  borderRadius: isMobile ? '12px' : '18px',
                  boxShadow: `0 20px 50px rgba(0, 0, 0, 0.98), 0 0 30px ${themeGlow}`,
                  direction: 'rtl',
                  color: '#fff',
                  overflow: 'hidden',
                  position: 'relative',
                  padding: isMobile ? '8px 12px 6px' : '14px 18px 12px',
                  maxWidth: isMobile ? '92vw' : '480px',
                }}
              >
                {/* Header Row: Emoji Badge, Decision Title & Close */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? '4px' : '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '10px' }}>
                    <div
                      style={{
                        width: isMobile ? '28px' : '38px',
                        height: isMobile ? '28px' : '38px',
                        borderRadius: isMobile ? '8px' : '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: `1.5px solid ${themeColor}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: isMobile ? '1.0rem' : '1.4rem',
                        boxShadow: `0 0 14px ${themeGlow}`,
                        flexShrink: 0,
                      }}
                    >
                      {badgeEmoji}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: isMobile ? '0.64rem' : '0.72rem', fontWeight: 900, color: themeColor }}>
                          ⚖️ قرار تحكيمي رسمي ({latestRefereeDecision.judgeName || 'الحكم'})
                        </span>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            fontSize: isMobile ? '0.58rem' : '0.65rem',
                            fontWeight: 800,
                            color: '#94a3b8',
                          }}
                        >
                          6 ثوانٍ ⏱️
                        </span>
                      </div>
                      <div style={{ fontSize: isMobile ? '0.86rem' : '1.15rem', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>
                        {latestRefereeDecision.title}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={onDismissRefereeDecision}
                    style={{
                      width: isMobile ? '22px' : '28px',
                      height: isMobile ? '22px' : '28px',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: isMobile ? '0.72rem' : '0.85rem',
                      transition: 'all 0.2s ease',
                    }}
                    title="إغلاق التنبيه"
                  >
                    ✕
                  </button>
                </div>

                {/* Details Card: Target & Reason */}
                <div
                  style={{
                    backgroundColor: '#111827',
                    borderRadius: isMobile ? '8px' : '12px',
                    border: '1.5px solid rgba(255, 255, 255, 0.15)',
                    padding: isMobile ? '5px 8px' : '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isMobile ? '3px' : '6px',
                    marginBottom: isMobile ? '4px' : '8px',
                    fontSize: isMobile ? '0.74rem' : '0.85rem',
                  }}
                >
                  {/* Target Player / Team */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--baffa-text-muted)', fontWeight: 700 }}>🎯 ضـد:</span>
                    <span style={{ fontWeight: 900, color: '#fde68a' }}>
                      {latestRefereeDecision.targetPlayerName || 'جميع اللاعبين'}
                      {latestRefereeDecision.targetSeat !== undefined ? ` (مقعد ${latestRefereeDecision.targetSeat + 1})` : ''}
                      {latestRefereeDecision.targetTeam ? ` • فريق ${latestRefereeDecision.targetTeam}` : ''}
                    </span>
                  </div>

                  {/* Reason */}
                  {(latestRefereeDecision.reason || latestRefereeDecision.arabicMessage) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--baffa-text-muted)', fontWeight: 700 }}>⚠️ السبب:</span>
                      <span style={{ fontWeight: 800, color: '#fff' }}>
                        {latestRefereeDecision.reason || latestRefereeDecision.arabicMessage}
                      </span>
                    </div>
                  )}

                  {/* Optional Arabic Message if distinct */}
                  {latestRefereeDecision.arabicMessage && latestRefereeDecision.arabicMessage !== latestRefereeDecision.reason && (
                    <div style={{ fontSize: isMobile ? '0.68rem' : '0.78rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.3 }}>
                      {latestRefereeDecision.arabicMessage}
                    </div>
                  )}
                </div>

                {/* Action button if round is finished */}
                {gameState.status === 'ROUND_FINISHED' && onRequestNextRound && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isMobile ? '4px' : '8px' }}>
                    <button
                      onClick={() => {
                        onDismissRefereeDecision?.();
                        onRequestNextRound();
                      }}
                      className="baffa-btn-primary"
                      style={{
                        padding: isMobile ? '4px 12px' : '6px 16px',
                        fontSize: isMobile ? '0.74rem' : '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Zap size={14} />
                      <span className="arabic-font">بدء الجولة التالية فوراً ⚡</span>
                    </button>
                  </div>
                )}

                {/* 6-Second Animated Countdown Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    className="animate-toast-progress-6s"
                    style={{
                      height: '100%',
                      backgroundColor: themeColor,
                      boxShadow: `0 0 8px ${themeColor}`,
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <ChatAndReactions
        socket={socket}
        roomId={gameState.roomId}
        myUserId={currentUserId}
        quickChatEnabled={!isAdminChatDisabled}
        reactionsEnabled={!isAdminReactionsDisabled}
        isChatMuted={isJudgeChatMuted}
        isReactionsMuted={isJudgeReactionsMuted}
        players={gameState.players}
        mySeat={gameState.mySeat}
        isMobile={isMobile}
        isLandscape={isLandscape}
      />

      {/* Smart In-Game Microphone Permission Guidance for Mobile & PC */}
      <MicPermissionModal
        isOpen={showPermissionGuide}
        onClose={() => setShowPermissionGuide(false)}
        onRequestPermission={requestMicrophonePermission}
      />

      {/* Sleek Unified Top Navigation & Status Bar */}
      <div style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isLandscape ? '2px 8px' : isMobile ? '4px 10px' : '8px 24px',
        zIndex: 45,
        boxSizing: 'border-box',
        flexShrink: 0,
        backgroundColor: 'rgba(8, 13, 22, 0.7)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        {/* Left: Exit Button & Baffa Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isLandscape ? '6px' : '10px' }}>
          <button 
            onClick={() => setShowLeaveConfirm(true)} 
            style={{ 
              color: 'var(--baffa-text-muted)',
              backgroundColor: 'rgba(18, 29, 45, 0.75)',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%',
              width: isLandscape ? '28px' : '32px',
              height: isLandscape ? '28px' : '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="مغادرة الغرفة"
          >
            <ArrowLeft size={isLandscape ? 14 : 16} />
          </button>
          <span className="arabic-font" style={{ fontSize: isLandscape ? '1.05rem' : '1.25rem', fontWeight: 900, color: 'var(--baffa-gold-primary)' }}>بَفّة</span>
        </div>

        {/* Center: Sleek Unified Score Badge (Target for flying round-end cards) */}
        <div
          id="table-score-badge"
          className={roundEndStage === 'SCORE_PULSE' ? 'animate-score-glow' : ''}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: isLandscape ? '4px' : isMobile ? '6px' : '10px',
            backgroundColor: 'rgba(10, 24, 20, 0.92)',
            backdropFilter: 'blur(8px)',
            padding: isLandscape ? '2px 8px' : isMobile ? '3px 10px' : '5px 16px',
            borderRadius: '24px',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            userSelect: 'none',
          }}
        >
          {lastRound && (roundEndStage === 'SCORE_PULSE' || roundEndStage === 'DONE') && (
            <div
              className="animate-score-delta"
              style={{
                position: 'absolute',
                top: '-18px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: isMyTeamWinner ? 'var(--baffa-gold-primary)' : '#ef4444',
                color: '#080d1a',
                fontWeight: 900,
                fontSize: isLandscape ? '0.7rem' : '0.78rem',
                padding: isLandscape ? '1px 6px' : '2px 8px',
                borderRadius: '12px',
                boxShadow: '0 0 15px rgba(245, 158, 11, 0.8)',
                whiteSpace: 'nowrap',
                zIndex: 50,
              }}
            >
              +{lastRound.roundScore} بنط
            </div>
          )}

          {isObserver ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: isLandscape ? '3px' : '5px' }}>
                <span className="arabic-font" style={{ fontSize: isLandscape ? '0.65rem' : '0.72rem', fontWeight: 800, color: 'var(--baffa-text-muted)' }}>{getTeamLabel(1)}</span>
                <span style={{ fontSize: isLandscape ? '0.9rem' : '1.05rem', fontWeight: 900, color: 'var(--baffa-team1-color)' }}>{gameState.team1Score}</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 900, fontSize: isLandscape ? '0.75rem' : '0.85rem' }}>:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: isLandscape ? '3px' : '5px' }}>
                <span style={{ fontSize: isLandscape ? '0.9rem' : '1.05rem', fontWeight: 900, color: 'var(--baffa-team2-color)' }}>{gameState.team2Score}</span>
                <span className="arabic-font" style={{ fontSize: isLandscape ? '0.65rem' : '0.72rem', fontWeight: 800, color: 'var(--baffa-text-muted)' }}>{getTeamLabel(2)}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: isLandscape ? '3px' : '5px' }}>
                <span className="arabic-font" style={{ fontSize: isLandscape ? '0.65rem' : '0.72rem', fontWeight: 800, color: 'var(--baffa-text-muted)' }}>فريقك</span>
                <span style={{ fontSize: isLandscape ? '0.9rem' : '1.05rem', fontWeight: 900, color: 'var(--baffa-team1-color)' }}>{myTeamScore}</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 900, fontSize: isLandscape ? '0.75rem' : '0.85rem' }}>:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: isLandscape ? '3px' : '5px' }}>
                <span style={{ fontSize: isLandscape ? '0.9rem' : '1.05rem', fontWeight: 900, color: 'var(--baffa-error)' }}>{opponentScore}</span>
                <span className="arabic-font" style={{ fontSize: isLandscape ? '0.65rem' : '0.72rem', fontWeight: 800, color: 'var(--baffa-text-muted)' }}>الخصم</span>
              </div>
            </>
          )}
          <div style={{
            padding: isLandscape ? '1px 6px' : '2px 7px',
            borderRadius: '10px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            color: 'var(--baffa-gold-primary)',
            fontSize: isLandscape ? '0.62rem' : '0.68rem',
            fontWeight: 800
          }}>
            إلى {gameState.targetScore}
          </div>
        </div>

        {/* Right: Floating Voice Audio Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          transform: isLandscape ? 'scale(0.78)' : isMobile ? 'scale(0.85)' : 'none',
          transformOrigin: 'right center',
        }}>
          <VoiceControls
            isMuted={isMuted}
            isAdminDisabled={isAdminVoiceDisabled}
            isJudgeMuted={isJudgeVoiceMuted}
            activePeersCount={activePeers.length}
            onToggleMute={handleToggleVoice}
            isMobile={isMobile || isLandscape}
          />
        </div>
      </div>

      {/* GAME ARENA */}
      <div style={{
        flex: 1, 
        position: 'relative',
        padding: isLandscape
          ? '2px 8px 2px 8px'
          : isMobile 
          ? (isJudge ? '4px 4px 6px 4px' : '4px 4px 6px 4px') 
          : (isJudge ? '14px 70px 20px 70px' : '26px 80px 30px 80px'),
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}>
        
        {/* Badges OUTSIDE the table - for Desktop only */}
        {!isMobile && !isLandscape && (
          <>
            <div style={{ position: 'absolute', top: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 20 }}>
              {renderBadgeOnly(
                relativePlayers.TOP,
                isObserver
                  ? getTeamLabel(relativePlayers.TOP?.team ?? 1)
                  : (mySeat !== null ? 'زميلك' : getTeamLabel(relativePlayers.TOP?.team ?? 1)),
                'row'
              )}
            </div>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 20 }}>
              {renderBadgeOnly(
                relativePlayers.LEFT,
                getTeamLabel(relativePlayers.LEFT?.team ?? 2),
                'column'
              )}
            </div>
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 20 }}>
              {renderBadgeOnly(
                relativePlayers.RIGHT,
                getTeamLabel(relativePlayers.RIGHT?.team ?? 2),
                'column'
              )}
            </div>
            <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 20 }}>
              {renderBadgeOnly(
                relativePlayers.BOTTOM,
                isObserver
                  ? getTeamLabel(relativePlayers.BOTTOM?.team ?? 1)
                  : (mySeat !== null && !relativePlayers.BOTTOM?.isBot ? 'أنت' : getTeamLabel(relativePlayers.BOTTOM?.team ?? 1)),
                'row'
              )}
            </div>
          </>
        )}

        {/* INNER WOODEN TABLE */}
        <div 
          data-table-felt="true"
          style={{
          flex: 1,
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gridTemplateRows: 'auto 1fr auto',
          gap: isLandscape ? '2px' : isMobile ? '4px' : '10px',
          background: 'radial-gradient(circle at center, #1b4d3e 0%, #0c261e 100%)', // Real green casino felt
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.8), inset 0 0 10px rgba(0,0,0,1)',
          border: isLandscape ? '3px solid #3b2818' : isMobile ? '5px solid #3b2818' : '12px solid #3b2818', // Wooden table border
          borderRadius: isLandscape ? '14px' : isMobile ? '18px' : '40px',
          padding: isLandscape ? '2px 6px' : isMobile ? '4px 6px' : '16px',
          minHeight: 0,
          overflow: 'hidden',
        }}>
            
            {/* Cards and Badges INSIDE the table edges */}
            <div style={{ gridColumn: '2 / 3', gridRow: '1', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {(isMobile || isLandscape) ? (
                <div style={{ display: 'flex', flexDirection: isLandscape ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: isLandscape ? '8px' : '2px' }}>
                  {renderBadgeOnly(
                    relativePlayers.TOP,
                    isObserver
                      ? getTeamLabel(relativePlayers.TOP?.team ?? 1)
                      : (mySeat !== null ? 'زميلك' : getTeamLabel(relativePlayers.TOP?.team ?? 1)),
                    'row'
                  )}
                  {renderHiddenCards(relativePlayers.TOP, 'row', 'TOP')}
                </div>
              ) : (
                renderHiddenCards(relativePlayers.TOP, 'row', 'TOP')
              )}
            </div>
            <div style={{ gridColumn: '1 / 2', gridRow: '2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* In RTL, gridColumn 1 is visually on the RIGHT. The Right opponent should sit here. */}
              {(isMobile || isLandscape) ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  {renderBadgeOnly(
                    relativePlayers.RIGHT,
                    getTeamLabel(relativePlayers.RIGHT?.team ?? 2),
                    'column'
                  )}
                  {renderHiddenCards(relativePlayers.RIGHT, 'column', 'RIGHT')}
                </div>
              ) : (
                renderHiddenCards(relativePlayers.RIGHT, 'column', 'RIGHT')
              )}
            </div>
            <div style={{ gridColumn: '3 / 4', gridRow: '2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* In RTL, gridColumn 3 is visually on the LEFT. The Left opponent should sit here. */}
              {(isMobile || isLandscape) ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  {renderBadgeOnly(
                    relativePlayers.LEFT,
                    getTeamLabel(relativePlayers.LEFT?.team ?? 2),
                    'column'
                  )}
                  {renderHiddenCards(relativePlayers.LEFT, 'column', 'LEFT')}
                </div>
              ) : (
                renderHiddenCards(relativePlayers.LEFT, 'column', 'LEFT')
              )}
            </div>
            <div style={{ gridColumn: '2 / 3', gridRow: '3', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', maxWidth: '100%' }}>
              {(myRole === 'PLAYER' || myRole === 'ADMIN') && mySeat !== null ? (
                <div style={{
                  display: 'flex',
                  flexDirection: isLandscape ? 'row' : (isMobile ? 'column' : 'row'),
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: isLandscape ? '8px' : isMobile ? '2px' : '8px',
                  maxWidth: '100%',
                }}>
                  {/* In landscape mode, bottom player badge sits beside the hand */}
                  {isLandscape && renderBadgeOnly(
                    relativePlayers.BOTTOM,
                    isObserver
                      ? getTeamLabel(relativePlayers.BOTTOM?.team ?? 1)
                      : (mySeat !== null && !relativePlayers.BOTTOM?.isBot ? 'أنت' : getTeamLabel(relativePlayers.BOTTOM?.team ?? 1)),
                    'row'
                  )}
                  <div style={{ 
                    display: 'flex', 
                    gap: isLandscape ? '3px' : isMobile ? '4px' : '8px', 
                    flexWrap: 'nowrap', 
                    justifyContent: 'center', 
                    position: 'relative', 
                    zIndex: 30,
                    maxWidth: '100%',
                    overflowX: 'auto',
                    padding: isLandscape ? '2px 0' : '4px 2px',
                  }}>
                    {isMyTurn && !isRoundOver && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '106%',
                          right: '8px',
                          padding: isLandscape ? '1px 6px' : isMobile ? '2px 8px' : '4px 12px',
                          borderRadius: '16px',
                          backgroundColor: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          color: '#fde68a',
                          fontWeight: 700,
                          fontSize: isLandscape ? '0.62rem' : isMobile ? '0.7rem' : '0.78rem',
                          backdropFilter: 'blur(8px)',
                          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap',
                          zIndex: 60,
                          opacity: 0.9,
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#f59e0b',
                            boxShadow: '0 0 6px #f59e0b',
                            display: 'inline-block',
                          }}
                        />
                        <span className="arabic-font">دورك</span>
                      </div>
                    )}
                    {(() => {
                      const mySeatNum = Number(mySeat);
                      const myHandTeam = getSeatTeam(mySeatNum);
                      const isLosingPlayer = isRoundOver && losingTeam !== null && myHandTeam === losingTeam;
                      const isFlying = roundEndStage === 'FLYING' || roundEndStage === 'SCORE_PULSE' || roundEndStage === 'DONE';
                      const myTilesToRender = isRoundOver
                        ? (gameState.myHand.length > 0
                            ? gameState.myHand
                            : (lastRound?.revealedHands?.find((h) => Number(h.seat) === mySeatNum)?.tiles || []))
                        : gameState.myHand;

                      const responsiveTileSize = isLandscape
                        ? 'xs'
                        : isMobile
                        ? 'xs'
                        : 'md';

                      return myTilesToRender.map((tile, index) => {
                        const isPlayable = isMyTurn && !isRoundOver && !!myLegalMoves.find(m => (m.tile[0] === tile[0] && m.tile[1] === tile[1]) || (m.tile[0] === tile[1] && m.tile[1] === tile[0]));
                        const isSelected = selectedTileIndex === index;
                        const isBeingDragged = isDragging && dragState?.index === index;
                        const tileKey = `tile-${mySeatNum}-${index}`;
                        const vector = flyingVectors[tileKey];
                        const staggerDelay = (mySeatNum * 100) + (index * 60);

                        return (
                          <div
                            key={index}
                            data-losing-tile={isLosingPlayer ? 'true' : 'false'}
                            data-tile-id={tileKey}
                            onPointerDown={(e) => {
                              if (!isMyTurn || (myRole !== 'PLAYER' && myRole !== 'ADMIN') || isRoundOver) return;
                              if (e.button !== 0) return;

                              const legal = myLegalMoves.find(
                                (m) =>
                                  (m.tile[0] === tile[0] && m.tile[1] === tile[1]) ||
                                  (m.tile[0] === tile[1] && m.tile[1] === tile[0])
                              );
                              // If not a legal playable tile, do NOT start dragging to avoid accidental triggers
                              if (!legal) return;
                              const validEnds = legal.validEnds;

                              const state = {
                                tile,
                                index,
                                startX: e.clientX,
                                startY: e.clientY,
                                validEnds,
                              };
                              dragRef.current = state;
                              isDraggingRef.current = false;
                              setDragState({ tile, index, validEnds });
                              setIsDragging(false);
                              if (ghostRef.current) {
                                ghostRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%) scale(1.18) rotate(-6deg)`;
                              }
                            }}
                            className={
                              isLosingPlayer && isFlying
                                ? 'animate-tile-fly'
                                : isDealingRound
                                ? 'animate-deal-bottom'
                                : ''
                            }
                            style={{
                              touchAction: 'none',
                              userSelect: 'none',
                              cursor: isPlayable ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
                              opacity: isBeingDragged ? 0.25 : 1,
                              '--fly-x': `${vector?.x ?? (window.innerWidth * 0.7 - 200)}px`,
                              '--fly-y': `${vector?.y ?? -350}px`,
                              '--fly-delay': `${staggerDelay}ms`,
                              animationDelay: isDealingRound ? `${index * 110}ms` : undefined,
                              willChange: 'transform, opacity',
                              zIndex: isLosingPlayer ? 45 : 30,
                            } as React.CSSProperties}
                          >
                            <DominoTile
                              tile={tile}
                              size={responsiveTileSize}
                              isPlayable={isPlayable}
                              isSelected={isSelected}
                              isVertical={true}
                              isFaceDown={false}
                              disabled={!isMyTurn || isRoundOver}
                              onInvalidClick={triggerInvalid}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                  {/* In portrait mobile mode, bottom player badge sits below the hand */}
                  {isPortraitMobile && renderBadgeOnly(
                    relativePlayers.BOTTOM,
                    isObserver
                      ? getTeamLabel(relativePlayers.BOTTOM?.team ?? 1)
                      : (mySeat !== null && !relativePlayers.BOTTOM?.isBot ? 'أنت' : getTeamLabel(relativePlayers.BOTTOM?.team ?? 1)),
                    'row'
                  )}
                </div>
              ) : (
                (isMobile || isLandscape) ? (
                  <div style={{ display: 'flex', flexDirection: isLandscape ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    {renderBadgeOnly(
                      relativePlayers.BOTTOM,
                      isObserver
                        ? getTeamLabel(relativePlayers.BOTTOM?.team ?? 1)
                        : (mySeat !== null && !relativePlayers.BOTTOM?.isBot ? 'أنت' : getTeamLabel(relativePlayers.BOTTOM?.team ?? 1)),
                      'row'
                    )}
                    {renderHiddenCards(relativePlayers.BOTTOM, 'row', 'BOTTOM')}
                  </div>
                ) : (
                  renderHiddenCards(relativePlayers.BOTTOM, 'row', 'BOTTOM')
                )
              )}
            </div>

            {/* Center Area (Tiles / Dealing) */}
            <div style={{
              gridColumn: '2 / 3', gridRow: '2', position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center'
            }}>
              {/* Dealing in progress badge */}
              {isDealingRound && gameState.chain.tiles.length === 0 && (
                <div
                  className="animate-fade-in arabic-font"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 25,
                    padding: '8px 22px',
                    borderRadius: '24px',
                    backgroundColor: 'rgba(12, 38, 30, 0.94)',
                    border: '1.5px solid var(--baffa-gold-primary)',
                    color: 'var(--baffa-gold-primary)',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 15px rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>🎲</span>
                  <span>توزيع الكروت...</span>
                </div>
              )}

              <div ref={setBoardRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
                <div style={{ 
                  position: 'absolute', left: '50%', top: '50%', 
                  transform: `translate(-50%, -50%) translate(${-boardCenterX * fitScale}px, ${-boardCenterY * fitScale}px) scale(${fitScale})`,
                  transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}>
                  {/* Drop Target Indicator when Dragging */}
                  {isDragging && dragState && dragState.validEnds.length > 0 && (
                    <>
                      {placedTiles.length === 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0, top: 0,
                            transform: 'translate(-50%, -50%)',
                            width: '90px', height: '90px',
                            borderRadius: '50%',
                            border: '3px dashed var(--baffa-gold-primary)',
                            backgroundColor: 'rgba(245, 158, 11, 0.25)',
                            boxShadow: '0 0 30px rgba(245, 158, 11, 0.75), inset 0 0 15px rgba(245, 158, 11, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                            zIndex: 70,
                            animation: 'pulse 1.2s infinite',
                          }}
                        >
                          <span className="arabic-font" style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--baffa-gold-primary)' }}>
                            ابدأ هنا
                          </span>
                        </div>
                      )}

                      {placedTiles.length > 0 && dragState.validEnds.includes('RIGHT') && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0, top: 0,
                            transform: `translate(calc(-50% + ${openEnds.RIGHT.x}px), calc(-50% + ${openEnds.RIGHT.y}px))`,
                            width: '75px', height: '75px',
                            borderRadius: '50%',
                            border: '3px dashed var(--baffa-gold-primary)',
                            backgroundColor: 'rgba(245, 158, 11, 0.28)',
                            boxShadow: '0 0 25px rgba(245, 158, 11, 0.7), inset 0 0 15px rgba(245, 158, 11, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                            zIndex: 70,
                            animation: 'pulse 1.2s infinite',
                          }}
                        >
                          <span className="arabic-font" style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--baffa-gold-primary)' }}>
                            يمين
                          </span>
                        </div>
                      )}

                      {placedTiles.length > 0 && dragState.validEnds.includes('LEFT') && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0, top: 0,
                            transform: `translate(calc(-50% + ${openEnds.LEFT.x}px), calc(-50% + ${openEnds.LEFT.y}px))`,
                            width: '75px', height: '75px',
                            borderRadius: '50%',
                            border: '3px dashed #38bdf8',
                            backgroundColor: 'rgba(56, 189, 248, 0.28)',
                            boxShadow: '0 0 25px rgba(56, 189, 248, 0.7), inset 0 0 15px rgba(56, 189, 248, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                            zIndex: 70,
                            animation: 'pulse 1.2s infinite',
                          }}
                        >
                          <span className="arabic-font" style={{ fontSize: '0.85rem', fontWeight: 900, color: '#38bdf8' }}>
                            شمال
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {placedTiles.length === 0 ? (
                    <div className="arabic-font animate-float" style={{ 
                      position: 'absolute', left: '0px', top: '0px', 
                      transform: 'translate(-50%, -50%)', 
                      padding: '8px 24px', borderRadius: '20px',
                      background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(245, 158, 11, 0.5)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                      color: 'var(--baffa-gold-primary)', fontSize: '1.4rem', fontWeight: 900, whiteSpace: 'nowrap'
                    }}>
                      {gameState.roundNumber === 1 ? 'الدوش 6|6' : 'بانتظار اللعب...'}
                    </div>
                  ) : (
                    (() => {
                      const maxOrder = placedTiles.reduce((max, p) => Math.max(max, p.placement.order || 0), 0);
                      return placedTiles.map((pt) => {
                        const placement = pt.placement;
                        const stableKey = `tile-${Math.min(placement.tile[0], placement.tile[1])}-${Math.max(placement.tile[0], placement.tile[1])}`;
                        const isLatestTile = (placement.order || 0) === maxOrder;
                        
                        const relSeat = getRelativeSeat(placement.playedBySeat);
                        
                        // Calculate start position relative to player seat/cards
                        const w = boardSize.width > 0 ? boardSize.width : 600;
                        const h = boardSize.height > 0 ? boardSize.height : 300;
                        const scale = fitScale > 0 ? fitScale : 1;

                        let globalSeatX = 0;
                        let globalSeatY = h / 2 + 70; // BOTTOM (Me)

                        if (relSeat === 'TOP') {
                          globalSeatX = 0;
                          globalSeatY = -(h / 2 + 70); // Partner
                        } else if (relSeat === 'LEFT') {
                          globalSeatX = -(w / 2 + 70); // Left opponent
                          globalSeatY = 0;
                        } else if (relSeat === 'RIGHT') {
                          globalSeatX = w / 2 + 70;  // Right opponent
                          globalSeatY = 0;
                        }

                        // Convert global visual seat position into local board coordinates (compensating for fitScale and center offset)
                        const localSeatX = (globalSeatX / scale) + boardCenterX;
                        const localSeatY = (globalSeatY / scale) + boardCenterY;

                        // Delta vector from target tile position (pt.x, pt.y) to the player's cards
                        const deltaX = localSeatX - pt.x;
                        const deltaY = localSeatY - pt.y;

                        // Un-rotate the delta vector by -pt.rotation so that when CSS rotates by +pt.rotation,
                        // the translation starts at the exact global seat position!
                        const rad = (pt.rotation * Math.PI) / 180;
                        const cos = Math.cos(rad);
                        const sin = Math.sin(rad);

                        const unrotatedDx = deltaX * cos + deltaY * sin;
                        const unrotatedDy = -deltaX * sin + deltaY * cos;

                        const startDx = `${Math.round(unrotatedDx)}px`;
                        const startDy = `${Math.round(unrotatedDy)}px`;

                        return (
                          <div key={stableKey} style={{ 
                            position: 'absolute', 
                            left: 0, top: 0, 
                            transform: `translate(calc(-50% + ${pt.x}px), calc(-50% + ${pt.y}px)) rotate(${pt.rotation}deg)`,
                            transition: isLatestTile ? 'none' : 'transform 0.5s ease-out',
                            zIndex: isLatestTile ? 60 : 10,
                          }}>
                            <div
                              className={isLatestTile ? "animate-tile-glide" : undefined}
                              style={isLatestTile ? ({
                                '--start-dx': startDx,
                                '--start-dy': startDy,
                              } as React.CSSProperties) : undefined}
                            >
                              <DominoTile tile={placement.tile} isVertical={false} size="md" />
                            </div>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            </div>

            {/* Floating Action UI for the Player - On the EXACT SAME ROW (South-East) as the Hand Cards */}
            {(myRole === 'PLAYER' || myRole === 'ADMIN') && mySeat !== null && isMyTurn && !isRoundOver && !gameState.canPass && (
              <div
                className="arabic-font animate-float"
                style={{
                  position: 'absolute',
                  bottom: isLandscape ? '6px' : isMobile ? '8px' : '16px',
                  right: isLandscape ? '8px' : isMobile ? '10px' : '22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isLandscape ? '4px' : isMobile ? '6px' : '10px',
                  zIndex: 40,
                }}
              >
                <div
                  style={{
                    padding: isLandscape ? '3px 10px' : isMobile ? '4px 12px' : '8px 20px',
                    background: 'linear-gradient(135deg, var(--baffa-gold-primary) 0%, #d97706 100%)',
                    color: '#000',
                    borderRadius: '30px',
                    fontWeight: 900,
                    fontSize: isLandscape ? '0.75rem' : isMobile ? '0.78rem' : '1.05rem',
                    boxShadow: '0 4px 18px rgba(245, 158, 11, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isLandscape ? '4px' : isMobile ? '5px' : '8px',
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ width: isLandscape || isMobile ? '6px' : '8px', height: isLandscape || isMobile ? '6px' : '8px', borderRadius: '50%', backgroundColor: '#000', display: 'inline-block' }} />
                  <span>دورك للعب!</span>
                </div>
              </div>
            )}

            {/* In-Table Round End Floating Action Bar (NO popup screen, stays directly on the felt table) */}
            {isRoundOver && (roundEndStage === 'DONE' || roundEndStage === 'IDLE' || roundEndStage === 'SCORE_PULSE') && (
              <div
                style={{
                  position: 'absolute',
                  bottom: isLandscape ? '36px' : isMobile ? '68px' : '85px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 65,
                  display: 'flex',
                  alignItems: 'center',
                  gap: isLandscape ? '6px' : isMobile ? '8px' : '12px',
                  backgroundColor: 'rgba(8, 16, 26, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1.5px solid var(--baffa-gold-primary)',
                  padding: isLandscape ? '3px 10px' : isMobile ? '5px 12px' : '8px 20px',
                  borderRadius: '24px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.85), 0 0 20px rgba(245,158,11,0.35)',
                  animation: 'drop-in-bottom 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                  maxWidth: isMobile ? '92%' : 'auto',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '8px', minWidth: 0 }}>
                  <span style={{ fontSize: isMobile ? '1rem' : '1.2rem' }}>{isMyTeamWinner ? '🎉' : '⚠️'}</span>
                  <span className="arabic-font" style={{ color: '#fff', fontSize: isLandscape ? '0.72rem' : isMobile ? '0.76rem' : '0.9rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isMyTeamWinner
                      ? `مبروك! فزتم (+${lastRound?.roundScore})`
                      : `فوز فريق ${lastRound?.winnerTeam} (+${lastRound?.roundScore})`}
                  </span>
                </div>

                {gameState.status === 'ROUND_FINISHED' ? (
                  <button
                    onClick={onRequestNextRound}
                    className="baffa-btn-primary"
                    style={{
                      padding: isLandscape ? '3px 8px' : isMobile ? '4px 10px' : '6px 16px',
                      fontSize: isLandscape ? '0.72rem' : isMobile ? '0.76rem' : '0.88rem',
                      borderRadius: '16px',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Zap size={isMobile ? 13 : 15} />
                    <span className="arabic-font">الجولة التالية {nextRoundCountdown > 0 ? `(${nextRoundCountdown})` : ''}</span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '8px' }}>
                    {onRematch && (
                      <button
                        onClick={handleRematch}
                        disabled={isRematchLoading}
                        className="baffa-btn-primary"
                        style={{
                          padding: isLandscape ? '3px 8px' : isMobile ? '4px 10px' : '6px 16px',
                          fontSize: isLandscape ? '0.72rem' : isMobile ? '0.76rem' : '0.88rem',
                          borderRadius: '16px',
                          cursor: isRematchLoading ? 'wait' : 'pointer',
                          opacity: isRematchLoading ? 0.8 : 1,
                          gap: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <RotateCcw size={isMobile ? 13 : 15} style={{ animation: isRematchLoading ? 'spin 1s linear infinite' : 'none' }} />
                        <span className="arabic-font">{isRematchLoading ? 'جاري البدء...' : 'العب تاني ⚡'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowMatchTrophyModal(true)}
                      className="baffa-btn-secondary"
                      style={{
                        padding: isLandscape ? '3px 8px' : isMobile ? '4px 10px' : '6px 16px',
                        fontSize: isLandscape ? '0.72rem' : isMobile ? '0.76rem' : '0.88rem',
                        borderRadius: '16px',
                        gap: '4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Trophy size={isMobile ? 13 : 15} />
                      <span className="arabic-font">التتويج 🏆</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      {/* TOASTS & MODALS */}
      {invalidMoveToast && (
        <div className="animate-float arabic-font" style={{
          position: 'fixed',
          top: isLandscape ? '44px' : isMobile ? '52px' : '68px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: isLandscape ? '4px 12px' : isMobile ? '5px 14px' : '7px 18px',
          borderRadius: '16px',
          backgroundColor: 'rgba(220, 38, 38, 0.94)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          fontSize: isLandscape ? '0.74rem' : isMobile ? '0.8rem' : '0.88rem',
          fontWeight: 800,
          zIndex: 100,
          border: '1px solid rgba(255, 255, 255, 0.25)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.65), 0 0 14px rgba(220, 38, 38, 0.4)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {invalidMoveToast}
        </div>
      )}

      {/* Match Finished Grand Trophy Modal - Compact, Elegant with Close Button */}
      {gameState.status === 'MATCH_FINISHED' && gameState.matchResult && showMatchTrophyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(6, 10, 18, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
            animation: 'fadeIn 0.25s ease-out',
          }}
          onClick={() => setShowMatchTrophyModal(false)}
        >
          <div
            className="baffa-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              padding: '22px 24px',
              textAlign: 'center',
              maxWidth: '380px',
              width: '90%',
              backgroundColor: 'rgba(14, 23, 38, 0.96)',
              border: '1.5px solid rgba(245, 158, 11, 0.55)',
              borderRadius: '24px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(245, 158, 11, 0.25)',
              animation: 'drop-in-bottom 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
              boxSizing: 'border-box',
            }}
          >
            {/* Close Button "X" */}
            <button
              type="button"
              onClick={() => setShowMatchTrophyModal(false)}
              style={{
                position: 'absolute',
                top: '14px',
                left: '14px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                zIndex: 10,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = '#94a3b8';
              }}
              title="إغلاق الشاشة ومتابعة الطاولة"
            >
              <X size={16} />
            </button>

            {/* Trophy Icon */}
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1.5px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px',
                boxShadow: '0 0 20px rgba(245, 158, 11, 0.3)',
              }}
            >
              <Trophy size={30} color="var(--baffa-gold-primary)" />
            </div>

            {/* Title & Winner Team */}
            <h2 className="arabic-font" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--baffa-gold-primary)', margin: '0 0 4px' }}>
              تتويج بطل المباراة 🏆
            </h2>
            <p className="arabic-font" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 14px' }}>
              {getTeamLabel(gameState.matchResult.winnerTeam)}
            </p>

            {/* Final Scores Box */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center',
                background: 'rgba(2, 6, 15, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '12px 18px',
                borderRadius: '16px',
                margin: '0 0 16px',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <span className="arabic-font" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--baffa-team1-color)' }}>
                  {getTeamLabel(1)}
                </span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                  {gameState.matchResult.finalTeam1Score}
                </div>
              </div>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'rgba(255,255,255,0.2)' }}>:</span>
              <div style={{ textAlign: 'center' }}>
                <span className="arabic-font" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--baffa-team2-color)' }}>
                  {getTeamLabel(2)}
                </span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                  {gameState.matchResult.finalTeam2Score}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {onRematch && (
                <button
                  onClick={handleRematch}
                  disabled={isRematchLoading}
                  className="baffa-btn-primary arabic-font"
                  style={{
                    padding: isMobile ? '8px 14px' : '10px 18px',
                    fontSize: isMobile ? '0.86rem' : '0.95rem',
                    fontWeight: 800,
                    borderRadius: '14px',
                    cursor: isRematchLoading ? 'wait' : 'pointer',
                    opacity: isRematchLoading ? 0.8 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <RotateCcw size={16} style={{ animation: isRematchLoading ? 'spin 1s linear infinite' : 'none' }} />
                  <span>{isRematchLoading ? 'جاري بدء مباراة جديدة...' : 'العب تاني ⚡'}</span>
                </button>
              )}
              <button
                onClick={() => setShowDetailsModal(true)}
                className="baffa-btn-secondary arabic-font"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <ListOrdered size={15} />
                <span>تفاصيل المباراة</span>
              </button>
              <button
                onClick={onLeaveMatch}
                className="arabic-font"
                style={{
                  marginTop: '4px',
                  color: 'var(--baffa-text-muted)',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '6px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--baffa-text-muted)')}
              >
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      )}
      {showDetailsModal && gameState.matchResult && <MatchDetailsModal matchId={gameState.matchResult.matchId} onClose={() => setShowDetailsModal(false)} />}

      {/* Dragged Floating Domino Tile Ghost */}
      <div
        ref={ghostRef}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          display: isDragging && dragState ? 'block' : 'none',
          pointerEvents: 'none',
          zIndex: 9999,
          willChange: 'transform',
          filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.85)) drop-shadow(0 0 16px rgba(245,158,11,0.5))',
        }}
      >
        {dragState && <DominoTile tile={dragState.tile} size={isLandscape ? 'xs' : isMobile ? 'sm' : 'md'} isVertical={true} />}
      </div>

      {/* Judge Disciplinary Action & Moderation Modal */}
      <RefereeDecisionModal
        isOpen={selectedJudgeTarget !== null}
        onClose={() => setSelectedJudgeTarget(null)}
        targetPlayer={selectedJudgeTarget}
        spectators={room?.spectators || (room?.spectator ? [room.spectator] : [])}
        onWarnPlayer={(seat, reason) => onJudgeWarnPlayer?.(seat, reason)}
        onDirectRedCard={(seat, reason) => onJudgeDirectRedCard?.(seat, reason)}
        onMuteAction={(targetType, identifier, muteType, mute) => {
          onJudgeMuteAction?.(targetType, identifier, muteType, mute);
        }}
        onSubSeat={(action, seat, spectatorUserId, botId) => {
          onJudgeSubSeat?.(action, seat, spectatorUserId, botId);
        }}
      />

      {/* Leave Room Confirmation Modal */}
      {showLeaveConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px',
          }}
        >
          <div
            className="arabic-font"
            style={{
              backgroundColor: '#0f172a',
              border: '1.5px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '24px',
              padding: '24px 20px',
              maxWidth: '360px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.85), 0 0 30px rgba(245, 158, 11, 0.2)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>🚪</div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--baffa-text-primary)', margin: '0 0 8px 0' }}>
                تأكيد الخروج من الغرفة
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--baffa-text-muted)', margin: 0, lineHeight: 1.5 }}>
                هل أنت متأكد من رغبتك في الخروج؟ الخروج أثناء اللعب قد يؤدي لخسارة فريقك للجولة أو مغادرة الغرفة.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onLeaveMatch();
                }}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '14px',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                  transition: 'all 0.2s ease',
                }}
              >
                نعم، خروج
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'var(--baffa-text-primary)',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                إلغاء / استمرار
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
