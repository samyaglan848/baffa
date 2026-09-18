import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@baffa/shared';

export interface VoicePeer {
  userId: string;
  socketId: string;
  role: UserRole;
  isMuted: boolean;
  joinedAt: number;
}

export interface VoiceRoomSession {
  roomId: string;
  peers: Map<string, VoicePeer>; // userId -> VoicePeer
  isRoomVoiceEnabled: boolean;
}

/**
 * Modular Voice Signaling Service.
 * Decoupled from the Domino Game Engine to allow future SFU migration without touching game logic.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private voiceRooms: Map<string, VoiceRoomSession> = new Map();

  public getOrCreateVoiceRoom(roomId: string): VoiceRoomSession {
    let session = this.voiceRooms.get(roomId);
    if (!session) {
      session = {
        roomId,
        peers: new Map(),
        isRoomVoiceEnabled: true,
      };
      this.voiceRooms.set(roomId, session);
    }
    return session;
  }

  public joinVoice(
    roomId: string,
    userId: string,
    socketId: string,
    role: UserRole
  ): { peers: VoicePeer[]; joinedPeer: VoicePeer } {
    const session = this.getOrCreateVoiceRoom(roomId);
    const peer: VoicePeer = {
      userId,
      socketId,
      role,
      isMuted: false,
      joinedAt: Date.now(),
    };

    session.peers.set(userId, peer);
    this.logger.log(`User ${userId} (${role}) joined voice in room ${roomId}`);

    return {
      peers: Array.from(session.peers.values()),
      joinedPeer: peer,
    };
  }

  public leaveVoice(roomId: string, userId: string): VoicePeer | null {
    const session = this.voiceRooms.get(roomId);
    if (!session) return null;

    const peer = session.peers.get(userId);
    if (peer) {
      session.peers.delete(userId);
      this.logger.log(`User ${userId} left voice in room ${roomId}`);
      if (session.peers.size === 0) {
        this.voiceRooms.delete(roomId);
      }
      return peer;
    }
    return null;
  }

  public getPeers(roomId: string): VoicePeer[] {
    const session = this.voiceRooms.get(roomId);
    return session ? Array.from(session.peers.values()) : [];
  }

  public setMute(roomId: string, userId: string, isMuted: boolean): boolean {
    const session = this.voiceRooms.get(roomId);
    if (!session) return false;

    const peer = session.peers.get(userId);
    if (peer) {
      peer.isMuted = isMuted;
      return true;
    }
    return false;
  }

  public removeSocket(socketId: string): { roomId: string; userId: string } | null {
    for (const [roomId, session] of this.voiceRooms.entries()) {
      for (const [userId, peer] of session.peers.entries()) {
        if (peer.socketId === socketId) {
          session.peers.delete(userId);
          if (session.peers.size === 0) {
            this.voiceRooms.delete(roomId);
          }
          return { roomId, userId };
        }
      }
    }
    return null;
  }
}
