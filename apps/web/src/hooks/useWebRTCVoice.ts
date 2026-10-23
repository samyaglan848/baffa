'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@baffa/shared';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
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
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

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

  // Create Peer Connection with deterministic track attachment & candidate handling
  const createPeerConnection = useCallback(
    (targetUserId: string) => {
      if (!socket || !roomId) return null;

      const pc = new RTCPeerConnection(RTC_CONFIG);

      // Attach local stream if already captured
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
            signal: { candidate: event.candidate.toJSON() },
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        if (stream) {
          attachAnalyser(stream, targetUserId);

          let remoteAudio = remoteAudiosRef.current.get(targetUserId);
          if (!remoteAudio) {
            remoteAudio = new Audio();
            remoteAudiosRef.current.set(targetUserId, remoteAudio);
          }

          remoteAudio.srcObject = stream;
          remoteAudio.autoplay = true;
          remoteAudio.volume = 1.0;
          remoteAudio.setAttribute('playsinline', 'true');
          remoteAudio.setAttribute('webkit-playsinline', 'true');

          const play = () => {
            remoteAudio?.play().catch((err: any) => {
              if (err?.name === 'NotAllowedError') {
                const unlock = () => {
                  remoteAudio?.play().catch(() => {});
                  window.removeEventListener('click', unlock);
                  window.removeEventListener('touchstart', unlock);
                };
                window.addEventListener('click', unlock, { once: true });
                window.addEventListener('touchstart', unlock, { once: true });
              }
            });
          };
          play();
        }
      };

      peerConnectionsRef.current.set(targetUserId, pc);
      return pc;
    },
    [socket, roomId, attachAnalyser]
  );

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
      // 2. Second attempt: Basic audio fallback
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

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        // Attach or replace audio track in all active peer connections AND renegotiate if needed!
        peerConnectionsRef.current.forEach(async (pc, targetUserId) => {
          const senders = pc.getSenders();
          const existingSender = senders.find((s) => s.track?.kind === 'audio');

          if (existingSender) {
            existingSender.replaceTrack(audioTrack).catch(() => {});
          } else {
            pc.addTrack(audioTrack, stream!);
            // Renegotiate with remote peer so they receive the track
            try {
              const offer = await pc.createOffer({ offerToReceiveAudio: true });
              await pc.setLocalDescription(offer);
              if (socket && roomId) {
                socket.emit(ClientEvents.VOICE_SIGNAL, {
                  roomId,
                  targetUserId,
                  signal: { sdp: pc.localDescription },
                });
              }
            } catch (renegoErr) {
              console.warn(`[WebRTC] Renegotiation offer failed for ${targetUserId}:`, renegoErr);
            }
          }
        });
      }

      return stream;
    }

    return null;
  }, [enabled, attachAnalyser, currentUserId, socket, roomId]);

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

    // Unpause any remote audios in case browser blocked autoplay
    remoteAudiosRef.current.forEach((audio) => {
      if (audio.paused && audio.srcObject) {
        audio.play().catch(() => {});
      }
    });

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

  // Socket signaling listeners & peer synchronization
  useEffect(() => {
    if (!socket || !roomId) return;

    // Proactively sync mute status & request peers on connect/mount
    socket.emit(ClientEvents.VOICE_MUTE, { roomId, isMuted: true });

    const handleSignal = async (data: { fromUserId: string; signal: any }) => {
      const { fromUserId, signal } = data;
      if (!fromUserId || !signal) return;

      let pc = peerConnectionsRef.current.get(fromUserId);
      if (!pc) {
        pc = createPeerConnection(fromUserId) || undefined;
      }
      if (!pc) return;

      try {
        if (signal.sdp) {
          const sdpDesc = new RTCSessionDescription(signal.sdp);
          await pc.setRemoteDescription(sdpDesc);

          // Flush any queued ICE candidates received before remoteDescription was ready
          const queued = iceCandidateQueueRef.current.get(fromUserId) || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch {}
          }
          iceCandidateQueueRef.current.delete(fromUserId);

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
          if (!pc.remoteDescription) {
            // Queue candidate until remote description is set
            const queue = iceCandidateQueueRef.current.get(fromUserId) || [];
            queue.push(signal.candidate);
            iceCandidateQueueRef.current.set(fromUserId, queue);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        }
      } catch (err) {
        console.warn(`[WebRTC] Signaling error with ${fromUserId}:`, err);
      }
    };

    const handlePeersSync = (data: { peers: any[] }) => {
      if (!data?.peers) return;

      const otherPeerIds = data.peers
        .map((p) => p.userId)
        .filter((id) => id && id !== currentUserId);

      setActivePeers(otherPeerIds);

      // Close stale peer connections that left
      for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
        if (!otherPeerIds.includes(peerId)) {
          pc.close();
          peerConnectionsRef.current.delete(peerId);
          remoteAudiosRef.current.get(peerId)?.pause();
          remoteAudiosRef.current.delete(peerId);
          analysersRef.current.delete(peerId);
          iceCandidateQueueRef.current.delete(peerId);
        }
      }

      // Connect with active peers using deterministic initiator (no offer collisions)
      otherPeerIds.forEach(async (targetUserId) => {
        let pc = peerConnectionsRef.current.get(targetUserId);
        if (!pc) {
          pc = createPeerConnection(targetUserId) || undefined;
        }
        if (!pc) return;

        // Deterministic initiator: only peer with smaller ID sends offer to avoid glare
        const isInitiator = currentUserId < targetUserId;
        if (isInitiator && pc.signalingState === 'stable') {
          try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            socket.emit(ClientEvents.VOICE_SIGNAL, {
              roomId,
              targetUserId,
              signal: { sdp: pc.localDescription },
            });
          } catch (err) {
            console.warn(`[WebRTC] Failed to create offer for ${targetUserId}:`, err);
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

      remoteAudiosRef.current.forEach((a) => {
        a.pause();
        a.srcObject = null;
      });
      remoteAudiosRef.current.clear();
      analysersRef.current.clear();
      iceCandidateQueueRef.current.clear();

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
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
