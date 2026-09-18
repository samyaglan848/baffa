import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '../engine';

describe('BAFFA Comprehensive E2E Scenarios (Scenarios A through K)', () => {
  // Scenario A: Four humans 2v2 to 101 target
  it('Scenario A: 4 Humans 2v2 to 101 target score', () => {
    const engine = new DominoGameEngine({
      matchId: 'scenario-a-101',
      roomId: 'room-a',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'h1', username: 'Human 1 (T1)', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'h2', username: 'Human 2 (T2)', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'h3', username: 'Human 3 (T1)', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'h4', username: 'Human 4 (T2)', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    assert.strictEqual(engine.getStatus(), 'PLAYING');
    assert.strictEqual(engine.getTargetScore(), 101);

    let maxTurns = 1500;
    while (engine.getStatus() !== 'MATCH_FINISHED' && maxTurns > 0) {
      if (engine.getStatus() === 'ROUND_FINISHED') {
        engine.nextRound();
      }

      if (engine.getStatus() === 'PLAYING') {
        const turn = engine.getCurrentTurnSeat();
        const legalMoves = engine.getLegalMovesForSeat(turn);

        if (legalMoves.length > 0) {
          const move = legalMoves[0];
          engine.playTile(turn, move.tile, move.validEnds[0]);
        } else {
          engine.passTurn(turn);
        }
      }

      maxTurns--;
    }

    assert.strictEqual(engine.getStatus(), 'MATCH_FINISHED');
    const scores = engine.getTeamScores();
    assert.ok(scores.team1 >= 101 || scores.team2 >= 101);
  });

  // Scenario B: Four humans 2v2 to 151 target
  it('Scenario B: 4 Humans 2v2 to 151 target score', () => {
    const engine = new DominoGameEngine({
      matchId: 'scenario-b-151',
      roomId: 'room-b',
      targetScore: 151,
      players: [
        { seat: 0, playerId: 'h1', username: 'Human 1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'h2', username: 'Human 2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'h3', username: 'Human 3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'h4', username: 'Human 4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    assert.strictEqual(engine.getTargetScore(), 151);

    let maxTurns = 2500;
    while (engine.getStatus() !== 'MATCH_FINISHED' && maxTurns > 0) {
      if (engine.getStatus() === 'ROUND_FINISHED') {
        engine.nextRound();
      }

      if (engine.getStatus() === 'PLAYING') {
        const turn = engine.getCurrentTurnSeat();
        const legalMoves = engine.getLegalMovesForSeat(turn);

        if (legalMoves.length > 0) {
          const move = legalMoves[0];
          engine.playTile(turn, move.tile, move.validEnds[0]);
        } else {
          engine.passTurn(turn);
        }
      }

      maxTurns--;
    }

    assert.strictEqual(engine.getStatus(), 'MATCH_FINISHED');
    const scores = engine.getTeamScores();
    assert.ok(scores.team1 >= 151 || scores.team2 >= 151);
  });

  // Scenario C: Two humans (Human + Human vs Bot + Bot)
  it('Scenario C: Two humans vs Two bots (Co-op)', () => {
    const engine = new DominoGameEngine({
      matchId: 'scenario-c',
      roomId: 'room-c',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'h1', username: 'Human 1 (Team 1)', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'b1', username: 'Bot El Qett (Team 2)', avatar: 'bot-qett', isBot: true, botId: 'EL_QETT', isConnected: true, isReady: true },
        { seat: 2, playerId: 'h2', username: 'Human 2 (Team 1)', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'b2', username: 'Bot El Samy (Team 2)', avatar: 'bot-samy', isBot: true, botId: 'EL_SAMY', isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    assert.strictEqual(engine.getStatus(), 'PLAYING');
  });

  // Scenario D: Two humans (Human + Bot vs Human + Bot)
  it('Scenario D: Cross-partner bots (Human + Bot vs Human + Bot)', () => {
    const engine = new DominoGameEngine({
      matchId: 'scenario-d',
      roomId: 'room-d',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'h1', username: 'Human 1 (Team 1)', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'h2', username: 'Human 2 (Team 2)', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'b1', username: 'Bot Partner (Team 1)', avatar: 'bot-samy', isBot: true, botId: 'EL_SAMY', isConnected: true, isReady: true },
        { seat: 3, playerId: 'b2', username: 'Bot Opponent (Team 2)', avatar: 'bot-qett', isBot: true, botId: 'EL_QETT', isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    assert.strictEqual(engine.getStatus(), 'PLAYING');
  });

  // Scenario E: One human vs three bots
  it('Scenario E: Solo Human vs 3 Bots', () => {
    const engine = new DominoGameEngine({
      matchId: 'scenario-e',
      roomId: 'room-e',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'h1', username: 'Solo Human (Team 1)', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'b1', username: 'Bot 1 (Team 2)', avatar: 'bot-qett', isBot: true, botId: 'EL_QETT', isConnected: true, isReady: true },
        { seat: 2, playerId: 'b2', username: 'Bot Partner (Team 1)', avatar: 'bot-samy', isBot: true, botId: 'EL_SAMY', isConnected: true, isReady: true },
        { seat: 3, playerId: 'b3', username: 'Bot 2 (Team 2)', avatar: 'bot-hema', isBot: true, botId: 'EL_HEMA', isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    assert.strictEqual(engine.getStatus(), 'PLAYING');
  });

  // Scenario F: Player disconnects -> Bot takeover -> Player reconnects
  it('Scenario F: Disconnect, Bot Takeover, and Reconnect state restoration', () => {
    const engine = new DominoGameEngine({
      matchId: 'scenario-f',
      roomId: 'room-f',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'h1', username: 'Human 1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'h2', username: 'Human 2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'h3', username: 'Human 3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'h4', username: 'Human 4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    const initialHand = engine.getRawHands()[0];

    // Disconnect Seat 0
    engine.setBotTakeover(0, true);
    assert.strictEqual(engine.getSanitizedState(0).players[0].isTemporarilyBotControlled, true);

    // Reconnect Seat 0
    engine.setBotTakeover(0, false);
    const restored = engine.getSanitizedState(0);
    assert.strictEqual(restored.players[0].isTemporarilyBotControlled, false);
    assert.strictEqual(restored.myHand.length, initialHand.length);
  });

  // Scenario H: Judge declares cheating -> Round forfeited
  it('Scenario H: Judge declares cheating and awards penalty score', () => {
    const engine = new DominoGameEngine({
      matchId: 'scenario-h',
      roomId: 'room-h',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'h1', username: 'Human 1 (T1)', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'h2', username: 'Human 2 (T2)', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'h3', username: 'Human 3 (T1)', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'h4', username: 'Human 4 (T2)', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    const penalty = engine.penalizeCheating('judge_omda', 1, 'Illegal communication');
    assert.strictEqual(penalty.success, true);
    assert.strictEqual(penalty.roundResult?.winnerTeam, 1);
  });

  // Scenario I: Spectator watches -> Zero hidden cards leaked
  it('Scenario I: Spectator receives public-only table without secret hand leakage', () => {
    const engine = new DominoGameEngine({
      matchId: 'scenario-i',
      roomId: 'room-i',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'h1', username: 'H1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'h2', username: 'H2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'h3', username: 'H3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'h4', username: 'H4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    const spectatorState = engine.getSanitizedState(null, 'SPECTATOR');
    assert.strictEqual(spectatorState.myHand.length, 0);
    assert.strictEqual(spectatorState.myRole, 'SPECTATOR');
  });
});
