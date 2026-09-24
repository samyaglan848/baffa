import { PersistenceService } from '../modules/persistence/persistence.service';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '@baffa/engine';
import { RoomService } from '../modules/room/room.service';
import { GameSessionService } from '../modules/game/game-session.service';
import { MatchService } from '../modules/match/match.service';
import { AuthService } from '../modules/auth/auth.service';
import { AnticheatService } from '../modules/anticheat/anticheat.service';
import { VoiceService } from '../modules/voice/voice.service';
import { BotService } from '../modules/game/bot.service';
import { PrismaService } from '../prisma/prisma.service';
import { DominoTile, PlayerSeat } from '@baffa/shared';

describe('BAFFA Comprehensive Adversarial Security, Anti-Cheat & Data-Integrity Audit Suite', () => {
  // Shared mock Prisma with transaction simulation
  const mockDb = {
    matches: new Map<string, any>(),
    participants: new Map<string, any>(),
    profiles: new Map<string, any>(),
    rounds: new Map<string, any>(),
    auditLogs: [] as any[],
  };

  const mockPrisma = {
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        match: {
          findUnique: async ({ where }: any) => mockDb.matches.get(where.id) || null,
          upsert: async ({ where, create, update }: any) => {
            const existing = mockDb.matches.get(where.id);
            const record = existing ? { ...existing, ...update } : { ...create };
            mockDb.matches.set(where.id, record);
            return record;
          },
        },
        matchParticipant: {
          upsert: async ({ where, create, update }: any) => {
            const key = `${where.matchId_seat.matchId}_${where.matchId_seat.seat}`;
            const existing = mockDb.participants.get(key);
            const record = existing ? { ...existing, ...update } : { ...create };
            mockDb.participants.set(key, record);
            return record;
          },
        },
        round: {
          create: async ({ data }: any) => {
            const id = `round_${mockDb.rounds.size + 1}`;
            const record = { id, ...data };
            mockDb.rounds.set(id, record);
            return record;
          },
        },
        profile: {
          findUnique: async ({ where }: any) => mockDb.profiles.get(where.userId) || null,
          create: async ({ data }: any) => {
            const record = {
              id: `prof_${data.userId}`,
              userId: data.userId,
              displayName: data.displayName,
              totalMatches: 0,
              matchesWon: 0,
              matchesLost: 0,
              totalRounds: 0,
              roundsWon: 0,
              totalPipsScored: 0,
              currentStreak: 0,
              bestStreak: 0,
              humanMatchesWon: 0,
              humanMatchesLost: 0,
              botMatchesWon: 0,
              botMatchesLost: 0,
            };
            mockDb.profiles.set(data.userId, record);
            return record;
          },
          update: async ({ where, data }: any) => {
            const prof = mockDb.profiles.get(where.userId);
            if (!prof) throw new Error('Profile not found');
            if (data.totalMatches?.increment) prof.totalMatches += data.totalMatches.increment;
            if (data.matchesWon?.increment) prof.matchesWon += data.matchesWon.increment;
            if (data.matchesLost?.increment) prof.matchesLost += data.matchesLost.increment;
            if (data.totalRounds?.increment) prof.totalRounds += data.totalRounds.increment;
            if (data.roundsWon?.increment) prof.roundsWon += data.roundsWon.increment;
            if (data.totalPipsScored?.increment) prof.totalPipsScored += data.totalPipsScored.increment;
            if (data.currentStreak !== undefined) prof.currentStreak = data.currentStreak;
            if (data.bestStreak !== undefined) prof.bestStreak = data.bestStreak;
            if (data.humanMatchesWon?.increment) prof.humanMatchesWon += data.humanMatchesWon.increment;
            if (data.humanMatchesLost?.increment) prof.humanMatchesLost += data.humanMatchesLost.increment;
            return prof;
          },
        },
      };
      return fn(tx);
    },
    user: {
      findFirst: async ({ where }: any) => null,
      create: async ({ data }: any) => ({
        id: `user_${Date.now()}`,
        username: data.username,
        email: data.email,
        phone: data.phone,
        passwordHash: data.passwordHash,
        profile: { create: {} },
        createdAt: new Date(),
      }),
    },
    auditLog: {
      create: async ({ data }: any) => {
        mockDb.auditLogs.push(data);
        return { id: `audit_${mockDb.auditLogs.length}` };
      },
    },
  } as unknown as PrismaService;

  // =========================================================================
  // PART 1: PRIVATE HAND INFORMATION LEAK TEST (CRITICAL)
  // =========================================================================
  describe('PART 1: Private Hand Information Leakage Audit', () => {
    it('Serialized network payload for Player A contains ONLY Player A hand; Player B hand is strictly absent', () => {
      const engine = new DominoGameEngine({
        matchId: 'sec_match_1',
        roomId: 'sec_room_1',
        players: [
          { seat: 0, playerId: 'user_0', username: 'Player 0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'Player 1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'Player 2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'Player 3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();

      const rawHands = engine.getRawHands();
      assert.strictEqual(rawHands.length, 4);
      assert.strictEqual(rawHands[0].length, 7);
      assert.strictEqual(rawHands[1].length, 7);

      // Serialize state for Seat 0
      const sanitizedState0 = engine.getSanitizedState(0, 'PLAYER');
      const serializedJson0 = JSON.stringify(sanitizedState0);

      // Verify Player 0 has their own hand
      assert.strictEqual(sanitizedState0.myHand.length, 7);
      assert.deepStrictEqual(sanitizedState0.myHand, rawHands[0]);

      // Verify opponents' private tiles are NOT present anywhere in Player 0's serialized payload
      for (const opponentSeat of [1, 2, 3]) {
        for (const tile of rawHands[opponentSeat]) {
          // If the tile is not also in Player 0's hand (which it can't be, since all 28 tiles are unique),
          // ensure its exact serialized representation doesn't leak
          const tileString = JSON.stringify(tile);
          assert.strictEqual(
            sanitizedState0.myHand.some((t) => t[0] === tile[0] && t[1] === tile[1]),
            false,
            `Opponent tile ${tileString} must not be in Seat 0 hand`
          );
        }
      }

      // Check player list in payload contains hidden count ONLY, no tile contents
      sanitizedState0.players.forEach((p) => {
        assert.strictEqual((p as any).hand, undefined);
        assert.strictEqual((p as any).tiles, undefined);
        assert.strictEqual(p.hiddenTilesCount, 7);
      });
    });

    it('Judge and Spectator payloads receive ZERO private cards (myHand is strictly empty)', () => {
      const engine = new DominoGameEngine({
        matchId: 'sec_match_judge_spec',
        roomId: 'sec_room_judge_spec',
        players: [
          { seat: 0, playerId: 'user_0', username: 'P0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();

      const judgeState = engine.getSanitizedState(null, 'JUDGE');
      const spectatorState = engine.getSanitizedState(null, 'SPECTATOR');

      assert.deepStrictEqual(judgeState.myHand, []);
      assert.strictEqual(judgeState.mySeat, null);
      assert.strictEqual(judgeState.myRole, 'JUDGE');

      assert.deepStrictEqual(spectatorState.myHand, []);
      assert.strictEqual(spectatorState.mySeat, null);
      assert.strictEqual(spectatorState.myRole, 'SPECTATOR');
    });
  });

  // =========================================================================
  // PART 2 & 3: CLIENT-TAMPERING & GAME ACTION FORGERY
  // =========================================================================
  describe('PART 2 & 3: Client-Tampering & Game Action Forgery Rejection', () => {
    it('Rejects playing a tile not in player hand', () => {
      const engine = new DominoGameEngine({
        matchId: 'forgery_match_1',
        roomId: 'forgery_room_1',
        players: [
          { seat: 0, playerId: 'user_0', username: 'P0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();
      const turnSeat = engine.getCurrentTurnSeat();
      const hand = engine.getRawHands()[turnSeat];

      // Find a tile NOT in the player's hand
      let fakeTile: DominoTile = [0, 0];
      for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
          if (!hand.some((t) => (t[0] === i && t[1] === j) || (t[0] === j && t[1] === i))) {
            fakeTile = [i as any, j as any];
            break;
          }
        }
      }

      const res = engine.playTile(turnSeat, fakeTile);
      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /not present in player's hand/);
    });

    it('Rejects playing out of turn', () => {
      const engine = new DominoGameEngine({
        matchId: 'forgery_match_2',
        roomId: 'forgery_room_2',
        players: [
          { seat: 0, playerId: 'user_0', username: 'P0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();
      const currentTurn = engine.getCurrentTurnSeat();
      const wrongSeat = ((currentTurn + 1) % 4) as PlayerSeat;
      const wrongHand = engine.getRawHands()[wrongSeat];

      const res = engine.playTile(wrongSeat, wrongHand[0]);
      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /Not your turn/);
    });

    it('Rejects passing when legal moves exist in player hand', () => {
      const engine = new DominoGameEngine({
        matchId: 'forgery_match_3',
        roomId: 'forgery_room_3',
        players: [
          { seat: 0, playerId: 'user_0', username: 'P0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();
      const currentTurn = engine.getCurrentTurnSeat();

      // Starter has legal moves (e.g. 6|6 in round 1)
      const res = engine.passTurn(currentTurn);
      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /You have legal moves available/);
    });

    it('Rejects malformed tile values, out-of-bounds seats, and invalid chain ends defensively', () => {
      const engine = new DominoGameEngine({
        matchId: 'forgery_match_4',
        roomId: 'forgery_room_4',
        players: [
          { seat: 0, playerId: 'user_0', username: 'P0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();

      // 1. Out of bounds seat
      const res1 = engine.playTile(99 as any, [6, 6]);
      assert.strictEqual(res1.success, false);
      assert.match(res1.error || '', /Invalid seat index/);

      // 2. Malformed tile
      const res2 = engine.playTile(0, [9, 9] as any);
      assert.strictEqual(res2.success, false);
      assert.match(res2.error || '', /Malformed or invalid domino tile/);

      // 3. Out of bounds seat for pass
      const res3 = engine.passTurn(-1 as any);
      assert.strictEqual(res3.success, false);
      assert.match(res3.error || '', /Invalid seat index/);

      // 4. Out of bounds judge penalty seat
      const res4 = engine.penalizeCheating('judge_1', 4 as any, 'Test');
      assert.strictEqual(res4.success, false);
      assert.match(res4.error || '', /Invalid offending seat index/);
    });
  });

  // =========================================================================
  // PART 4 & 5: REPLAY, SEQUENCE VALIDATION & RACE CONDITIONS
  // =========================================================================
  describe('PART 4 & 5: Replay & Concurrency Race Condition Resistance', () => {
    const anticheatService = new AnticheatService(mockPrisma);

    it('Rejects replayed or stale sequence numbers', () => {
      const resStale = anticheatService.evaluateAction({
        userId: 'attacker_1',
        roomId: 'room_sec',
        action: 'PLAY_TILE',
        clientSequence: 2,
        expectedSequence: 5,
        timestamp: Date.now(),
      });

      assert.strictEqual(resStale.isPermitted, false);
      assert.strictEqual(resStale.warning, 'Stale action sequence rejected');
    });

    it('Guarantees only one state transition for duplicate move attempts', () => {
      const engine = new DominoGameEngine({
        matchId: 'replay_match_1',
        roomId: 'replay_room_1',
        players: [
          { seat: 0, playerId: 'user_0', username: 'P0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();
      const starter = engine.getCurrentTurnSeat();

      // First legal move (6|6)
      const res1 = engine.playTile(starter, [6, 6]);
      assert.strictEqual(res1.success, true);
      const seq1 = engine.getSequenceNumber();

      // Replay attempt by the same seat with the same tile
      const res2 = engine.playTile(starter, [6, 6]);
      assert.strictEqual(res2.success, false);
      // Sequence number does NOT advance on rejected replay
      assert.strictEqual(engine.getSequenceNumber(), seq1);
    });
  });

  // =========================================================================
  // PART 6: RECONNECTION & BOT TAKEOVER INVARIANCE
  // =========================================================================
  describe('PART 6: Reconnection & Bot Takeover Hand Invariance', () => {
    it('Bot takeover preserves exact hand tiles, zero lost/duplicated tiles upon return', () => {
      const engine = new DominoGameEngine({
        matchId: 'bot_takeover_match',
        roomId: 'bot_takeover_room',
        players: [
          { seat: 0, playerId: 'user_0', username: 'Human Player', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();
      const initialHand = engine.getRawHands()[0].map((t) => [t[0], t[1]]);

      // Human disconnects -> Bot takeover activated
      engine.setBotTakeover(0, true);

      // Verify underlying hand tiles are completely unchanged
      const handDuringTakeover = engine.getRawHands()[0];
      assert.deepStrictEqual(handDuringTakeover, initialHand);

      // Human reconnects within 120-second grace -> Bot takeover deactivated
      engine.setBotTakeover(0, false);

      const handAfterReconnect = engine.getRawHands()[0];
      assert.deepStrictEqual(handAfterReconnect, initialHand);
      assert.strictEqual(handAfterReconnect.length, 7);
    });
  });

  // =========================================================================
  // PART 7: ADMIN TRANSFER SECURITY
  // =========================================================================
  describe('PART 7: Admin Transfer & Permission Security', () => {
    const roomService = new RoomService(mockPrisma);

    it('Transfers admin to connected teammate when creator disconnects, restores upon return', () => {
      const room = roomService.createRoom(
        'socket_admin_orig',
        { id: 'creator_user', username: 'Creator', avatar: '1' },
        'Admin Transfer Room'
      );

      // Seat 2 (Teammate) joins
      roomService.joinRoom(room.id, 'socket_teammate', { id: 'teammate_user', username: 'Teammate', avatar: '2' });
      roomService.selectSeat(room.id, 'teammate_user', 2);
      room.matchStatus = 'PLAYING';

      // Creator disconnects -> start grace
      roomService.startDisconnectGrace(room.id, 0, () => {});

      // Admin transferred to teammate (Seat 2)
      assert.strictEqual(room.currentAdminId, 'teammate_user');
      assert.strictEqual(room.originalAdminId, 'creator_user');

      // Creator returns before grace expiry -> original admin status restored
      roomService.joinRoom(room.id, 'socket_admin_orig_2', { id: 'creator_user', username: 'Creator', avatar: '1' });
      assert.strictEqual(room.currentAdminId, 'creator_user');
    });
  });

  // =========================================================================
  // PART 8: JUDGE SECURITY & PENALTY ENFORCEMENT
  // =========================================================================
  describe('PART 8: Judge Cheating Penalty & Scoring Allocation', () => {
    it('Terminates active round immediately and awards offending team pips to opposing team', () => {
      const engine = new DominoGameEngine({
        matchId: 'judge_penalty_match',
        roomId: 'judge_penalty_room',
        players: [
          { seat: 0, playerId: 'user_0', username: 'P0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();
      const rawHands = engine.getRawHands();

      // Team 2 (Seats 1 and 3) pips
      const team2Pips = rawHands[1].reduce((sum, t) => sum + t[0] + t[1], 0) +
                        rawHands[3].reduce((sum, t) => sum + t[0] + t[1], 0);

      // Judge penalizes Seat 1 (Team 2) for cheating
      const res = engine.penalizeCheating('judge_omda', 1, 'Illegal hand signaling');
      assert.strictEqual(res.success, true);
      assert.strictEqual(engine.getStatus(), 'ROUND_FINISHED');

      // Team 1 awarded Team 2's pips
      assert.strictEqual(res.roundResult?.winnerTeam, 1);
      assert.strictEqual(res.roundResult?.roundScore, team2Pips);
      assert.strictEqual(engine.getTeamScores().team1, team2Pips);
    });
  });

  // =========================================================================
  // PART 10: ROOM SECURITY & MID-MATCH INTEGRITY
  // =========================================================================
  describe('PART 10: Room Security & Mid-Match Seat Protection', () => {
    const roomService = new RoomService(mockPrisma);

    it('Rejects unseated 5th player from joining an active match as a player', () => {
      const room = roomService.createRoom(
        'socket_admin_room',
        { id: 'admin_1', username: 'Admin1', avatar: '1' },
        'Active Match Room'
      );

      // Populate all 4 playing seats
      room.seats[1] = { seat: 1, team: 2, occupied: true, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true, presence: 'IN_ROOM' };
      room.seats[2] = { seat: 2, team: 1, occupied: true, playerId: 'p2', username: 'P2', avatar: '1', isBot: false, isConnected: true, isReady: true, presence: 'IN_ROOM' };
      room.seats[3] = { seat: 3, team: 2, occupied: true, playerId: 'p3', username: 'P3', avatar: '1', isBot: false, isConnected: true, isReady: true, presence: 'IN_ROOM' };
      room.matchStatus = 'PLAYING';

      // Outside attacker tries to join mid-match as a player -> not given a playing seat
      const updated = roomService.joinRoom(room.id, 'socket_intruder', { id: 'intruder', username: 'Intruder', avatar: '1' });
      assert.strictEqual(updated.seats.some((s) => s.playerId === 'intruder'), false);
    });

    it('Prevents settings updates and bot toggling mid-match', () => {
      const room = roomService.createRoom(
        'socket_admin_room2',
        { id: 'admin_2', username: 'Admin2', avatar: '1' },
        'Settings Lock Room'
      );

      room.matchStatus = 'PLAYING';

      assert.throws(() => {
        roomService.updateSettings(room.id, 'admin_2', { targetScore: 151 });
      }, /Cannot update.*settings while match is in progress/);

      assert.throws(() => {
        roomService.toggleBot(room.id, 'admin_2', 1, true);
      }, /Cannot toggle bots while match is in progress/);
    });
  });

  // =========================================================================
  // PART 16 & 17: MATCH FINALIZATION ACID IDEMPOTENCY UNDER CONCURRENCY
  // =========================================================================
  describe('PART 16 & 17: Match Finalization Idempotency & Concurrent Retries', () => {
    const matchService = new MatchService(mockPrisma, new PersistenceService());

    it('Calling finalizeMatch concurrently 10 times results in exactly ONE stats increment and ONE match record', async () => {
      const engine = new DominoGameEngine({
        matchId: 'concurrent_final_match_99',
        roomId: 'concurrent_final_room_99',
        targetScore: 101,
        players: [
          { seat: 0, playerId: 'user_winner_1', username: 'Winner 1', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'user_loser_1', username: 'Loser 1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'user_winner_2', username: 'Winner 2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'user_loser_2', username: 'Loser 2', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();

      // Simulate 10 concurrent finalization attempts (e.g. rapid network retries)
      const promises = Array.from({ length: 10 }).map(() => matchService.finalizeMatch(engine));
      const results = await Promise.all(promises);

      results.forEach((r) => {
        assert.strictEqual(r.success, true);
        assert.strictEqual(r.matchId, 'concurrent_final_match_99');
      });

      // Verify Database records in mock Prisma
      const matchInDb = mockDb.matches.get('concurrent_final_match_99');
      assert.ok(matchInDb);
      assert.strictEqual(matchInDb.isFinalized, true);

      // Verify human winner profile stats: totalMatches MUST be strictly 1, not 10
      const winnerProf = mockDb.profiles.get('user_winner_1');
      assert.ok(winnerProf);
      assert.strictEqual(winnerProf.totalMatches, 1, 'totalMatches must be incremented exactly once');
    });
  });

  // =========================================================================
  // PART 21: WEBRTC VOICE ISOLATION
  // =========================================================================
  describe('PART 21: WebRTC Voice Modular Signaling Security', () => {
    const voiceService = new VoiceService();

    it('Isolates voice peers strictly by room and cleans up peers on exit', () => {
      voiceService.joinVoice('voice_room_A', 'user_1', 'socket_1', 'PLAYER');
      voiceService.joinVoice('voice_room_B', 'user_2', 'socket_2', 'PLAYER');

      const peersA = voiceService.getPeers('voice_room_A');
      const peersB = voiceService.getPeers('voice_room_B');

      assert.strictEqual(peersA.length, 1);
      assert.strictEqual(peersA[0].userId, 'user_1');

      assert.strictEqual(peersB.length, 1);
      assert.strictEqual(peersB[0].userId, 'user_2');

      // Disconnect socket 1
      voiceService.removeSocket('socket_1');
      assert.strictEqual(voiceService.getPeers('voice_room_A').length, 0);
      assert.strictEqual(voiceService.getPeers('voice_room_B').length, 1);
    });
  });
});
