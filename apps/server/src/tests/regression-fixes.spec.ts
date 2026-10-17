import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as jwt from 'jsonwebtoken';
import { DominoTile, PlayerSeat } from '@baffa/shared';
import { DominoGameEngine } from '@baffa/engine';
import { AuthService } from '../modules/auth/auth.service';
import { VerificationService } from '../modules/auth/verification.service';
import { PersistenceService } from '../modules/persistence/persistence.service';
import { RoomService } from '../modules/room/room.service';
import { BotService } from '../modules/game/bot.service';
import { AutoJudgeService } from '../modules/game/auto-judge.service';
import { GameSessionService } from '../modules/game/game-session.service';
import { AnticheatService } from '../modules/anticheat/anticheat.service';
import { MatchService } from '../modules/match/match.service';

/** Prisma stand-in for "database unreachable": every call rejects, like production without Postgres. */
const offlinePrisma: any = new Proxy(
  { isAvailable: false },
  {
    get: (target: any, prop) => {
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined;
      return new Proxy({}, { get: () => async () => { throw new Error('db offline'); } });
    },
  }
);

function b64url(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeHarness(roundTimerSeconds = 20) {
  const persistence = new PersistenceService();
  const roomService = new RoomService(offlinePrisma, persistence);
  const anticheat = new AnticheatService(offlinePrisma);
  const matchService = new MatchService(offlinePrisma, persistence);
  const autoJudge = new AutoJudgeService();
  const session = new GameSessionService(new BotService(), roomService, anticheat, matchService, autoJudge);
  const events: string[] = [];
  session.setCallbacks({
    broadcastStateToRoom: () => events.push('state'),
    emitErrorToPlayer: () => {},
    broadcastBotChat: () => {},
    broadcastStatsUpdated: () => {},
    broadcastNotification: () => events.push('notification'),
  });

  const host = { id: 'user_host_1', username: 'Host', avatar: 'avatar-1' };
  roomService.registerSocket('sock_host', host, 'ADMIN');
  const room = roomService.createRoom('sock_host', host, 'Test', { roundTimerSeconds, targetScore: 101 } as any, 'ADMIN');
  // Four human seats so no bot ever moves on its own during the test.
  const others = [
    { id: 'user_p1', username: 'P1', avatar: 'avatar-2' },
    { id: 'user_p2', username: 'P2', avatar: 'avatar-3' },
    { id: 'user_p3', username: 'P3', avatar: 'avatar-4' },
  ];
  others.forEach((u, i) => {
    roomService.registerSocket(`sock_${i}`, u, 'PLAYER');
    roomService.joinRoom(room.id, `sock_${i}`, u);
  });
  return { persistence, roomService, session, autoJudge, room, events };
}

function findSeatWithIllegalTile(engine: DominoGameEngine, seat: PlayerSeat): DominoTile | null {
  const legal = engine.getLegalMovesForSeat(seat).map((m) => `${m.tile[0]}|${m.tile[1]}`);
  const hand = engine.getRawHands()[seat];
  return hand.find((t) => !legal.includes(`${t[0]}|${t[1]}`)) || null;
}

describe('Regression: authentication cannot be bypassed', () => {
  const persistence = new PersistenceService();
  const auth = new AuthService(offlinePrisma, new VerificationService(offlinePrisma), persistence);

  it('accepts a real signed token and rejects raw user ids, forged and unsigned tokens', async () => {
    const reg = await auth.register(
      { username: 'regression_user', password: 'Secret123!', confirmPassword: 'Secret123!' } as any,
      '10.0.0.1'
    );
    const real = auth.validateToken(reg.tokens.accessToken);
    assert.ok(real && real.sub === reg.user.id);

    // 1. A user's id is visible to everyone in a room — it must not work as a login token.
    assert.strictEqual(auth.validateToken(reg.user.id), null);
    assert.strictEqual(auth.validateToken('user_anything'), null);
    assert.strictEqual(auth.validateToken('guest_whatever'), null);

    // 2. A token with a forged signature must be rejected (was decoded and trusted before).
    const forged = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: reg.user.id, role: 'ADMIN' })}.AAAA`;
    assert.strictEqual(auth.validateToken(forged), null);

    // 3. "alg: none" tokens are rejected.
    const unsigned = jwt.sign({ sub: reg.user.id }, '', { algorithm: 'none' as any });
    assert.strictEqual(auth.validateToken(unsigned), null);

    // 4. A token signed with the old public fallback secret is rejected.
    const oldDefault = jwt.sign({ sub: reg.user.id, username: 'x' }, 'baffa-super-secret-production-key-2026');
    assert.strictEqual(auth.validateToken(oldDefault), null);
  });

  it('guest tokens identify a guest but can never act as a registered account', () => {
    const guestToken = auth.issueGuestToken('guest_abc123xyz', 'ضيف');
    const asGame = auth.validateGameToken(guestToken);
    assert.ok(asGame && asGame.isGuest && asGame.sub === 'guest_abc123xyz');
    assert.strictEqual(auth.validateToken(guestToken), null);
  });
});

describe('Regression: automatic referee does not punish lag or misclicks', () => {
  it('ignores an out-of-turn tile and a tile the player does not hold', () => {
    const { session, roomService, room } = makeHarness();
    const engine = session.startMatch(room.id, 'user_host_1');
    const turn = engine.getCurrentTurnSeat();
    const other = ((turn + 1) % 4) as PlayerSeat;

    // Out of turn: rejected, no warning recorded.
    const anyTile = engine.getRawHands()[other][0];
    const res = session.playTile(room.id, other, anyTile, 'LEFT');
    assert.strictEqual(res.success, false);
    assert.strictEqual(engine.getSanitizedState(null).players[other].warnings || 0, 0);

    // A tile that belongs to someone else: rejected, no warning.
    const notMine = engine.getRawHands()[other][0];
    const res2 = session.playTile(room.id, turn, notMine, 'LEFT');
    assert.strictEqual(res2.success, false);
    assert.strictEqual(engine.getSanitizedState(null).players[turn].warnings || 0, 0);

    session.endSession(room.id);
    roomService.deleteRoom(room.id);
  });

  it('still warns a deliberate illegal play on your own turn (referee behaviour kept)', () => {
    const { session, room } = makeHarness();
    const engine = session.startMatch(room.id, 'user_host_1');
    const turn = engine.getCurrentTurnSeat();
    const illegal = findSeatWithIllegalTile(engine, turn);
    if (!illegal) return; // whole hand happens to be legal — nothing to test this deal
    const res = session.playTile(room.id, turn, illegal, 'LEFT');
    assert.strictEqual(res.success, false);
    assert.strictEqual(engine.getSanitizedState(null).players[turn].warnings, 1);
    session.endSession(room.id);
  });
});

describe('Regression: the match never freezes', () => {
  it('rejects out-of-range turn timers (they made the server auto-play instantly)', () => {
    assert.strictEqual(RoomService.clampTimer(-5), 20);
    assert.strictEqual(RoomService.clampTimer(1e9), 60);
    assert.strictEqual(RoomService.clampTimer('abc'), 20);
    assert.strictEqual(RoomService.clampTimer(1), 5);
    assert.strictEqual(RoomService.clampTimer(30), 30);
  });

  it('auto-plays on turn timeout instead of freezing the seat', async () => {
    const { session, room } = makeHarness(5); // shortest allowed turn time
    const engine = session.startMatch(room.id, 'user_host_1');
    const firstSeat = engine.getCurrentTurnSeat();
    const tilesBefore = engine.getChain().getState().tiles.length;

    // 5s visible time + 1.5s network grace
    await new Promise((r) => setTimeout(r, 7000));

    assert.notStrictEqual(engine.getCurrentTurnSeat(), firstSeat, 'turn must advance after timeout');
    assert.strictEqual(engine.getChain().getState().tiles.length, tilesBefore + 1, 'a tile must have been auto-played');
    session.endSession(room.id);
  });

  it('a second "play again" request does not kill the running match timers', async () => {
    const { session, room } = makeHarness(5);
    const first = session.startRematch(room.id, 'user_host_1', { userId: 'user_host_1', username: 'Host', avatar: 'avatar-1' });
    const second = session.startRematch(room.id, 'user_host_1', { userId: 'user_host_1', username: 'Host', avatar: 'avatar-1' });
    assert.strictEqual(first, second, 'same running match is returned');

    const seat = first.getCurrentTurnSeat();
    await new Promise((r) => setTimeout(r, 7000));
    assert.notStrictEqual(first.getCurrentTurnSeat(), seat, 'timers still running after duplicate request');
    session.endSession(room.id);
  });

  it('rematch never seats the caller over another human player', () => {
    const { session, roomService, room } = makeHarness();
    const humansBefore = room.seats.filter((s) => !s.isBot).map((s) => s.playerId).sort();
    session.startRematch(room.id, 'user_host_1', { userId: 'user_outsider', username: 'Outsider', avatar: 'avatar-1' });
    const humansAfter = roomService.getRoom(room.id)!.seats.filter((s) => !s.isBot).map((s) => s.playerId).sort();
    assert.deepStrictEqual(humansAfter, humansBefore);
    session.endSession(room.id);
  });
});

describe('Regression: players leaving / returning never freeze the table', () => {
  it('a player coming back does not cancel the bot move that is already scheduled', async () => {
    const persistence = new PersistenceService();
    const roomService = new RoomService(offlinePrisma, persistence);
    const session = new GameSessionService(new BotService(), roomService, new AnticheatService(offlinePrisma), new MatchService(offlinePrisma, persistence), new AutoJudgeService());
    session.setCallbacks({ broadcastStateToRoom: () => {}, emitErrorToPlayer: () => {}, broadcastBotChat: () => {}, broadcastStatsUpdated: () => {} });
    const host = { id: 'user_solo_host', username: 'Host', avatar: 'avatar-1' };
    roomService.registerSocket('sock_solo', host, 'ADMIN');
    const room = roomService.createRoom('sock_solo', host, 'Solo', { roundTimerSeconds: 30, targetScore: 101 } as any, 'ADMIN');
    const engine = session.startMatch(room.id, host.id);
    const hostSeat = roomService.getRoom(room.id)!.seats.find((s) => s.playerId === host.id)!.seat;

    // Make sure a bot is on turn (the host plays first if they hold 6|6).
    if (engine.getCurrentTurnSeat() === hostSeat) {
      const move = engine.getLegalMovesForSeat(hostSeat)[0];
      assert.ok(session.playTile(room.id, hostSeat, move.tile, move.validEnds[0]).success);
    }
    const tilesBefore = engine.getChain().getState().tiles.length;

    // Host returns to the tab / reconnects while the bot is "thinking" (~2s).
    session.setBotTakeover(room.id, hostSeat, false);
    await new Promise((r) => setTimeout(r, 2600));

    assert.ok(engine.getChain().getState().tiles.length > tilesBefore || engine.getStatus() !== 'PLAYING',
      'the bot must still play within ~2s instead of waiting for the 30s turn timer');
    session.endSession(room.id);
  });

  it('a player who left a running match gets their own seat back, not the first bot seat', () => {
    const persistence = new PersistenceService();
    const roomService = new RoomService(offlinePrisma, persistence);
    const session = new GameSessionService(new BotService(), roomService, new AnticheatService(offlinePrisma), new MatchService(offlinePrisma, persistence), new AutoJudgeService());
    session.setCallbacks({ broadcastStateToRoom: () => {}, emitErrorToPlayer: () => {}, broadcastBotChat: () => {}, broadcastStatsUpdated: () => {} });
    const host = { id: 'user_seat_host', username: 'Host', avatar: 'avatar-1' };
    const p1 = { id: 'user_seat_p1', username: 'P1', avatar: 'avatar-2' };
    const p2 = { id: 'user_seat_p2', username: 'P2', avatar: 'avatar-3' };
    roomService.registerSocket('sh', host, 'ADMIN');
    const room = roomService.createRoom('sh', host, 'Seats', { targetScore: 101 } as any, 'ADMIN');
    roomService.registerSocket('s1', p1, 'PLAYER');
    roomService.joinRoom(room.id, 's1', p1);
    roomService.registerSocket('s2', p2, 'PLAYER');
    roomService.joinRoom(room.id, 's2', p2);
    roomService.leaveRoom(room.id, 's1'); // empty seat before p2 -> becomes a bot at match start
    session.startMatch(room.id, host.id);

    const p2Seat = roomService.getRoom(room.id)!.seats.find((s) => s.playerId === p2.id)!.seat;
    roomService.leaveRoom(room.id, 's2');
    assert.ok(roomService.getRoom(room.id)!.seats[p2Seat].isBot, 'bot takes over the leaver seat');

    roomService.registerSocket('s2b', p2, 'PLAYER');
    roomService.joinRoom(room.id, 's2b', p2);
    const back = roomService.getRoom(room.id)!.seats.find((s) => s.playerId === p2.id);
    assert.strictEqual(back?.seat, p2Seat, 'returns to the same seat (same team and hand)');
    session.endSession(room.id);
  });
});

describe('Regression: leaving a room really leaves it', () => {
  it('the creator who leaves a running match is no longer a member or a broadcast target', () => {
    const { session, roomService, room } = makeHarness();
    session.startMatch(room.id, 'user_host_1');
    roomService.leaveRoom(room.id, 'sock_host');

    const after = roomService.getRoom(room.id)!;
    for (const field of ['currentAdminId', 'originalAdminId', 'ownerId'] as const) {
      assert.notStrictEqual(after[field], 'user_host_1', `${field} must not keep the player who left`);
    }
    assert.ok(!after.seats.some((s) => s.playerId === 'user_host_1'), 'seat handed to a bot');
    // The old socket must not keep receiving the room's events (bot moves, chat, sounds).
    roomService.registerSocket('sock_host_again', { id: 'user_host_1', username: 'Host', avatar: 'avatar-1' }, 'PLAYER');
    const targets = roomService.getConnectedPlayersInRoom(room.id).map((p) => p.userId);
    assert.ok(!targets.includes('user_host_1'));
    session.endSession(room.id);
  });
});

describe('Regression: a player who was away is told what happened', () => {
  it('warnings given while away are kept for the summary shown on return', () => {
    const { session, room } = makeHarness();
    const engine = session.startMatch(room.id, 'user_host_1');
    const seat = engine.getCurrentTurnSeat();
    const awaySince = Date.now() - 1;
    session.warnPlayer(room.id, 'judge_x', seat, 'تعطيل اللعب');
    const events = session.getSeatEventsSince(room.id, seat, awaySince);
    assert.deepStrictEqual(events.map((e) => [e.kind, e.text]), [['WARNING', 'تعطيل اللعب']]);
    assert.strictEqual(session.getSeatEventsSince(room.id, ((seat + 1) % 4) as PlayerSeat, awaySince).length, 0);
    session.endSession(room.id);
  });
});

describe('Regression: restoring a backup never loses data', () => {
  it('adds missing accounts and matches, keeps newer copies', () => {
    const persistence = new PersistenceService();
    const base = { id: 'user_restore_1', username: 'R1', normalizedUsername: 'r1', displayName: 'R1' } as any;
    persistence.importBackup({ users: { user_restore_1: { ...base, city: 'old', updatedAt: '2026-01-01T00:00:00Z' } } as any });
    // A newer copy already on the server must not be overwritten by an older backup.
    persistence.importBackup({ users: { user_restore_1: { ...base, city: 'newer', updatedAt: '2026-06-01T00:00:00Z' } } as any });
    const r = persistence.importBackup({
      users: { user_restore_1: { ...base, city: 'stale', updatedAt: '2026-02-01T00:00:00Z' }, user_restore_2: { ...base, id: 'user_restore_2', updatedAt: '2026-01-01T00:00:00Z' } } as any,
      matches: { match_restore_1: { id: 'match_restore_1' } } as any,
    });
    assert.strictEqual(persistence.getUserById('user_restore_1')?.city, 'newer');
    assert.ok(persistence.getUserById('user_restore_2'));
    assert.strictEqual(r.usersAdded, 1);
    assert.strictEqual(r.usersUpdated, 0);
    assert.strictEqual(r.matchesAdded, 1);
  });
});

describe('Regression: automatic referee is announced and consistent', () => {
  it('play violation then pass violation = warning, then announced cheating penalty', () => {
    const { session, room } = makeHarness();
    const engine = session.startMatch(room.id, 'user_host_1');
    const turn = engine.getCurrentTurnSeat();
    const illegal = findSeatWithIllegalTile(engine, turn);
    if (!illegal) return; // whole hand happens to be legal for this deal

    const decisions: string[] = [];
    const personal: string[] = [];
    session.setCallbacks({
      broadcastStateToRoom: () => {},
      emitErrorToPlayer: () => {},
      broadcastBotChat: () => {},
      broadcastStatsUpdated: () => {},
      broadcastRefereeDecision: (_r, d) => decisions.push(d.actionType),
      notifySeat: (_r, seat, n) => personal.push(`${seat}:${n.type}`),
    });

    const first = session.playTile(room.id, turn, illegal, 'LEFT');
    assert.strictEqual(first.success, false);
    assert.ok(first.error && /إنذار/.test(first.error), 'the player is told they were warned');
    assert.deepStrictEqual(decisions, ['YELLOW_CARD_1']);

    const second = session.passTurn(room.id, turn);
    assert.strictEqual(second.success, false);
    assert.deepStrictEqual(decisions, ['YELLOW_CARD_1', 'YELLOW_CARD_2_CHEATING']);
    assert.deepStrictEqual(personal, [`${turn}:WARNING`, `${turn}:ALERT`]);
    assert.ok(['ROUND_FINISHED', 'MATCH_FINISHED'].includes(engine.getStatus()));
    session.endSession(room.id);
  });
});

describe('Regression: same display name never grants another player\'s seat', () => {
  it('joining as spectator with a duplicate name does not evict the seated player', () => {
    const persistence = new PersistenceService();
    const roomService = new RoomService(offlinePrisma, persistence);
    const host = { id: 'guest_host_aaaa', username: 'ضيف', avatar: 'avatar-1' };
    roomService.registerSocket('s1', host, 'ADMIN');
    const room = roomService.createRoom('s1', host, 'R', { allowSpectator: true } as any, 'ADMIN');

    const twin = { id: 'guest_twin_bbbb', username: 'ضيف', avatar: 'avatar-1' };
    roomService.registerSocket('s2', twin, 'SPECTATOR');
    roomService.joinAsSpectator(room.id, 's2', twin);

    const hostSeat = roomService.getRoom(room.id)!.seats.find((s) => s.playerId === host.id);
    assert.ok(hostSeat && !hostSeat.isBot, 'host keeps the seat');
  });
});
