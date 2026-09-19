'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  BotChatMessage,
  BotId,
  ChainEnd,
  ClientEvents,
  DisconnectGraceInfo,
  DominoTile,
  NotificationPayload,
  OFFICIAL_BAFFA_BOTS,
  PlayerSeat,
  RefereeDecisionBroadcastPayload,
  RoomDetails,
  RoomSettings,
  SanitizedGameState,
  ServerEvents,
  TeamId,
  UserRole,
} from '@baffa/shared';
import { API_URL, SOCKET_URL } from '@/config/api';

export interface CurrentUser {
  id: string;
  username: string;
  avatar: string;
  token?: string;
}

function getStoredUser(): CurrentUser {
  if (typeof window !== 'undefined') {
    // 1. Check if a real authenticated account exists in localStorage first
    const saved = localStorage.getItem('baffa_user');
    const token = localStorage.getItem('baffa_token') || undefined;
    let localParsed: any = null;
    if (saved) {
      try {
        localParsed = JSON.parse(saved);
        if (token) localParsed.token = token;
      } catch {}
    }

    // 2. Check tab-isolated session storage
    const sessionSaved = sessionStorage.getItem('baffa_user');
    if (sessionSaved) {
      try {
        const parsed = JSON.parse(sessionSaved);
        if (parsed.id && parsed.id !== 'default_user') {
          // If localParsed has an uploaded photo or newer avatar, synchronize it into session
          if (localParsed && (localParsed.customAvatarUrl || localParsed.avatar?.startsWith('http') || localParsed.avatar?.startsWith('/uploads'))) {
            parsed.avatar = localParsed.customAvatarUrl || localParsed.avatar;
            parsed.username = localParsed.displayName || localParsed.username || parsed.username;
            sessionStorage.setItem('baffa_user', JSON.stringify(parsed));
          }
          return parsed;
        }
      } catch {}
    }

    if (localParsed && token && localParsed.id && localParsed.id !== 'default_user') {
      sessionStorage.setItem('baffa_user', JSON.stringify(localParsed));
      return localParsed;
    }

    // 3. Generate unique guest user for this tab
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newUser: CurrentUser = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      username: `Player_${randomNum}`,
      avatar: `avatar-${(randomNum % 4) + 1}`,
      token,
    };
    try {
      sessionStorage.setItem('baffa_user', JSON.stringify(newUser));
      if (!saved) {
        localStorage.setItem('baffa_user', JSON.stringify(newUser));
      }
    } catch {}
    return newUser;
  }
  return {
    id: 'guest_user',
    username: 'Player',
    avatar: 'avatar-1',
  };
}

export function useGameSocket() {
  const apiUrl = API_URL;
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [gameState, setGameState] = useState<SanitizedGameState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectedMove, setRejectedMove] = useState<{ reason: string; tile?: DominoTile } | null>(null);
  const [latestBotMessage, setLatestBotMessage] = useState<BotChatMessage | null>(null);
  const [latestNotification, setLatestNotification] = useState<NotificationPayload | null>(null);
  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [latestRefereeDecision, setLatestRefereeDecision] = useState<RefereeDecisionBroadcastPayload | null>(null);
  const refereeDecisionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [myRole, setMyRole] = useState<UserRole>('PLAYER');

  const myRoleRef = useRef<UserRole>(myRole);
  myRoleRef.current = myRole;

  const [currentUser, setCurrentUser] = useState<CurrentUser>(getStoredUser);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const user = getStoredUser();
      setCurrentUser(user);
    }
  }, []);

  // Synchronize latest profile & custom avatar from backend on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let effectiveToken = currentUser.token;
    if (!effectiveToken) {
      effectiveToken = localStorage.getItem('baffa_token') || sessionStorage.getItem('baffa_token') || undefined;
    }

    if (effectiveToken) {
      fetch(`${API_URL}/api/profile/me`, {
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
        },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((profile) => {
          if (profile) {
            const freshAvatar = profile.customAvatarUrl || profile.avatarUrl || 'avatar-1';
            const freshDisplayName = profile.displayName || profile.username;
            setCurrentUser((prev) => {
              const updated: CurrentUser = {
                ...prev,
                username: freshDisplayName || prev.username,
                avatar: freshAvatar,
                token: effectiveToken,
              };
              try {
                localStorage.setItem('baffa_user', JSON.stringify(updated));
                sessionStorage.setItem('baffa_user', JSON.stringify(updated));
              } catch {}
              return updated;
            });
          }
        })
        .catch(() => {});
    }
  }, [currentUser.token]);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const roomRef = useRef<RoomDetails | null>(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const activeRoomIdRef = useRef<string | null>(null);
  const leftRoomIdRef = useRef<string | null>(null);
  const isLastActiveRef = useRef<boolean | null>(null);
  const gameStateRef = useRef<SanitizedGameState | null>(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (room?.id) activeRoomIdRef.current = room.id;
    else if (gameState?.roomId) activeRoomIdRef.current = gameState.roomId;
  }, [room?.id, gameState?.roomId]);

  // Synchronize tab switching / app switching / leaving website with backend (Anti-cheat presence tracking)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const getCurrentRoomId = (): string | undefined => {
      let rId =
        roomRef.current?.id ||
        roomRef.current?.code ||
        activeRoomIdRef.current ||
        gameStateRef.current?.roomId;
      if (!rId && typeof window !== 'undefined') {
        const stored =
          sessionStorage.getItem('baffa_active_room_code') ||
          localStorage.getItem('baffa_active_room_code') ||
          new URLSearchParams(window.location.search).get('room') ||
          new URLSearchParams(window.location.search).get('code') ||
          new URLSearchParams(window.location.search).get('join');
        if (stored) rId = stored;
      }
      return rId || undefined;
    };

    // Leaving game screen (tab switched away, window blur, incognito switch, closing) -> ZERO DELAY dispatch
    const handleLeaveImmediate = () => {
      const currentTargetRoomId = getCurrentRoomId();
      if (!currentTargetRoomId) return;
      if (isLastActiveRef.current === false) return; // already marked away
      isLastActiveRef.current = false;

      const user = currentUserRef.current;
      const payload = {
        roomId: currentTargetRoomId,
        userId: user?.id,
        username: user?.username,
        isVisible: false,
        hasWindowFocus: false,
      };

      console.log('[ANTI-CHEAT-CLIENT] Player switched away from room:', currentTargetRoomId, payload);
      if (socketRef.current) {
        socketRef.current.emit(ClientEvents.APP_VISIBILITY_CHANGED, payload);
      }

      // Infallible keepalive HTTP beacon fallback (zero lag, survives background throttling)
      if (typeof window !== 'undefined') {
        const apiUrl = API_URL;
        fetch(`${apiUrl}/api/matches/visibility`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    };

    // Returning to game screen -> ZERO DELAY dispatch
    const handleReturnImmediate = () => {
      const currentTargetRoomId = getCurrentRoomId();
      if (!currentTargetRoomId) return;
      if (isLastActiveRef.current === true) return; // already active
      isLastActiveRef.current = true;

      const user = currentUserRef.current;
      const payload = {
        roomId: currentTargetRoomId,
        userId: user?.id,
        username: user?.username,
        isVisible: true,
        hasWindowFocus: true,
      };

      console.log('[ANTI-CHEAT-CLIENT] Player returned to room:', currentTargetRoomId, payload);
      if (socketRef.current) {
        socketRef.current.emit(ClientEvents.APP_VISIBILITY_CHANGED, payload);
      }

      // Infallible keepalive HTTP beacon fallback
      if (typeof window !== 'undefined') {
        const apiUrl = API_URL;
        fetch(`${apiUrl}/api/matches/visibility`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleLeaveImmediate();
      } else {
        handleReturnImmediate();
      }
    };

    window.addEventListener('focus', handleReturnImmediate);
    window.addEventListener('blur', handleLeaveImmediate);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleLeaveImmediate);
    window.addEventListener('beforeunload', handleLeaveImmediate);

    return () => {
      window.removeEventListener('focus', handleReturnImmediate);
      window.removeEventListener('blur', handleLeaveImmediate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleLeaveImmediate);
      window.removeEventListener('beforeunload', handleLeaveImmediate);
    };
  }, []);

  const prevSocketUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser.id) return;

    if (socketRef.current && prevSocketUserIdRef.current === currentUser.id) {
      // User identity didn't change: update socket auth parameters seamlessly without dropping connection
      (socketRef.current as any).auth = {
        token: currentUser.token,
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
      };
      return;
    }

    prevSocketUserIdRef.current = currentUser.id;

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      timeout: 15000,
      auth: {
        token: currentUser.token,
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
      },
    });

    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => {
      setIsConnected(true);
      setSocketInstance(socket);
      if (activeRoomIdRef.current) {
        if (myRoleRef.current === 'JUDGE') {
          socket.emit(ClientEvents.JOIN_AS_JUDGE, {
            roomId: activeRoomIdRef.current,
            user: currentUserRef.current,
          });
        } else if (myRoleRef.current === 'SPECTATOR') {
          socket.emit(ClientEvents.JOIN_AS_SPECTATOR, {
            roomId: activeRoomIdRef.current,
            user: currentUserRef.current,
          });
        } else {
          socket.emit(ClientEvents.JOIN_ROOM, {
            roomId: activeRoomIdRef.current,
            user: currentUserRef.current,
          });
        }
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setSocketInstance(null);
    });

    socket.on(ServerEvents.ROOM_SYNC, (data: { room: RoomDetails }) => {
      // Ignore if this is from a room the user explicitly left
      if (
        leftRoomIdRef.current &&
        (leftRoomIdRef.current === data.room.id || leftRoomIdRef.current === data.room.code)
      ) {
        return;
      }
      // If active in another room, match by either ID or Code
      if (
        activeRoomIdRef.current &&
        activeRoomIdRef.current !== data.room.id &&
        activeRoomIdRef.current !== data.room.code
      ) {
        return;
      }
      activeRoomIdRef.current = data.room.id;
      setRoom(data.room);
      roomRef.current = data.room;

      // Always persist active room code to sessionStorage for smooth refresh recovery
      if (typeof window !== 'undefined' && data.room?.code) {
        sessionStorage.setItem('baffa_active_room_code', data.room.code);
      }

      const user = currentUserRef.current;
      if (user && data.room) {
        const isAdmin = Boolean(
          data.room.currentAdminId === user.id ||
          data.room.ownerId === user.id ||
          data.room.originalAdminId === user.id
        );
        const isJudge = Boolean(
          data.room.judge && data.room.judge.userId === user.id
        );
        const isSpectator = Boolean(
          (data.room.spectator && data.room.spectator.userId === user.id) ||
          data.room.spectators?.some((s) => s.userId === user.id)
        );
        const isSeated = data.room.seats.some(
          (s) =>
            s.occupied &&
            !s.isBot &&
            s.playerId === user.id
        );

        if (isJudge) {
          setMyRole('JUDGE');
        } else if (isSpectator) {
          setMyRole('SPECTATOR');
        } else if (isAdmin) {
          setMyRole('ADMIN');
        } else if (isSeated) {
          setMyRole('PLAYER');
        } else if (myRoleRef.current === 'JUDGE' || myRoleRef.current === 'SPECTATOR') {
          setMyRole(myRoleRef.current);
        } else {
          setMyRole('PLAYER');
        }
      }
    });

    socket.on(ServerEvents.GAME_STATE_SYNC, (data: { gameState: SanitizedGameState }) => {
      // Ignore if this is from a room the user explicitly left
      if (leftRoomIdRef.current && leftRoomIdRef.current === data.gameState.roomId) {
        return;
      }
      // Strictly ignore updates if user is not in this room
      if (activeRoomIdRef.current && activeRoomIdRef.current !== data.gameState.roomId) {
        return;
      }
      // If user is not active in any room, ignore background game updates
      if (!activeRoomIdRef.current) {
        return;
      }
      setGameState(data.gameState);
      if (data.gameState.myRole) {
        setMyRole(data.gameState.myRole);
      }
    });

    socket.on(ServerEvents.ROOM_ERROR, (data: { message: string }) => {
      if (
        data.message &&
        (data.message.toLowerCase().includes('in progress') ||
          data.message.toLowerCase().includes('spectator') ||
          data.message.toLowerCase().includes('already'))
      ) {
        return;
      }
      setErrorMessage(data.message);
      setTimeout(() => setErrorMessage(null), 4000);
      if (data.message && data.message.toLowerCase().includes('not found')) {
        console.warn('[ROOM_ERROR] Active room was not found on server. Clearing stale room state.');
        setRoom(null);
        setGameState(null);
        activeRoomIdRef.current = null;
      }
    });

    socket.on(ServerEvents.MOVE_REJECTED, (data: { reason: string; tile?: DominoTile }) => {
      setRejectedMove(data);
      setTimeout(() => setRejectedMove(null), 2500);
    });

    socket.on(ServerEvents.BOT_MESSAGE, (data: BotChatMessage) => {
      setLatestBotMessage(data);
      setTimeout(() => setLatestBotMessage(null), 6000);
    });

    socket.on(ServerEvents.NOTIFICATION, (data: NotificationPayload) => {
      console.log('[NOTIFICATION_RECEIVED_CLIENT]', data);

      const isPersistent =
        data.persistent === true ||
        data.type === 'WARNING' ||
        data.type === 'ALERT' ||
        data.message.toLowerCase().includes('switched away') ||
        data.message.toLowerCase().includes('away') ||
        data.message.toLowerCase().includes('left the room') ||
        (data.arabicMessage && (
          data.arabicMessage.includes('خرج') ||
          data.arabicMessage.includes('غادر') ||
          data.arabicMessage.includes('نزاهة') ||
          data.arabicMessage.includes('انقطع')
        ));

      // If this is a SUCCESS return message, check if current notification is a persistent WARNING about someone else
      setLatestNotification((prev) => {
        if (!isPersistent && data.type === 'SUCCESS') {
          const prevIsAwayWarning =
            prev &&
            (prev.type === 'WARNING' || prev.type === 'ALERT') &&
            prev.arabicMessage?.includes('خرج من شاشة اللعبة');

          // If a different player returned, but another player is still away, don't erase the away warning!
          if (prevIsAwayWarning && data.userId && prev.userId && data.userId !== prev.userId) {
            return prev;
          }
        }
        return data;
      });

      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
        notificationTimerRef.current = null;
      }

      // Persistent notifications (Anti-cheat, away, leave) NEVER auto-dismiss!
      // They stay until manually dismissed via the (X) button by the user/judge.
      if (!isPersistent) {
        notificationTimerRef.current = setTimeout(() => {
          setLatestNotification(null);
          notificationTimerRef.current = null;
        }, 8000);
      }
    });

    socket.on(ServerEvents.REFEREE_DECISION_BROADCAST, (data: RefereeDecisionBroadcastPayload) => {
      if (refereeDecisionTimerRef.current) {
        clearTimeout(refereeDecisionTimerRef.current);
      }
      setLatestRefereeDecision(data);
      refereeDecisionTimerRef.current = setTimeout(() => {
        setLatestRefereeDecision(null);
        refereeDecisionTimerRef.current = null;
      }, 6000);
    });

    socket.on(ServerEvents.REMATCH_STARTED, (data?: { roomId?: string }) => {
      setRejectedMove(null);
      setErrorMessage(null);
      leftRoomIdRef.current = null;
      if (data?.roomId) {
        activeRoomIdRef.current = data.roomId;
      }
    });

    socket.on('server:profile_updated', (data: any) => {
      if (data.userId === currentUser.id) {
        const newAvatar = data.customAvatarUrl || data.avatarUrl || 'avatar-1';
        setCurrentUser((prev) => ({
          ...prev,
          username: data.displayName || data.username || prev.username,
          avatar: newAvatar,
        }));
      }

      // Update room player seat avatar in real-time
      setRoom((prevRoom) => {
        if (!prevRoom) return null;
        const updatedSeats = prevRoom.seats.map((s) => {
          if (s.playerId === data.userId) {
            return {
              ...s,
              username: data.displayName || data.username || s.username,
              avatar: data.customAvatarUrl || data.avatarUrl || s.avatar,
            };
          }
          return s;
        });
        return { ...prevRoom, seats: updatedSeats };
      });
    });

    return () => {
      if (prevSocketUserIdRef.current !== currentUser.id) {
        socket.disconnect();
      }
    };
  }, [currentUser.token, currentUser.id]);

  const syncBoardState = useCallback(async (targetRoomId?: string) => {
    const rId = targetRoomId || room?.id || gameState?.roomId || activeRoomIdRef.current;
    if (!rId) return;
    try {
      const apiUrl = API_URL;
      const role = myRoleRef.current;
      const uName = encodeURIComponent(currentUserRef.current.username || '');
      const res = await fetch(
        `${apiUrl}/api/matches/active-state/${rId}?userId=${currentUserRef.current.id}&role=${role}&username=${uName}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.gameState) {
        setGameState(data.gameState);
        if (data.room) {
          setRoom(data.room);
        }
      }
    } catch {}
  }, [room?.id, gameState?.roomId]);



  // High-reliability State Sync Fallback: polls /api/matches/active-state/:roomId during live game
  useEffect(() => {
    const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
    if (!targetRoomId) return;

    const isLive =
      room?.matchStatus === 'PLAYING' ||
      ['PLAYING', 'DEALING', 'ROUND_FINISHED'].includes(gameState?.status || '');

    if (!isLive) return;

    let isSubscribed = true;

    const syncState = async () => {
      try {
        const apiUrl = API_URL;
        const role = myRoleRef.current;
        const uName = encodeURIComponent(currentUserRef.current.username || '');
        const res = await fetch(
          `${apiUrl}/api/matches/active-state/${targetRoomId}?userId=${currentUserRef.current.id}&role=${role}&username=${uName}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!isSubscribed) return;

        if (data.success && data.gameState) {
          setGameState((prev) => {
            if (!prev) return data.gameState;
            const serverTiles = data.gameState.chain?.tiles?.length ?? 0;
            const clientTiles = prev.chain?.tiles?.length ?? 0;
            const isNewer =
              serverTiles > clientTiles ||
              data.gameState.sequenceNumber > (prev.sequenceNumber || 0) ||
              data.gameState.roundNumber !== prev.roundNumber ||
              data.gameState.status !== prev.status ||
              (serverTiles > 0 && clientTiles === 0) ||
              data.gameState.currentTurnSeat !== prev.currentTurnSeat;

            if (isNewer) {
              return data.gameState;
            }
            return prev;
          });

          if (data.room) {
            setRoom((prevRoom) => {
              if (!prevRoom) return data.room;
              if (data.room.matchStatus !== prevRoom.matchStatus) {
                return data.room;
              }
              return prevRoom;
            });
          }
        }
      } catch (err) {
        // Silently catch polling errors
      }
    };

    syncState();
    const interval = setInterval(syncState, 1500);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [room?.id, room?.matchStatus, gameState?.status, gameState?.roomId]);

  const createRoom = useCallback(
    (name: string, settings?: Partial<RoomSettings>, initialRole?: UserRole) => {
      if (!socketRef.current) return;
      leftRoomIdRef.current = null;
      socketRef.current.emit(ClientEvents.CREATE_ROOM, {
        name,
        settings,
        user: currentUser,
        initialRole,
      });
      const assignedRole: UserRole =
        initialRole === 'JUDGE'
          ? 'JUDGE'
          : initialRole === 'SPECTATOR'
          ? 'SPECTATOR'
          : 'PLAYER';
      myRoleRef.current = assignedRole;
      setMyRole(assignedRole);
    },
    [currentUser]
  );

  const joinRoom = useCallback(
    (roomIdOrCode: string) => {
      if (!socketRef.current) return;
      leftRoomIdRef.current = null;
      activeRoomIdRef.current = roomIdOrCode;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('baffa_active_room_code', roomIdOrCode);
      }
      socketRef.current.emit(ClientEvents.JOIN_ROOM, {
        roomId: roomIdOrCode,
        user: currentUser,
      });
      setMyRole('PLAYER');
    },
    [currentUser]
  );

  const joinAsJudge = useCallback(
    (roomIdOrCode: string) => {
      if (!socketRef.current) return;
      leftRoomIdRef.current = null;
      activeRoomIdRef.current = roomIdOrCode;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('baffa_active_room_code', roomIdOrCode);
      }
      socketRef.current.emit(ClientEvents.JOIN_AS_JUDGE, {
        roomId: roomIdOrCode,
        user: currentUser,
      });
      myRoleRef.current = 'JUDGE';
      setMyRole('JUDGE');
    },
    [currentUser]
  );

  const joinAsSpectator = useCallback(
    (roomIdOrCode: string) => {
      if (!socketRef.current) return;
      leftRoomIdRef.current = null;
      activeRoomIdRef.current = roomIdOrCode;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('baffa_active_room_code', roomIdOrCode);
      }
      socketRef.current.emit(ClientEvents.JOIN_AS_SPECTATOR, {
        roomId: roomIdOrCode,
        user: currentUser,
      });
      setMyRole('SPECTATOR');
    },
    [currentUser]
  );

  const selectSeat = useCallback(
    (seat: PlayerSeat) => {
      const activeRoom = roomRef.current || room;
      if (!socketRef.current || !activeRoom) return;
      const user = currentUserRef.current;

      // 1. Instant zero-latency optimistic seat update
      setRoom((prev) => {
        if (!prev) return prev;
        const targetSeatObj = prev.seats[seat];
        if (
          targetSeatObj &&
          targetSeatObj.occupied &&
          !targetSeatObj.isBot &&
          targetSeatObj.playerId !== user.id &&
          targetSeatObj.username !== user.username
        ) {
          return prev;
        }

        const currentSeatIndex = prev.seats.findIndex(
          (s) => !s.isBot && (s.playerId === user.id || (user.username && s.username === user.username))
        );

        const newSeats = [...prev.seats];
        if (currentSeatIndex >= 0 && currentSeatIndex !== seat) {
          if (targetSeatObj?.isBot) {
            newSeats[currentSeatIndex] = {
              ...targetSeatObj,
              seat: currentSeatIndex as PlayerSeat,
              team: (currentSeatIndex === 0 || currentSeatIndex === 2 ? 1 : 2) as TeamId,
              playerId: `bot_${currentSeatIndex}`,
            };
          } else {
            newSeats[currentSeatIndex] = {
              seat: currentSeatIndex as PlayerSeat,
              team: (currentSeatIndex === 0 || currentSeatIndex === 2 ? 1 : 2) as TeamId,
              occupied: false,
              playerId: null,
              username: null,
              avatar: null,
              isBot: false,
              isReady: false,
              isConnected: false,
              presence: 'ONLINE',
            };
          }
        }

        newSeats[seat] = {
          seat,
          team: (seat === 0 || seat === 2 ? 1 : 2) as TeamId,
          occupied: true,
          playerId: user.id,
          username: user.username,
          avatar: user.avatar,
          isBot: false,
          isReady: true,
          isConnected: true,
          presence: 'IN_ROOM',
          isTemporarilyBotControlled: false,
        };

        const nextRoom = { ...prev, seats: newSeats };
        roomRef.current = nextRoom;
        return nextRoom;
      });

      // 2. Transmit to server with verified user identity
      socketRef.current.emit(ClientEvents.SELECT_SEAT, {
        roomId: activeRoom.id,
        seat,
        user,
      });
    },
    [room]
  );

  const adminMoveSeat = useCallback(
    (fromSeat: PlayerSeat, toSeat: PlayerSeat) => {
      const activeRoom = roomRef.current || room;
      if (!socketRef.current || !activeRoom) return;
      const user = currentUserRef.current;

      setRoom((prev) => {
        if (!prev) return prev;
        const fromSeatObj = prev.seats[fromSeat];
        const toSeatObj = prev.seats[toSeat];
        const newSeats = [...prev.seats];
        newSeats[fromSeat] = {
          ...toSeatObj,
          seat: fromSeat,
          team: (fromSeat === 0 || fromSeat === 2 ? 1 : 2) as TeamId,
        };
        newSeats[toSeat] = {
          ...fromSeatObj,
          seat: toSeat,
          team: (toSeat === 0 || toSeat === 2 ? 1 : 2) as TeamId,
        };
        return { ...prev, seats: newSeats };
      });

      socketRef.current.emit(ClientEvents.ADMIN_MOVE_SEAT, {
        roomId: activeRoom.id,
        fromSeat,
        toSeat,
        user,
      });
    },
    [room]
  );

  const adminToggleBot = useCallback(
    (seat: PlayerSeat, enable: boolean, botId?: BotId) => {
      if (!socketRef.current || !room) return;
      const user = currentUserRef.current;

      setRoom((prev) => {
        if (!prev) return prev;
        const newSeats = [...prev.seats];
        if (enable) {
          const selectedBot = botId ? OFFICIAL_BAFFA_BOTS[botId] : OFFICIAL_BAFFA_BOTS.EL_RAYEQ;
          newSeats[seat] = {
            seat,
            team: (seat === 0 || seat === 2 ? 1 : 2) as TeamId,
            occupied: true,
            isBot: true,
            botId: selectedBot.id,
            username: selectedBot.arabicName,
            avatar: selectedBot.avatar,
            playerId: `bot_${selectedBot.id.toLowerCase()}_${Date.now()}`,
            isReady: true,
            isConnected: true,
            presence: 'IN_ROOM',
          };
        } else {
          newSeats[seat] = {
            seat,
            team: (seat === 0 || seat === 2 ? 1 : 2) as TeamId,
            occupied: false,
            playerId: null,
            username: null,
            avatar: null,
            isBot: false,
            isReady: false,
            isConnected: false,
            presence: 'ONLINE',
          };
        }
        return { ...prev, seats: newSeats };
      });

      socketRef.current.emit(ClientEvents.ADMIN_TOGGLE_BOT, {
        roomId: room.id,
        seat,
        enable,
        botId,
        user,
      });
    },
    [room]
  );

  const adminUpdateSettings = useCallback(
    (settings: Partial<RoomSettings>) => {
      if (!room) return;
      setRoom((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...settings } } : null));
      if (socketRef.current) {
        socketRef.current.emit(ClientEvents.ADMIN_UPDATE_SETTINGS, {
          roomId: room.id,
          settings,
          user: currentUser,
        });
      }
    },
    [room, currentUser]
  );

  const triggerBotTurn = useCallback((targetRoomId?: string, forceImmediate?: boolean) => {
    const rId = targetRoomId || room?.id || gameState?.roomId;
    if (!rId) return;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('client:trigger_bot', { roomId: rId, forceImmediate: Boolean(forceImmediate) });
    }
    if (typeof window !== 'undefined') {
      const apiUrl = API_URL;
      fetch(`${apiUrl}/api/matches/trigger-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: rId, forceImmediate: Boolean(forceImmediate) }),
      }).catch(() => {});
    }
    // Pull authoritative state after a micro delay
    setTimeout(() => {
      syncBoardState(rId);
    }, 200);
  }, [room?.id, gameState?.roomId, syncBoardState]);

  const adminStartMatch = useCallback((asJudge?: boolean) => {
    if (!room) return;
    const targetRoomId = room.id;
    if (asJudge) {
      setMyRole('JUDGE');
      myRoleRef.current = 'JUDGE';
    }
    const isJudgeStart = Boolean(asJudge) || myRoleRef.current === 'JUDGE' || Boolean(room.judge);
    const isSpectatorStart = !isJudgeStart && (myRoleRef.current === 'SPECTATOR' || Boolean(room.spectator));
    const effectiveRole: UserRole = isJudgeStart ? 'JUDGE' : isSpectatorStart ? 'SPECTATOR' : myRoleRef.current;

    // Optimistically update room matchStatus so UI immediately begins table transition
    setRoom((prev) => (prev ? { ...prev, matchStatus: 'PLAYING' } : null));

    const defaultBots = [
      { name: 'الرايق', botId: 'EL_RAYEQ' as const, avatar: 'bot-rayeq' },
      { name: 'القط', botId: 'EL_QETT' as const, avatar: 'bot-qett' },
      { name: 'السامي', botId: 'EL_SAMY' as const, avatar: 'bot-samy' },
      { name: 'رقم واحد', botId: 'RAQAM_WAHED' as const, avatar: 'bot-raqam-wahed' },
    ];

    // Optimistically set initial dealing state with fresh matchId so GameTable renders instantly with dealing animations
    setGameState(() => {
      const optimisticPlayers = isJudgeStart
        ? defaultBots.map((bot, idx) => ({
            seat: idx as PlayerSeat,
            team: (idx === 0 || idx === 2 ? 1 : 2) as TeamId,
            playerId: `bot_${idx}`,
            username: bot.name,
            avatar: bot.avatar,
            isBot: true,
            botId: bot.botId,
            isConnected: true,
            isReady: true,
            hiddenTilesCount: 7,
            warnings: 0,
            isChatMuted: false,
            isReactionsMuted: false,
            isVoiceMuted: false,
          }))
        : room.seats.map((s) => ({
            seat: s.seat,
            team: s.team,
            playerId: s.playerId || `bot_${s.seat}`,
            username: s.username || `Player ${s.seat + 1}`,
            avatar: s.avatar || `avatar-${s.seat + 1}`,
            isBot: s.isBot,
            botId: s.botId,
            isConnected: true,
            isReady: true,
            hiddenTilesCount: 7,
            warnings: 0,
            isChatMuted: false,
            isReactionsMuted: false,
            isVoiceMuted: false,
          }));

      return {
        matchId: `match_${targetRoomId}_${Date.now()}`,
        roomId: targetRoomId,
        status: 'DEALING',
        roundNumber: 1,
        targetScore: room.settings.targetScore || 101,
        team1Score: 0,
        team2Score: 0,
        currentTurnSeat: -1 as any,
        starterSeat: -1 as any,
        chain: { tiles: [], leftEndValue: null, rightEndValue: null },
        players: optimisticPlayers,
        myHand: [],
        mySeat: isJudgeStart || isSpectatorStart ? null : 0,
        myRole: effectiveRole,
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
    });

    // 1. Socket emit (Primary real-time path)
    if (socketRef.current) {
      socketRef.current.emit(ClientEvents.ADMIN_START_MATCH, {
        roomId: targetRoomId,
        user: currentUser,
        role: effectiveRole,
      });
    }

    // 2. HTTP fallback for 100% guarantee
    if (typeof window !== 'undefined') {
      const apiUrl = API_URL;
      fetch(`${apiUrl}/api/matches/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: targetRoomId, userId: currentUser.id, username: currentUser.username, role: effectiveRole }),
      }).catch((err) => console.error('Fallback start failed:', err));
    }

    // 3. Smooth optimistic dealing transition safeguard: Never leave table frozen in DEALING
    setTimeout(() => {
      setGameState((prev) => {
        if (!prev || prev.status !== 'DEALING') return prev;
        return {
          ...prev,
          status: 'PLAYING',
          currentTurnSeat: (prev.currentTurnSeat as number) < 0 ? 0 : prev.currentTurnSeat,
          starterSeat: (prev.starterSeat as number) < 0 ? 0 : prev.starterSeat,
        };
      });
      triggerBotTurn(targetRoomId);
      syncBoardState(targetRoomId);
    }, 800);
  }, [room, currentUser, triggerBotTurn, syncBoardState]);

  const playTile = useCallback(
    (tile: DominoTile, end?: ChainEnd) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      if (socketRef.current) {
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        }
        socketRef.current.emit(ClientEvents.PLAY_TILE, {
          roomId: targetRoomId,
          tile,
          end,
          sequenceNumber: gameState?.sequenceNumber,
        });
      }

      if (!socketRef.current || !socketRef.current.connected) {
        fetch(`${apiUrl}/api/matches/play-tile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            seat: gameState?.mySeat,
            tile,
            end,
            userId: currentUserRef.current.id,
          }),
        }).catch(() => {});
      }
    },
    [room?.id, gameState?.roomId, gameState?.sequenceNumber, gameState?.mySeat, apiUrl]
  );

  const passTurn = useCallback(() => {
    const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
    if (!targetRoomId) return;

    if (socketRef.current) {
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
      socketRef.current.emit(ClientEvents.PASS_TURN, {
        roomId: targetRoomId,
        sequenceNumber: gameState?.sequenceNumber,
      });
    }

    if (!socketRef.current || !socketRef.current.connected) {
      fetch(`${apiUrl}/api/matches/pass-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: targetRoomId,
          seat: gameState?.mySeat,
          userId: currentUserRef.current.id,
        }),
      }).catch(() => {});
    }
  }, [room?.id, gameState?.roomId, gameState?.sequenceNumber, gameState?.mySeat, apiUrl]);

  const triggerDecisionToast = useCallback((decision: RefereeDecisionBroadcastPayload) => {
    if (refereeDecisionTimerRef.current) {
      clearTimeout(refereeDecisionTimerRef.current);
    }
    setLatestRefereeDecision(decision);
    refereeDecisionTimerRef.current = setTimeout(() => {
      setLatestRefereeDecision(null);
      refereeDecisionTimerRef.current = null;
    }, 6000);
  }, []);

  const judgeReportCheating = useCallback(
    (offendingSeat: PlayerSeat, reason: string) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      const seatNum = Number(offendingSeat);
      const targetP = gameState?.players?.find((p) => p.seat === seatNum);
      const targetName = targetP?.username || `لاعب ${seatNum + 1}`;
      const reasonText = reason?.trim() || 'ثبوت واقعة غش صريحة';

      triggerDecisionToast({
        actionType: 'YELLOW_CARD_2_CHEATING',
        judgeName: currentUser.username || 'الحكم',
        targetSeat: seatNum as PlayerSeat,
        targetPlayerName: targetName,
        targetTeam: (seatNum === 0 || seatNum === 2 ? 1 : 2) as TeamId,
        beneficiaryTeam: (seatNum === 0 || seatNum === 2 ? 2 : 1) as TeamId,
        title: 'احتساب غش وإنهاء الجولة',
        arabicMessage: `أعلن الحكم ثبوت حالة غش على اللاعب ${targetName}! تم إنهاء الجولة واحتساب نقاطها للفريق المنافس.`,
        reason: reasonText,
        timestamp: Date.now(),
      });

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ClientEvents.JUDGE_REPORT_CHEATING, {
          roomId: targetRoomId,
          offendingSeat: seatNum,
          reason: reasonText,
          user: currentUser,
        });
      } else {
        fetch(`${apiUrl}/api/matches/judge-decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            action: 'CHEATING',
            seat: seatNum,
            reason: reasonText,
            user: currentUser,
          }),
        }).catch(() => {});
      }

      setTimeout(() => syncBoardState(targetRoomId), 250);
    },
    [room?.id, gameState?.roomId, gameState?.players, currentUser, triggerDecisionToast, syncBoardState, apiUrl]
  );

  const judgeWarnPlayer = useCallback(
    (seat: PlayerSeat, reason?: string) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      const seatNum = Number(seat);
      const targetP = gameState?.players?.find((p) => p.seat === seatNum);
      const targetName = targetP?.username || `لاعب ${seatNum + 1}`;
      const currentWarnings = targetP?.warnings || 0;
      const isSecondWarning = currentWarnings >= 1;
      const reasonText = reason?.trim() || 'مخالفة أو تعطيل اللعب';

      // 1. Instant 0ms Optimistic UI Toast: pops up immediately on the referee's screen!
      triggerDecisionToast({
        actionType: isSecondWarning ? 'YELLOW_CARD_2_CHEATING' : 'YELLOW_CARD_1',
        judgeName: currentUser.username || 'الحكم',
        targetSeat: seatNum as PlayerSeat,
        targetPlayerName: targetName,
        targetTeam: (seatNum === 0 || seatNum === 2 ? 1 : 2) as TeamId,
        beneficiaryTeam: (seatNum === 0 || seatNum === 2 ? 2 : 1) as TeamId,
        title: isSecondWarning ? 'إنذار ثانٍ (كارت أحمر) - إنهاء الجولة' : 'كارت أصفر (إنذار أول)',
        arabicMessage: isSecondWarning
          ? `حصل اللاعب ${targetName} على الإنذار الثاني! تم احتساب حالة غش وإنهاء الجولة ومنح نقاطها للفريق المنافس.`
          : `أشهر الحكم كارت أصفر (إنذار أول) في وجه اللاعب ${targetName}.`,
        reason: reasonText,
        timestamp: Date.now(),
      });

      // Optimistically update player warnings in local state
      setGameState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.seat === seatNum ? { ...p, warnings: (p.warnings || 0) + 1 } : p
          ),
        };
      });

      // 2. Real-time emission via WebSocket (with HTTP fallback only if disconnected)
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ClientEvents.JUDGE_WARN_PLAYER, {
          roomId: targetRoomId,
          seat: seatNum,
          reason: reasonText,
          user: currentUser,
        });
      } else {
        fetch(`${apiUrl}/api/matches/judge-decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            action: 'WARN',
            seat: seatNum,
            reason: reasonText,
            user: currentUser,
          }),
        }).catch(() => {});
      }

      // 3. Authoritative state synchronization
      setTimeout(() => syncBoardState(targetRoomId), 250);
    },
    [room?.id, gameState?.roomId, gameState?.players, currentUser, triggerDecisionToast, syncBoardState, apiUrl]
  );

  const judgeDirectRedCard = useCallback(
    (seat: PlayerSeat, reason?: string) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      const seatNum = Number(seat);
      const targetP = gameState?.players?.find((p) => p.seat === seatNum);
      const targetName = targetP?.username || `لاعب ${seatNum + 1}`;
      const reasonText = reason?.trim() || 'كارت أحمر مباشر - احتساب حالة غش صريحة';

      triggerDecisionToast({
        actionType: 'DIRECT_RED_CARD',
        judgeName: currentUser.username || 'الحكم',
        targetSeat: seatNum as PlayerSeat,
        targetPlayerName: targetName,
        targetTeam: (seatNum === 0 || seatNum === 2 ? 1 : 2) as TeamId,
        beneficiaryTeam: (seatNum === 0 || seatNum === 2 ? 2 : 1) as TeamId,
        title: 'كارت أحمر مباشر',
        arabicMessage: `أشهر الحكم الكارت الأحمر المباشر للاعب ${targetName}! تم إنهاء الجولة واحتساب نقاطها للفريق المنافس.`,
        reason: reasonText,
        timestamp: Date.now(),
      });

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ClientEvents.JUDGE_DIRECT_RED_CARD, {
          roomId: targetRoomId,
          seat: seatNum,
          reason: reasonText,
          user: currentUser,
        });
      } else {
        fetch(`${apiUrl}/api/matches/judge-decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            action: 'RED_CARD',
            seat: seatNum,
            reason: reasonText,
            user: currentUser,
          }),
        }).catch(() => {});
      }

      setTimeout(() => syncBoardState(targetRoomId), 250);
    },
    [room?.id, gameState?.roomId, gameState?.players, currentUser, triggerDecisionToast, syncBoardState, apiUrl]
  );

  const judgeMuteAction = useCallback(
    (
      targetType: 'SEAT' | 'SPECTATOR',
      identifier: { seat?: PlayerSeat; userId?: string },
      muteType: 'CHAT' | 'REACTIONS' | 'VOICE',
      mute: boolean
    ) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      const seatNum = identifier.seat !== undefined ? Number(identifier.seat) : undefined;
      const targetP = seatNum !== undefined ? gameState?.players?.find((p) => p.seat === seatNum) : null;
      const targetName = targetP?.username || (seatNum !== undefined ? `لاعب ${seatNum + 1}` : 'مشاهد');
      const typeLabel = muteType === 'CHAT' ? 'الدردشة' : muteType === 'REACTIONS' ? 'التفاعلات' : 'الصوت والمايك';

      triggerDecisionToast({
        actionType: muteType === 'CHAT' ? (mute ? 'MUTE_CHAT' : 'UNMUTE_CHAT') : (mute ? 'MUTE_VOICE' : 'UNMUTE_VOICE'),
        judgeName: currentUser.username || 'الحكم',
        targetSeat: seatNum as PlayerSeat | undefined,
        targetPlayerName: targetName,
        title: mute ? `كتم ${typeLabel}` : `إلغاء كتم ${typeLabel}`,
        arabicMessage: `قام الحكم ${mute ? 'بكتم' : 'بإلغاء كتم'} ${typeLabel} عن ${targetName}.`,
        reason: mute ? `مخالفة في ${typeLabel}` : `إلغاء عقوبة ${typeLabel}`,
        timestamp: Date.now(),
      });

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ClientEvents.JUDGE_MUTE_ACTION, {
          roomId: targetRoomId,
          targetType,
          seat: seatNum,
          userId: identifier.userId,
          muteType,
          mute,
          user: currentUser,
        });
      } else {
        fetch(`${apiUrl}/api/matches/judge-decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            action: 'MUTE',
            seat: seatNum,
            muteType,
            mute,
            user: currentUser,
          }),
        }).catch(() => {});
      }

      setTimeout(() => syncBoardState(targetRoomId), 250);
    },
    [room?.id, gameState?.roomId, gameState?.players, currentUser, triggerDecisionToast, syncBoardState, apiUrl]
  );

  const judgeVoidRound = useCallback(
    (reason?: string) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      const reasonText = reason?.trim() || 'إلغاء وإعادة الجولة بقرار تحكيمي';

      triggerDecisionToast({
        actionType: 'VOID_ROUND',
        judgeName: currentUser.username || 'الحكم',
        targetPlayerName: 'جميع اللاعبين (كافة المقاعد)',
        title: 'إلغاء وإعادة الجولة',
        arabicMessage: 'قرر الحكم إلغاء الجولة الحالية وإعادة توزيع الدومينو دون أي تعديل على النقاط!',
        reason: reasonText,
        timestamp: Date.now(),
      });

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ClientEvents.JUDGE_VOID_ROUND, {
          roomId: targetRoomId,
          reason: reasonText,
          user: currentUser,
        });
      } else {
        fetch(`${apiUrl}/api/matches/judge-decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            action: 'VOID',
            reason: reasonText,
            user: currentUser,
          }),
        }).catch(() => {});
      }

      setTimeout(() => syncBoardState(targetRoomId), 350);
    },
    [room?.id, gameState?.roomId, currentUser, triggerDecisionToast, syncBoardState, apiUrl]
  );

  const judgeGrantExtraTime = useCallback(
    (seconds: number = 20) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      const curTurnSeat = gameState?.currentTurnSeat;
      const targetP = curTurnSeat !== undefined ? gameState?.players?.find((p) => p.seat === curTurnSeat) : null;
      const targetName = targetP?.username || (curTurnSeat !== undefined ? `لاعب ${curTurnSeat + 1}` : 'اللاعب الحالي');

      triggerDecisionToast({
        actionType: 'GRANT_EXTRA_TIME',
        judgeName: currentUser.username || 'الحكم',
        targetSeat: curTurnSeat as PlayerSeat | undefined,
        targetPlayerName: targetName,
        title: `منح وقت إضافي (+${seconds}ث)`,
        arabicMessage: `منح الحكم +${seconds} ثانية إضافية للتفكير في الدور الحالي!`,
        reason: `منح +${seconds} ثانية وقت تفكير إضافي`,
        timestamp: Date.now(),
      });

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ClientEvents.JUDGE_GRANT_EXTRA_TIME, {
          roomId: targetRoomId,
          seconds,
          user: currentUser,
        });
      } else {
        fetch(`${apiUrl}/api/matches/judge-decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            action: 'EXTRA_TIME',
            user: currentUser,
          }),
        }).catch(() => {});
      }

      setTimeout(() => syncBoardState(targetRoomId), 250);
    },
    [room?.id, gameState?.roomId, gameState?.currentTurnSeat, gameState?.players, currentUser, triggerDecisionToast, syncBoardState, apiUrl]
  );

  const judgeTerminateMatch = useCallback(
    (winnerTeam?: TeamId, reason?: string) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      const winner = winnerTeam || 1;
      const reasonText = reason?.trim() || 'إنهاء المباراة بقرار إداري من الحكم';

      triggerDecisionToast({
        actionType: 'TERMINATE_MATCH',
        judgeName: currentUser.username || 'الحكم',
        targetPlayerName: `فريق ${winner === 1 ? 2 : 1} (لصالح فريق ${winner})`,
        title: 'إنهاء المباراة بقرار تحكيمي',
        arabicMessage: `أنهى الحكم المباراة رسمياً واحتسب الفوز لفريق ${winner}!`,
        reason: reasonText,
        timestamp: Date.now(),
      });

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ClientEvents.JUDGE_TERMINATE_MATCH, {
          roomId: targetRoomId,
          winnerTeam: winner,
          reason: reasonText,
          user: currentUser,
        });
      } else {
        fetch(`${apiUrl}/api/matches/judge-decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            action: 'TERMINATE',
            winnerTeam: winner,
            reason: reasonText,
            user: currentUser,
          }),
        }).catch(() => {});
      }

      setTimeout(() => syncBoardState(targetRoomId), 350);
    },
    [room?.id, gameState?.roomId, currentUser, triggerDecisionToast, syncBoardState, apiUrl]
  );

  const judgeSubSeat = useCallback(
    (
      action: 'KICK_TO_SPECTATOR' | 'RETURN_FROM_SPECTATOR' | 'SUB_SPECTATOR_TO_SEAT',
      seat: PlayerSeat,
      spectatorUserId?: string,
      botId?: BotId
    ) => {
      const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
      if (!targetRoomId) return;

      const seatNum = Number(seat);
      const targetP = gameState?.players?.find((p) => Number(p.seat) === seatNum);
      const targetName = targetP?.username || `لاعب ${seatNum + 1}`;
      const isCurrentBot = targetP?.isBot;
      const chosenBotId: BotId = botId || 'EL_SAMY';
      const botProfile = OFFICIAL_BAFFA_BOTS[chosenBotId] || { arabicName: 'بوت مصري', avatar: 'bot-samy' };
      const botLabel = botProfile.arabicName;

      triggerDecisionToast({
        actionType: 'KICK_TO_SPECTATOR',
        judgeName: currentUser.username || 'الحكم',
        targetSeat: seatNum as PlayerSeat,
        targetPlayerName: targetName,
        title:
          action === 'KICK_TO_SPECTATOR'
            ? isCurrentBot
              ? `تغيير البوت إلى (${botLabel})`
              : `تحويل للمشاهدين واستبدال بـ (${botLabel})`
            : 'إعادة اللاعب للمقعد',
        arabicMessage:
          action === 'KICK_TO_SPECTATOR'
            ? isCurrentBot
              ? `قام الحكم باستبدال البوت في المقعد ${seatNum + 1} بالبوت (${botLabel})!`
              : `قرر الحكم تحويل اللاعب ${targetName} إلى مقاعد المشاهدين واستبداله بالبوت (${botLabel})!`
            : `أعاد الحكم اللاعب إلى المقعد ${seatNum + 1}.`,
        reason: action === 'KICK_TO_SPECTATOR' ? `استبدال بالبوت ${botLabel}` : 'استرجاع لاعب من المشاهدين',
        timestamp: Date.now(),
      });

      // 1. Immediate optimistic UI updates so table instantly reflects the new bot
      if (action === 'KICK_TO_SPECTATOR') {
        setGameState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map((p) => {
              if (Number(p.seat) === seatNum) {
                return {
                  ...p,
                  isBot: true,
                  botId: chosenBotId,
                  username: botProfile.arabicName,
                  avatar: botProfile.avatar,
                  playerId: `bot_${seatNum}`,
                };
              }
              return p;
            }),
          };
        });

        setRoom((prev) => {
          if (!prev) return prev;
          const oldSeat = prev.seats[seatNum];
          const isHuman = oldSeat && !oldSeat.isBot && oldSeat.playerId && !oldSeat.playerId.startsWith('bot_');
          const updatedSeats = prev.seats.map((s, idx) => {
            if (idx === seatNum) {
              return {
                ...s,
                occupied: true,
                isBot: true,
                botId: chosenBotId,
                username: botProfile.arabicName,
                avatar: botProfile.avatar,
                playerId: `bot_${seatNum}`,
                isReady: true,
                isConnected: true,
              };
            }
            return s;
          });

          let updatedSpectators = prev.spectators ? [...prev.spectators] : [];
          if (isHuman && oldSeat.playerId) {
            if (!updatedSpectators.some((sp) => sp.userId === oldSeat.playerId)) {
              updatedSpectators.push({
                userId: oldSeat.playerId,
                username: oldSeat.username || 'لاعب',
                avatar: oldSeat.avatar || 'avatar-1',
                isConnected: oldSeat.isConnected ?? true,
                isMuted: false,
              });
            }
          }
          return {
            ...prev,
            seats: updatedSeats,
            spectators: updatedSpectators,
            spectator: updatedSpectators[0] || prev.spectator,
          };
        });
      } else if (action === 'RETURN_FROM_SPECTATOR' || action === 'SUB_SPECTATOR_TO_SEAT') {
        const specUser = room?.spectators?.find((s) => s.userId === spectatorUserId);
        const restoredName = specUser?.username || 'لاعب';
        const restoredAvatar = specUser?.avatar || 'avatar-1';

        setGameState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map((p) => {
              if (Number(p.seat) === seatNum) {
                return {
                  ...p,
                  isBot: false,
                  botId: undefined,
                  username: restoredName,
                  avatar: restoredAvatar,
                  playerId: spectatorUserId || `player_${seatNum}`,
                };
              }
              return p;
            }),
          };
        });

        setRoom((prev) => {
          if (!prev) return prev;
          const updatedSeats = prev.seats.map((s, idx) => {
            if (idx === seatNum) {
              return {
                ...s,
                occupied: true,
                isBot: false,
                botId: undefined,
                username: restoredName,
                avatar: restoredAvatar,
                playerId: spectatorUserId || `player_${seatNum}`,
                isReady: true,
                isConnected: true,
              };
            }
            return s;
          });
          const updatedSpectators = (prev.spectators || []).filter((sp) => sp.userId !== spectatorUserId);
          return {
            ...prev,
            seats: updatedSeats,
            spectators: updatedSpectators,
            spectator: updatedSpectators[0] || null,
          };
        });
      }

      // 2. Authoritative socket emit (with HTTP fallback only if disconnected)
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ClientEvents.JUDGE_SUB_SEAT, {
          roomId: targetRoomId,
          action,
          seat: seatNum,
          spectatorUserId,
          botId: chosenBotId,
          user: currentUser,
        });
      } else {
        fetch(`${apiUrl}/api/matches/judge-decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            action: 'SUB',
            subAction: action,
            seat: seatNum,
            spectatorUserId,
            botId: chosenBotId,
            user: currentUser,
          }),
        }).catch(() => {});
      }

      setTimeout(() => syncBoardState(targetRoomId), 350);
    },
    [room?.id, room?.spectators, gameState?.roomId, gameState?.players, currentUser, triggerDecisionToast, syncBoardState, apiUrl]
  );

  const dismissRefereeDecision = useCallback(() => {
    if (refereeDecisionTimerRef.current) {
      clearTimeout(refereeDecisionTimerRef.current);
      refereeDecisionTimerRef.current = null;
    }
    setLatestRefereeDecision(null);
  }, []);

  const requestNextRound = useCallback(() => {
    const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
    if (!targetRoomId) return;

    if (socketRef.current) {
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
      socketRef.current.emit(ClientEvents.REQUEST_NEXT_ROUND, {
        roomId: targetRoomId,
        user: currentUserRef.current,
      });
    }

    // Proactive HTTP fallback so next round ALWAYS triggers smoothly
    fetch(`${apiUrl}/api/matches/next-round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: targetRoomId,
        userId: currentUserRef.current.id,
        user: currentUserRef.current,
      }),
    }).catch(() => {});

    setTimeout(() => syncBoardState(targetRoomId), 300);
  }, [room?.id, gameState?.roomId, apiUrl, syncBoardState]);

  const requestRematch = useCallback(
    (overrideRoomId?: string) => {
      const targetRoomId =
        overrideRoomId || room?.id || gameState?.roomId || activeRoomIdRef.current;
      const liveSocket = (socketRef.current?.connected ? socketRef.current : socketInstance) || socketRef.current;
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
      if (socketInstance && !socketInstance.connected) {
        socketInstance.connect();
      }
      leftRoomIdRef.current = null;

      if (!targetRoomId) {
        console.warn('[REMATCH] No active room ID found, creating fresh Quick Match');
        createRoom(
          'Quick Match (Ahwa)',
          {
            targetScore: 101,
            fillWithBots: true,
            maxPlayers: 4,
            allowJudge: true,
            allowSpectator: true,
            voiceEnabled: true,
            selectedBotId: 'EL_SAMY',
          },
          myRoleRef.current
        );
        return;
      }

      activeRoomIdRef.current = targetRoomId;
      console.log('[REMATCH] Emitting REMATCH_REQUEST for room:', targetRoomId);
      
      const payload = {
        roomId: targetRoomId,
        user: currentUserRef.current,
      };

      if (socketRef.current) {
        socketRef.current.emit(ClientEvents.REMATCH_REQUEST, payload);
      }
      if (socketInstance && socketInstance !== socketRef.current) {
        socketInstance.emit(ClientEvents.REMATCH_REQUEST, payload);
      }

      // Also HTTP fallback for 100% guarantee
      if (typeof window !== 'undefined') {
        const apiUrl = API_URL;
        fetch(`${apiUrl}/api/matches/rematch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: targetRoomId,
            userId: currentUserRef.current?.id,
            username: currentUserRef.current?.username,
          }),
        }).catch(() => {});
      }
    },
    [room?.id, gameState?.roomId, socketInstance, createRoom]
  );

  const leaveRoom = useCallback(() => {
    const targetRoomId = room?.id || gameState?.roomId || activeRoomIdRef.current;
    leftRoomIdRef.current = targetRoomId;
    activeRoomIdRef.current = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('baffa_active_room_code');
    }
    if (socketRef.current && targetRoomId) {
      socketRef.current.emit(ClientEvents.LEAVE_ROOM, {
        roomId: targetRoomId,
      });
    }
    if (targetRoomId && typeof window !== 'undefined') {
      const apiUrl = API_URL;
      fetch(`${apiUrl}/api/matches/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: targetRoomId, userId: currentUserRef.current?.id }),
        keepalive: true,
      }).catch(() => {});
    }
    setRoom(null);
    roomRef.current = null;
    isLastActiveRef.current = null;
    setGameState(null);
    setMyRole('PLAYER');
  }, [room?.id, gameState?.roomId]);

  const dismissNotification = useCallback(() => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }
    setLatestNotification(null);
  }, []);

  const setAuthSession = useCallback((user: CurrentUser, token: string) => {
    const updated = { ...user, token };
    setCurrentUser(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('baffa_user', JSON.stringify(updated));
      sessionStorage.setItem('baffa_user', JSON.stringify(updated));
      if (token) {
        localStorage.setItem('baffa_token', token);
        sessionStorage.setItem('baffa_token', token);
      } else {
        localStorage.removeItem('baffa_token');
        sessionStorage.removeItem('baffa_token');
      }
    }
  }, []);

  const updateCurrentUser = useCallback((updates: Partial<CurrentUser>) => {
    setCurrentUser((prev) => {
      const next: CurrentUser = { ...prev, ...updates };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('baffa_user', JSON.stringify(next));
          sessionStorage.setItem('baffa_user', JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }, []);

  return {
    socket: socketInstance || socketRef.current,
    isConnected,
    currentUser,
    myRole,
    room,
    gameState,
    errorMessage,
    rejectedMove,
    latestBotMessage,
    latestNotification,
    setLatestNotification,
    dismissNotification,
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
    setAuthSession,
    updateCurrentUser,
    triggerBotTurn,
    syncBoardState,
  };
}
