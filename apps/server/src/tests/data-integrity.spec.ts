import { PersistenceService } from '../modules/persistence/persistence.service';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '@baffa/engine';
import { MatchService } from '../modules/match/match.service';

describe('BAFFA Data Integrity, ACID Transactions & Idempotent Match Finalizer', () => {
  it('Idempotent match finalizer: multiple finalize calls never create duplicate records or stats', async () => {
    // Mock Prisma with transaction support
    let matchWrites = 0;
    let profileUpdates = 0;

    const mockPrisma: any = {
      $transaction: async (fn: any) => {
        return fn({
          match: {
            findUnique: async () => null,
            upsert: async () => { matchWrites++; },
          },
          matchParticipant: {
            upsert: async () => {},
          },
          round: {
            create: async () => {},
          },
          profile: {
            findUnique: async () => ({ currentStreak: 2, bestStreak: 4 }),
            create: async () => ({ currentStreak: 0, bestStreak: 0 }),
            update: async () => { profileUpdates++; },
          },
        });
      },
    };

    const matchService = new MatchService(mockPrisma, new PersistenceService());

    const engine = new DominoGameEngine({
      matchId: 'match-idempotency-test-1',
      roomId: 'room-101',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'user-ahmed', username: 'Ahmed', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'user-mohamed', username: 'Mohamed', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'user-sayed', username: 'Sayed', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'user-tarek', username: 'Tarek', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();

    // First call
    const res1 = await matchService.finalizeMatch(engine);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(matchWrites, 1);
    assert.strictEqual(profileUpdates, 4);

    // Second call (Idempotent retry)
    const res2 = await matchService.finalizeMatch(engine);
    assert.strictEqual(res2.success, true);
    // Writes must not increment!
    assert.strictEqual(matchWrites, 1);
    assert.strictEqual(profileUpdates, 4);
  });

  it('Match history never exposes private player hands', async () => {
    const mockPrisma: any = {
      match: {
        count: async () => 1,
        findMany: async () => [
          {
            id: 'match-private-check',
            roomId: 'room-1',
            targetScore: 101,
            winningTeam: 1,
            team1Score: 105,
            team2Score: 40,
            durationSeconds: 240,
            startedAt: new Date(),
            endedAt: new Date(),
            participants: [
              { userId: 'u1', seat: 0, team: 1, isBot: false, pipsScored: 105, user: { displayName: 'P1', avatarUrl: '1' } },
              { userId: 'u2', seat: 1, team: 2, isBot: false, pipsScored: 40, user: { displayName: 'P2', avatarUrl: '2' } },
              { userId: 'u3', seat: 2, team: 1, isBot: false, pipsScored: 105, user: { displayName: 'P3', avatarUrl: '3' } },
              { userId: 'u4', seat: 3, team: 2, isBot: false, pipsScored: 40, user: { displayName: 'P4', avatarUrl: '4' } },
            ],
            rounds: [],
          },
        ],
      },
    };

    const matchService = new MatchService(mockPrisma, new PersistenceService());
    const history = await matchService.getPaginatedHistory();

    assert.strictEqual(history.matches.length, 1);
    const match = history.matches[0];

    // Verify no private cards are in the payload
    assert.strictEqual((match as any).hands, undefined);
    assert.strictEqual((match as any).unplayedTiles, undefined);
    assert.strictEqual(match.participants[0].userId, 'u1');
  });

  it('Head-to-head statistics counts only completed matches and never double counts', async () => {
    const mockPrisma: any = {
      user: {
        findUnique: async ({ where }: any) => ({
          id: where.id,
          username: where.id,
          displayName: `User ${where.id}`,
          avatarUrl: '1',
        }),
      },
      match: {
        findMany: async () => [
          {
            id: 'shared-m1',
            targetScore: 101,
            winningTeam: 1,
            team1Score: 102,
            team2Score: 60,
            durationSeconds: 200,
            startedAt: new Date(),
            participants: [
              { userId: 'user-A', team: 1, seat: 0, isBot: false, pipsScored: 102 },
              { userId: 'user-B', team: 2, seat: 1, isBot: false, pipsScored: 60 },
            ],
            rounds: [{ winningTeam: 1 }, { winningTeam: 1 }],
          },
        ],
      },
    };

    const matchService = new MatchService(mockPrisma, new PersistenceService());
    const h2h = await matchService.getHeadToHead('user-A', 'user-B');

    assert.ok(h2h);
    assert.strictEqual(h2h.totalMatches, 1);
    assert.strictEqual(h2h.user1Wins, 1);
    assert.strictEqual(h2h.user2Wins, 0);
  });

  it('Play Again creates a completely fresh match state without carryover', () => {
    const engine1 = new DominoGameEngine({
      matchId: 'match-1',
      roomId: 'room-rematch',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine1.startMatch();
    // Simulate some round progression and score
    engine1.penalizeCheating('judge-1', 1, 'Cheating');
    assert.ok(engine1.getTeamScores().team1 > 0 || engine1.getTeamScores().team2 > 0);

    // Now start a fresh rematch
    const engine2 = new DominoGameEngine({
      matchId: 'match-2-fresh-rematch',
      roomId: 'room-rematch',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine2.startMatch();
    assert.strictEqual(engine2.getRoundNumber(), 1);
    assert.strictEqual(engine2.getTeamScores().team1, 0);
    assert.strictEqual(engine2.getTeamScores().team2, 0);
    assert.strictEqual(engine2.getSanitizedState(0).chain.tiles.length, 0);
    assert.strictEqual(engine2.getStatus(), 'PLAYING');
    assert.strictEqual(engine2.getRawHands()[0].length, 7);
    assert.strictEqual(engine2.getRawHands()[1].length, 7);
    assert.strictEqual(engine2.getRawHands()[2].length, 7);
    assert.strictEqual(engine2.getRawHands()[3].length, 7);
  });
});
