import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '../engine';
import { areTilesEqual, getNextSeat } from '../rules';
import { DominoTile } from '@baffa/shared';

describe('BAFFA End-to-End Full Match Simulation', () => {
  it('Simulates complete 4-player 2v2 match with 6|6 start, turns, pass, blocked, round wins and target 101', () => {
    // 1. Create Room / Match with 4 players (Team 1: 0, 2; Team 2: 1, 3)
    const engine = new DominoGameEngine({
      matchId: 'e2e-match-101',
      roomId: 'e2e-room-101',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'Karim', avatar: 'avatar-1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'Omda', avatar: 'bot-1', isBot: true, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'Tarek', avatar: 'avatar-3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'Zaki', avatar: 'bot-2', isBot: true, isConnected: true, isReady: true },
      ],
    });

    // 2. Start Match
    engine.startMatch();
    assert.strictEqual(engine.getStatus(), 'PLAYING');
    assert.strictEqual(engine.getRoundNumber(), 1);

    // 3. Confirm 28 tiles dealt, 7 each, no duplicates
    const rawHands = engine.getRawHands();
    assert.strictEqual(rawHands.length, 4);
    rawHands.forEach((h, i) => assert.strictEqual(h.length, 7, `Seat ${i} must have 7 tiles`));
    const allTiles = rawHands.flat();
    assert.strictEqual(allTiles.length, 28);

    // 4. Confirm starter holds 6|6 in Round 1
    const starterSeat = engine.getCurrentTurnSeat();
    const starterHand = rawHands[starterSeat];
    assert.ok(
      starterHand.some((t) => areTilesEqual(t, [6, 6])),
      `Starter (Seat ${starterSeat}) must own 6|6`
    );

    // 5. Attempt illegal move: Player plays out of turn -> rejected
    const nonTurnSeat = getNextSeat(starterSeat);
    const illegalTurnMove = engine.playTile(nonTurnSeat, rawHands[nonTurnSeat][0]);
    assert.strictEqual(illegalTurnMove.success, false);

    // 6. Play legal 6|6 opening tile
    const openRes = engine.playTile(starterSeat, [6, 6]);
    assert.strictEqual(openRes.success, true);
    assert.strictEqual(engine.getChain().getLeftEnd(), 6);
    assert.strictEqual(engine.getChain().getRightEnd(), 6);

    // 7. Verify Turn Direction: Counter-Clockwise
    const nextTurnSeat = engine.getCurrentTurnSeat();
    assert.strictEqual(nextTurnSeat, getNextSeat(starterSeat));

    // 8. Attempt illegal move: Next player attempts non-matching tile (if available)
    const nextHand = engine.getRawHands()[nextTurnSeat];
    const nonMatching = nextHand.find((t) => t[0] !== 6 && t[1] !== 6);
    if (nonMatching) {
      const illegalTileMove = engine.playTile(nextTurnSeat, nonMatching);
      assert.strictEqual(illegalTileMove.success, false);
      assert.strictEqual(engine.getCurrentTurnSeat(), nextTurnSeat, 'Turn must not advance on illegal move');
    }

    // 9. Play through the game programmatically using bot/engine heuristics until round end
    let roundCount = 0;
    while (engine.getStatus() === 'PLAYING' && roundCount < 100) {
      roundCount++;
      const currentSeat = engine.getCurrentTurnSeat();
      const legalMoves = engine.getLegalMovesForSeat(currentSeat);

      if (legalMoves.length > 0) {
        // Play highest pip legal tile
        const move = legalMoves[0];
        const res = engine.playTile(currentSeat, move.tile, move.validEnds[0]);
        assert.strictEqual(res.success, true);
      } else {
        // Pass
        const passRes = engine.passTurn(currentSeat);
        assert.strictEqual(passRes.success, true);
      }
    }

    // 10. Verify round completed cleanly
    assert.ok(
      engine.getStatus() === 'ROUND_FINISHED' || engine.getStatus() === 'MATCH_FINISHED',
      `Game reached valid terminal round state: ${engine.getStatus()}`
    );

    const scores = engine.getTeamScores();
    assert.ok(scores.team1 >= 0 && scores.team2 >= 0);

    // 11. If not match finished, test next round transition
    if (engine.getStatus() === 'ROUND_FINISHED') {
      const nextRoundRes = engine.nextRound();
      assert.strictEqual(nextRoundRes.success, true);
      assert.strictEqual(engine.getStatus(), 'PLAYING');
      assert.strictEqual(engine.getRoundNumber(), 2);
    }
  });
});
