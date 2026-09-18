import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '../engine';
import { areTilesEqual } from '../rules';

describe('BAFFA Prompt 2 Engine Extensions: Roles, Cheating Penalty & Bot Takeover', () => {
  it('1. Information Isolation: Judge & Spectator receive ZERO private tiles', () => {
    const engine = new DominoGameEngine({
      matchId: 'role-isolation-match',
      roomId: 'role-isolation-room',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();

    // Judge state
    const judgeState = engine.getSanitizedState(null, 'JUDGE');
    assert.strictEqual(judgeState.myRole, 'JUDGE');
    assert.strictEqual(judgeState.mySeat, null);
    assert.strictEqual(judgeState.myHand.length, 0, 'Judge must never receive private hands');
    assert.strictEqual(judgeState.myLegalMoves.length, 0);
    assert.strictEqual(judgeState.canPass, false);
    judgeState.players.forEach((p) => {
      assert.strictEqual(p.hiddenTilesCount, 7);
      assert.strictEqual('hand' in p, false);
    });

    // Spectator state
    const spectatorState = engine.getSanitizedState(null, 'SPECTATOR');
    assert.strictEqual(spectatorState.myRole, 'SPECTATOR');
    assert.strictEqual(spectatorState.myHand.length, 0, 'Spectator must never receive private hands');
  });

  it('2. Judge Cheating Penalty: Round immediately terminates and awards offending team pips to opponents', () => {
    const engine = new DominoGameEngine({
      matchId: 'judge-cheat-match',
      roomId: 'judge-cheat-room',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'P1 (Team 1)', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'P2 (Team 2)', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'P3 (Team 1)', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'P4 (Team 2)', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    const starter = engine.getCurrentTurnSeat();
    engine.playTile(starter, [6, 6]);

    // Judge catches Seat 0 (Team 1) cheating
    const penaltyRes = engine.penalizeCheating('judge-user-123', 0, 'Used unauthorized communication');
    assert.strictEqual(penaltyRes.success, true);
    assert.strictEqual(engine.getStatus(), 'ROUND_FINISHED');

    const result = penaltyRes.roundResult!;
    assert.strictEqual(result.reason, 'JUDGE_CHEATING_PENALTY');
    assert.strictEqual(result.winnerTeam, 2, 'Beneficiary team must be Team 2');
    assert.ok(result.roundScore > 0, 'Penalty score awarded');
    assert.strictEqual(result.cheatingDetails?.judgeId, 'judge-user-123');
    assert.strictEqual(result.cheatingDetails?.offendingSeat, 0);

    // Total score for Team 2 must match roundScore
    const scores = engine.getTeamScores();
    assert.strictEqual(scores.team2, result.roundScore);
    assert.strictEqual(scores.team1, 0);
  });

  it('3. Bot Takeover: Hand preservation, no tile lost or duplicated, seamless resumption', () => {
    const engine = new DominoGameEngine({
      matchId: 'bot-takeover-match',
      roomId: 'bot-takeover-room',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'Human Player', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    const initialHands = engine.getRawHands();
    const p1InitialHand = [...initialHands[0]];
    assert.strictEqual(p1InitialHand.length, 7);

    // Player 1 disconnects -> Bot takeover activated
    engine.setBotTakeover(0, true);
    const sanitizedDuringTakeover = engine.getSanitizedState(0, 'PLAYER');
    assert.strictEqual(sanitizedDuringTakeover.players[0].isTemporarilyBotControlled, true);

    // If it is Seat 0's turn, execute a legal move
    if (engine.getCurrentTurnSeat() === 0) {
      const legalMoves = engine.getLegalMovesForSeat(0);
      assert.ok(legalMoves.length > 0);
      const move = legalMoves[0];
      const playRes = engine.playTile(0, move.tile, move.validEnds[0]);
      assert.strictEqual(playRes.success, true);

      // Verify hand decreased by exactly 1
      const handAfter1Move = engine.getRawHands()[0];
      assert.strictEqual(handAfter1Move.length, 6);
    }

    // Human player reconnects -> Bot takeover deactivated
    engine.setBotTakeover(0, false);
    const stateOnReconnect = engine.getSanitizedState(0, 'PLAYER');
    assert.strictEqual(stateOnReconnect.players[0].isTemporarilyBotControlled, false);

    // Current hand matches server authoritative state exactly
    const currentServerHand = engine.getRawHands()[0];
    assert.strictEqual(stateOnReconnect.myHand.length, currentServerHand.length);
    stateOnReconnect.myHand.forEach((tile, i) => {
      assert.ok(areTilesEqual(tile, currentServerHand[i]));
    });
  });
});
