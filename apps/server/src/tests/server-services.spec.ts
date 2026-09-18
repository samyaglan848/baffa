import { PersistenceService } from '../modules/persistence/persistence.service';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AuthService } from '../modules/auth/auth.service';
import { VerificationService } from '../modules/auth/verification.service';
import { AnticheatService } from '../modules/anticheat/anticheat.service';
import { RoomService } from '../modules/room/room.service';
import { VoiceService } from '../modules/voice/voice.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BAFFA Server Services Test Suite (Auth, Anti-Cheat, Multi-Role Room, Voice)', () => {
  const mockPrisma = {
    user: {
      findFirst: async () => null,
      create: async (data: any) => ({
        id: 'mock_user_1',
        username: data.data.username,
        email: data.data.email,
        phone: data.data.phone,
        passwordHash: data.data.passwordHash,
        avatarUrl: data.data.avatarUrl,
        createdAt: new Date(),
        profile: { totalMatches: 0, matchesWon: 0, totalRounds: 0, roundsWon: 0, totalPipsScored: 0 },
      }),
    },
    auditLog: {
      create: async () => ({ id: 'mock_audit_1' }),
    },
  } as unknown as PrismaService;

  describe('1. AuthService Security & Validation', () => {
    const verificationService = new VerificationService(mockPrisma);
    const authService = new AuthService(mockPrisma, verificationService, new PersistenceService());

    it('Registers user, hashes password, and issues valid JWT access & refresh tokens', async () => {
      const reg = await authService.register({
        username: 'SamyTest',
        password: 'superSecretPassword123',
        email: 'samy@baffa.eg',
      });

      assert.strictEqual(reg.user.username, 'SamyTest');
      assert.strictEqual(reg.user.normalizedUsername, 'samytest');
      assert.strictEqual(reg.user.email, 'samy@baffa.eg');
      assert.ok(reg.tokens.accessToken.length > 20);
      assert.ok(reg.tokens.refreshToken.length > 20);

      // Verify token validation
      const payload = authService.validateToken(reg.tokens.accessToken);
      assert.ok(payload);
      assert.strictEqual(payload?.username, 'SamyTest');
    });

    it('Refreshes JWT token with rotation', async () => {
      const reg = await authService.register({
        username: 'RefresherUser',
        password: 'password123',
      });

      const newTokens = await authService.refreshToken(reg.tokens.refreshToken);
      assert.ok(newTokens.accessToken);
      assert.ok(newTokens.refreshToken);
    });
  });

  describe('2. AnticheatService Cumulative Risk Model', () => {
    const anticheatService = new AnticheatService(mockPrisma);

    it('Weak timing signals (<200ms) accumulate minor weight without automatic banning', () => {
      const res = anticheatService.evaluateAction({
        userId: 'fast_player',
        roomId: 'room_1',
        action: 'PLAY_TILE',
        timestamp: Date.now(),
      });

      assert.strictEqual(res.isPermitted, true);
    });

    it('Rejects stale/replayed sequence numbers', () => {
      const res = anticheatService.evaluateAction({
        userId: 'stale_player',
        roomId: 'room_1',
        action: 'PLAY_TILE',
        clientSequence: 2,
        expectedSequence: 5,
        timestamp: Date.now(),
      });

      assert.strictEqual(res.isPermitted, false);
      assert.strictEqual(res.warning, 'Stale action sequence rejected');
    });
  });

  describe('3. Multi-Role Room Management (Max 1 Judge, Max 1 Spectator, Admin Transfer)', () => {
    const roomService = new RoomService(mockPrisma);

    it('Creates room with Admin in Seat 0 and enables Judge/Spectator roles', () => {
      const room = roomService.createRoom(
        'socket_admin',
        { id: 'admin_user', username: 'AdminPlayer', avatar: '1' },
        'Cairo Domino Club'
      );

      assert.strictEqual(room.currentAdminId, 'admin_user');
      assert.strictEqual(room.originalAdminId, 'admin_user');
      assert.strictEqual(room.seats[0].occupied, true);
      assert.strictEqual(room.seats[0].playerId, 'admin_user');
    });

    it('Enforces Max 1 Judge and Max 1 Spectator limit per room', () => {
      const room = roomService.createRoom(
        'socket_admin_2',
        { id: 'admin_2', username: 'Admin2', avatar: '1' },
        'Championship Room'
      );

      // Join 1st Judge
      roomService.joinAsJudge(room.id, 'socket_judge_1', { id: 'judge_1', username: 'Judge Omda', avatar: '2' });
      assert.ok(room.judge);
      assert.strictEqual(room.judge?.userId, 'judge_1');

      // Attempt 2nd Judge -> must be rejected
      assert.throws(() => {
        roomService.joinAsJudge(room.id, 'socket_judge_2', { id: 'judge_2', username: 'Judge 2', avatar: '3' });
      }, /A Judge is already presiding/);

      // Join 1st Spectator
      roomService.joinAsSpectator(room.id, 'socket_spec_1', { id: 'spec_1', username: 'Fan 1', avatar: '4' });
      assert.ok(room.spectator);
      assert.strictEqual(room.spectator?.userId, 'spec_1');

      // Attempt 2nd Spectator -> must be rejected
      assert.throws(() => {
        roomService.joinAsSpectator(room.id, 'socket_spec_2', { id: 'spec_2', username: 'Fan 2', avatar: '5' });
      }, /A Spectator is already watching/);
    });
  });

  describe('4. WebRTC Modular Voice Signaling Service', () => {
    const voiceService = new VoiceService();

    it('Allows peers to join voice, track mute state, and leave gracefully', () => {
      const roomVoice = voiceService.joinVoice('voice_room_1', 'user_a', 'socket_a', 'PLAYER');
      assert.strictEqual(roomVoice.peers.length, 1);
      assert.strictEqual(roomVoice.joinedPeer.isMuted, false);

      voiceService.setMute('voice_room_1', 'user_a', true);
      const peersAfterMute = voiceService.getPeers('voice_room_1');
      assert.strictEqual(peersAfterMute[0].isMuted, true);

      const left = voiceService.leaveVoice('voice_room_1', 'user_a');
      assert.strictEqual(left?.userId, 'user_a');
      assert.strictEqual(voiceService.getPeers('voice_room_1').length, 0);
    });
  });
});
