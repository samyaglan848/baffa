import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PlayerSeat } from '@baffa/shared';
import { PersistenceService } from '../modules/persistence/persistence.service';
import { RoomService } from '../modules/room/room.service';
import { BotService } from '../modules/game/bot.service';
import { AutoJudgeService } from '../modules/game/auto-judge.service';
import { GameSessionService } from '../modules/game/game-session.service';
import { AnticheatService } from '../modules/anticheat/anticheat.service';
import { MatchService } from '../modules/match/match.service';

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

function harness(maxPlayers: 2 | 4) {
  const persistence = new PersistenceService();
  const roomService = new RoomService(offlinePrisma, persistence);
  const session = new GameSessionService(
    new BotService(), roomService, new AnticheatService(offlinePrisma),
    new MatchService(offlinePrisma, persistence), new AutoJudgeService()
  );
  session.setCallbacks({
    broadcastStateToRoom: () => {}, emitErrorToPlayer: () => {}, broadcastBotChat: () => {},
    broadcastStatsUpdated: () => {}, broadcastNotification: () => {},
  } as any);
  const host = { id: 'user_host', username: 'Host', avatar: 'avatar-1' };
  roomService.registerSocket('sock_host', host, 'ADMIN');
  const room = roomService.createRoom('sock_host', host, 'Solo', { maxPlayers, fillWithBots: true } as any, 'ADMIN');
  return { roomService, session, room };
}

describe('SOLO (فردي) rooms', () => {
  it('a solo room has only seats 0 and 1 at the table (host + one bot)', () => {
    const { room } = harness(2);
    const live = RoomService.liveSeats(room);
    assert.deepStrictEqual(live.map((s) => s.seat), [0, 1]);
    assert.strictEqual(room.seats[0].playerId, 'user_host');
    assert.ok(room.seats[1].isBot);
    assert.ok(room.seats[2].disabled && room.seats[3].disabled);
  });

  it('a second human joining a solo room takes seat 1, never seat 2/3', () => {
    const { roomService, room } = harness(2);
    const guest = { id: 'user_guest', username: 'Guest', avatar: 'avatar-2' };
    roomService.registerSocket('sock_guest', guest, 'PLAYER');
    roomService.joinRoom(room.id, 'sock_guest', guest);
    assert.strictEqual(room.seats[1].playerId, 'user_guest');
    assert.ok(room.seats[2].disabled && room.seats[3].disabled);
    assert.throws(() => roomService.selectSeat(room.id, 'user_guest', 2 as PlayerSeat));
    assert.throws(() => roomService.toggleBot(room.id, 'user_host', 3 as PlayerSeat, true));
  });

  it('switching زوجي → فردي → زوجي in the lobby keeps the players and refills bots', () => {
    const { roomService, room } = harness(4);
    assert.strictEqual(RoomService.liveSeats(room).length, 4);
    roomService.updateSettings(room.id, 'user_host', { maxPlayers: 2 });
    assert.strictEqual(RoomService.liveSeats(room).length, 2);
    assert.strictEqual(room.seats[0].playerId, 'user_host');
    roomService.updateSettings(room.id, 'user_host', { maxPlayers: 4 });
    assert.strictEqual(RoomService.liveSeats(room).length, 4);
    assert.ok(room.seats[2].isBot && room.seats[3].isBot);
  });

  it('a player sitting on seat 2 is moved to a free seat when the room switches to فردي', () => {
    const { roomService, room } = harness(4);
    const guest = { id: 'user_guest', username: 'Guest', avatar: 'avatar-2' };
    roomService.registerSocket('sock_guest', guest, 'PLAYER');
    roomService.joinRoom(room.id, 'sock_guest', guest);
    roomService.selectSeat(room.id, 'user_guest', 2 as PlayerSeat);
    roomService.updateSettings(room.id, 'user_host', { maxPlayers: 2 });
    assert.strictEqual(room.seats[1].playerId, 'user_guest');
  });

  it('starts a SOLO match (2 players, 14 to draw) and a TEAMS match (4 players, no draw pile)', () => {
    const solo = harness(2);
    const e1 = solo.session.startMatch(solo.room.id, 'user_host');
    assert.strictEqual(e1.getGameMode(), 'SOLO');
    assert.strictEqual(e1.getSanitizedState(0).players.length, 2);
    assert.strictEqual(e1.getBoneyardCount(), 14);
    solo.session.endSession(solo.room.id);

    const teams = harness(4);
    const e2 = teams.session.startMatch(teams.room.id, 'user_host');
    assert.strictEqual(e2.getGameMode(), 'TEAMS');
    assert.strictEqual(e2.getSanitizedState(0).players.length, 4);
    assert.strictEqual(e2.getBoneyardCount(), 0);
    teams.session.endSession(teams.room.id);
  });
});
