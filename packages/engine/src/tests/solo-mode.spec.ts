import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '../index';
import { PlayerSeat } from '@baffa/shared';

function soloEngine(seed = 1) {
  let s = seed;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return new DominoGameEngine({
    matchId: 'm', roomId: 'r', gameMode: 'SOLO', rng,
    players: [0, 1].map((seat) => ({ seat: seat as PlayerSeat, playerId: 'p' + seat, username: 'p' + seat, avatar: '', isBot: false, isConnected: true, isReady: true })),
  });
}

describe('SOLO (فردي) mode', () => {
  it('deals 7 + 7 with 14 left to draw, and the biggest double (or heaviest tile) opens', () => {
    for (let seed = 1; seed < 300; seed++) {
      const e = soloEngine(seed);
      e.startMatch();
      const hands = e.getRawHands();
      assert.strictEqual(hands[0].length, 7);
      assert.strictEqual(hands[1].length, 7);
      assert.strictEqual(hands[2].length + hands[3].length, 0);
      assert.strictEqual(e.getBoneyardCount(), 14);
      const starter = e.getCurrentTurnSeat();
      const moves = e.getLegalMovesForSeat(starter);
      assert.strictEqual(moves.length, 1, 'starter must open with exactly one tile');
      const open = moves[0].tile;
      const all = [...hands[0], ...hands[1]];
      const doubles = all.filter((t) => t[0] === t[1]);
      if (doubles.length) {
        assert.strictEqual(open[0], open[1]);
        assert.strictEqual(open[0], Math.max(...doubles.map((t) => t[0])));
      } else {
        assert.strictEqual(open[0] + open[1], Math.max(...all.map((t) => t[0] + t[1])));
      }
    }
  });

  it('plays full matches: only seats 0/1, auto-draw, pass only with an empty pile, tiles conserved', () => {
    for (let seed = 1; seed < 400; seed++) {
      const e = soloEngine(seed);
      e.startMatch();
      let guard = 0;
      while (e.getStatus() !== 'MATCH_FINISHED' && guard++ < 10000) {
        if (e.getStatus() === 'ROUND_FINISHED') { e.nextRound(); continue; }
        const seat = e.getCurrentTurnSeat();
        assert.ok(seat === 0 || seat === 1, 'only seats 0 and 1 play');
        const hands = e.getRawHands();
        const total = hands[0].length + hands[1].length + e.getChain().getTiles().length + e.getBoneyardCount();
        assert.strictEqual(total, 28, 'all 28 tiles accounted for');
        const moves = e.getLegalMovesForSeat(seat);
        if (moves.length === 0) {
          assert.strictEqual(e.getBoneyardCount(), 0, 'a player only passes when the pile is empty');
          assert.ok(e.passTurn(seat).success);
        } else {
          const m = moves[Math.floor(Math.random() * moves.length)];
          assert.ok(e.playTile(seat, m.tile, m.validEnds[Math.floor(Math.random() * m.validEnds.length)]).success);
        }
      }
      assert.strictEqual(e.getStatus(), 'MATCH_FINISHED');
      const sc = e.getTeamScores();
      assert.ok(Math.max(sc.team1, sc.team2) >= 101);
    }
  });

  it('locks after both players pass and the lower hand wins the other hand (pile not counted)', () => {
    let locks = 0;
    for (let seed = 1; seed < 2000 && locks < 20; seed++) {
      const e = soloEngine(seed);
      e.startMatch();
      let guard = 0;
      while (e.getStatus() === 'PLAYING' && guard++ < 500) {
        const seat = e.getCurrentTurnSeat();
        const moves = e.getLegalMovesForSeat(seat);
        if (moves.length === 0) {
          const before = e.getRawHands().map((h) => h.reduce((a, t) => a + t[0] + t[1], 0));
          const r = e.passTurn(seat);
          if (r.isBlocked && r.roundResult) {
            locks++;
            const [p0, p1] = before;
            if (p0 !== p1) {
              assert.strictEqual(r.roundResult.winnerTeam, p0 < p1 ? 1 : 2);
              assert.strictEqual(r.roundResult.roundScore, Math.max(p0, p1));
            }
          }
        } else {
          e.playTile(seat, moves[0].tile, moves[0].validEnds[0]);
        }
      }
    }
    assert.ok(locks > 0, 'saw at least one locked round');
  });

  it('TEAMS mode still deals 4 × 7 with no draw pile and 6|6 opens round 1', () => {
    const e = new DominoGameEngine({
      matchId: 'm', roomId: 'r',
      players: [0, 1, 2, 3].map((seat) => ({ seat: seat as PlayerSeat, playerId: 'p' + seat, username: 'p' + seat, avatar: '', isBot: false, isConnected: true, isReady: true })),
    });
    e.startMatch();
    assert.deepStrictEqual(e.getRawHands().map((h) => h.length), [7, 7, 7, 7]);
    assert.strictEqual(e.getBoneyardCount(), 0);
    const moves = e.getLegalMovesForSeat(e.getCurrentTurnSeat());
    assert.deepStrictEqual(moves.map((m) => m.tile), [[6, 6]]);
  });
});
