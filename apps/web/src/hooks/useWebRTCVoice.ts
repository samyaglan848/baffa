'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@baffa/shared';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface UseWebRTCVoiceOptions {
  socket: Socket | null;
  roomId: string | null;
  currentUserId: string;
  enabled?: boolean;
  isForcedMuted?: boolean;
}

export function useWebRTCVoice({
  socket,
  roomId,
  currentUserId,
  enabled = true,
  isForcedMuted = false,
}: UseWebRTCVoiceOptions) {
  const [isMuted, setIsMuted] = useState(true);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [activePeers, setActivePeers] = useState<string[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
      }
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  const attachAnalyser = useCallback((stream: MediaStream, userId: string) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analysersRef.current.set(userId, analyser);
    } catch {
      // AudioContext attach might fail gracefully
    }
  }, [getAudioContext]);

  // Periodic volume detector for active speaker visualization
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const currentlySpeaking = new Set<string>();
      for (const [userId, analyser] of analysersRef.current.entries()) {
        try {
          const buffer = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const norm = (buffer[i] - 128) / 128;
            sum += norm * norm;
          }
          const rms = Math.sqrt(sum / buffer.length);
          if (rms > 0.04) {
            currentlySpeaking.add(userId);
          }
        } catch {}
      }

      setSpeakingUsers((prev) => {
        if (prev.size === currentlySpeaking.size && [...prev].every((id) => currentlySpeaking.has(id))) {
          return prev;
        }
        return currentlySpeaking;
      });
    }, 120);

    return () => clearInterval(interval);
  }, [enabled]);

  // Auto-mute when judge forces mute
  useEffect(() => {
    if (isForcedMuted && localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack && audioTrack.enabled) {
        audioTrack.enabled = false;
        setIsMuted(true);
        if (socket && roomId) {
          socket.emit(ClientEvents.VOICE_MUTE, { roomId, isMuted: true });
        }
      }
    }
  }, [isForcedMuted, socket, roomId]);

  // Initialize Microphone (called when user clicks to enable mic)
  const initLocalStream = useCallback(async () => {
    if (!enabled || typeof window === 'undefined') {
      return null;
    }

    const getMedia =
      navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) ||
      (navigator as any).webkitGetUserMedia?.bind(navigator) ||
      (navigator as any).mozGetUserMedia?.bind(navigator) ||
      (navigator as any).getUserMedia?.bind(navigator);

    if (!getMedia) {
      setShowPermissionGuide(true);
      return null;
    }

    let stream: MediaStream | null = null;
    try {
      // 1. First attempt: Optimal constraints for clarity & echo cancellation
      stream = await getMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (primaryErr: any) {
      // 2. Second attempt: Basic audio: true (100% compatible fallback for smartphones / older browsers)
      try {
        stream = await getMedia({
          audio: true,
          video: false,
        });
      } catch (fallbackErr: any) {
        const err = fallbackErr || primaryErr;
        setIsVoiceConnected(false);
        setIsMuted(true);

        if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          if (typeof window !== 'undefined') {
            alert('لم يتم العثور على ميكروفون متصل بجهازك 🎙️');
          }
        } else {
          // Open the responsive permission guide modal
          setShowPermissionGuide(true);
        }
        return null;
      }
    }

    if (stream) {
      localStreamRef.current = stream;
      attachAnalyser(stream, currentUserId);
      setIsVoiceConnected(true);
      setShowPermissionGuide(false);

      // Attach track to any existing peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        const hasAudioTrack = senders.some((s) => s.track?.kind === 'audio');
        if (!hasAudioTrack) {
          stream!.getAudioTracks().forEach((track) => {
            pc.addTrack(track, stream!);
          });
        }
      });

      return stream;
    }

    return null;
  }, [enabled, attachAnalyser, currentUserId]);

  // Create Peer Connection
  const createPeerConnection = useCallback(
    (targetUserId: string) => {
      if (!socket || !roomId) return null;

      const pc = new RTCPeerConnection(RTC_CONFIG);

      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit(ClientEvents.VOICE_SIGNAL, {
            roomId,
            targetUserId,
            signal: { candidate: event.candidate },
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          attachAnalyser(stream, targetUserId);
          const remoteAudio = new Audio();
          remoteAudio.srcObject = stream;
          remoteAudio.autoplay = true;
          remoteAudio.setAttribute('playsinline', 'true');
          remoteAudio.setAttribute('webkit-playsinline', 'true');
          remoteAudio.play().catch(() => {});
        }
      };

      peerConnectionsRef.current.set(targetUserId, pc);
      return pc;
    },
    [socket, roomId, attachAnalyser]
  );

  // Toggle Mute (click to turn ON mic / click to turn OFF mic)
  const toggleMute = useCallback(async () => {
    if (isForcedMuted) {
      if (typeof window !== 'undefined') {
        alert('المايك محظور عنك حالياً بقرار من حكم المباراة ⚖️');
      }
      return;
    }

    if (!enabled) {
      if (typeof window !== 'undefined') {
        alert('المايك محظور في هذه الغرفة من إعدادات الأدمن 🚫');
      }
      return;
    }

    if (!localStreamRef.current) {
      const stream = await initLocalStream();
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = true;
          setIsMuted(false);
          if (socket && roomId) {
            socket.emit(ClientEvents.VOICE_MUTE, { roomId, isMuted: false });
          }
        }
      }
      return;
    }

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const nextMuted = !isMuted;
      audioTrack.enabled = !nextMuted;
      setIsMuted(nextMuted);

      if (socket && roomId) {
        socket.emit(ClientEvents.VOICE_MUTE, {
          roomId,
          isMuted: nextMuted,
        });
      }
    }
  }, [enabled, isForcedMuted, isMuted, initLocalStream, socket, roomId]);

  // Socket signaling listeners
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleSignal = async (data: { fromUserId: string; signal: any }) => {
      const { fromUserId, signal } = data;
      let pc = peerConnectionsRef.current.get(fromUserId);

      if (!pc) {
        pc = createPeerConnection(fromUserId) || undefined;
      }

      if (!pc) return;

      try {
        if (signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          if (signal.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit(ClientEvents.VOICE_SIGNAL, {
              roomId,
              targetUserId: fromUserId,
              signal: { sdp: pc.localDescription },
            });
          }
        } else if (signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch {
        // ignore signaling error
      }
    };

    const handlePeersSync = (data: { peers: any[] }) => {
      const otherPeerIds = data.peers
        .map((p) => p.userId)
        .filter((id) => id !== currentUserId);

      setActivePeers(otherPeerIds);

      // Initiate offer to new peers
      otherPeerIds.forEach(async (targetUserId) => {
        if (!peerConnectionsRef.current.has(targetUserId)) {
          const pc = createPeerConnection(targetUserId);
          if (pc) {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit(ClientEvents.VOICE_SIGNAL, {
                roomId,
                targetUserId,
                signal: { sdp: pc.localDescription },
              });
            } catch {
              // ignore
            }
          }
        }
      });
    };

    socket.on(ServerEvents.VOICE_SIGNAL, handleSignal);
    socket.on(ServerEvents.VOICE_PEERS_SYNC, handlePeersSync);

    return () => {
      socket.off(ServerEvents.VOICE_SIGNAL, handleSignal);
      socket.off(ServerEvents.VOICE_PEERS_SYNC, handlePeersSync);

      // Clean up connections
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [socket, roomId, currentUserId, createPeerConnection]);

  const isSpeaking = useCallback(
    (userId?: string | null) => {
      if (!userId) return false;
      return speakingUsers.has(userId);
    },
    [speakingUsers]
  );

  const requestMicrophonePermission = useCallback(async () => {
    const stream = await initLocalStream();
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
        setIsMuted(false);
        if (socket && roomId) {
          socket.emit(ClientEvents.VOICE_MUTE, { roomId, isMuted: false });
        }
      }
      return true;
    }
    return false;
  }, [initLocalStream, socket, roomId]);

  return {
    isMuted,
    isVoiceConnected,
    activePeers,
    speakingUsers,
    isSpeaking,
    toggleMute,
    initLocalStream,
    showPermissionGuide,
    setShowPermissionGuide,
    requestMicrophonePermission,
  };
}
