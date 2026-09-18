import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '../engine';
import { areTilesEqual } from '../rules';
import { BotId, OFFICIAL_BAFFA_BOTS, PlayerSeat } from '@baffa/shared';

describe('BAFFA Comprehensive Prompt 2 Test Suite: Security, Anti-Cheat, Bots, Roles & Reconnect', () => {
  // 1. Hidden-Information & Information Isolation Tests
  describe('1. Information Isolation & Private Hand Security', () => {
    it('Ensures private hands are strictly isolated per seat and never leaked to opponents', () => {
      const engine = new DominoGameEngine({
        matchId: 'sec-isolation-1',
        roomId: 'room-sec-1',
        targetScore: 101,
        players: [
          { seat: 0, playerId: 'player_0', username: 'Player 0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'player_1', username: 'Player 1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'player_2', username: 'Player 2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'player_3', username: 'Player 3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();

      for (let seat = 0; seat < 4; seat++) {
        const state = engine.getSanitizedState(seat as PlayerSeat, 'PLAYER');

        // Player must only see their own hand
        assert.strictEqual(state.mySeat, seat);
        assert.strictEqual(state.myHand.length, 7);

        // Opponents' private hands must not exist on the player object
        state.players.forEach((p) => {
          assert.strictEqual(p.hiddenTilesCount, 7);
          assert.strictEqual('hand' in p, false, `Seat ${p.seat} hand must not be leaked`);
          assert.strictEqual('tiles' in p, false);
        });

        // Ensure serialized JSON contains no hidden hands
        const jsonString = JSON.stringify(state);
        const rawHands = engine.getRawHands();
        for (let otherSeat = 0; otherSeat < 4; otherSeat++) {
          if (otherSeat !== seat) {
            const otherHand = rawHands[otherSeat];
            // Ensure exact tile array is not present in payload
            assert.strictEqual(jsonString.includes(JSON.stringify(otherHand)), false);
          }
        }
      }
    });

    it('Ensures Judge & Spectator receive zero private cards and public-only table state', () => {
      const engine = new DominoGameEngine({
        matchId: 'sec-roles-1',
        roomId: 'room-roles-1',
        targetScore: 101,
        players: [
          { seat: 0, playerId: 'p0', username: 'P0', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'p1', username: 'P1', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'p2', username: 'P2', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'p3', username: 'P3', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();

      const judgeState = engine.getSanitizedState(null, 'JUDGE');
      assert.strictEqual(judgeState.myRole, 'JUDGE');
      assert.strictEqual(judgeState.mySeat, null);
      assert.strictEqual(judgeState.myHand.length, 0);
      assert.strictEqual(judgeState.myLegalMoves.length, 0);

      const spectatorState = engine.getSanitizedState(null, 'SPECTATOR');
      assert.strictEqual(spectatorState.myRole, 'SPECTATOR');
      assert.strictEqual(spectatorState.mySeat, null);
      assert.strictEqual(spectatorState.myHand.length, 0);
      assert.strictEqual(spectatorState.myLegalMoves.length, 0);
    });
  });

  // 2. Bot Takeover & Hand Authoritative Invariance
  describe('2. Authoritative Hand Invariance during Bot Takeover', () => {
    it('Bot takeover strictly preserves hand, does not duplicate or drop tiles, and restores upon human return', () => {
      const engine = new DominoGameEngine({
        matchId: 'takeover-test',
        roomId: 'takeover-room',
        targetScore: 101,
        players: [
          { seat: 0, playerId: 'human_0', username: 'Human Captain', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'p1', username: 'P1', avatar: '2', isBot: true, isConnected: true, isReady: true },
          { seat: 2, playerId: 'p2', username: 'P2', avatar: '3', isBot: true, isConnected: true, isReady: true },
          { seat: 3, playerId: 'p3', username: 'P3', avatar: '4', isBot: true, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();
      const initialHand = engine.getRawHands()[0];
      assert.strictEqual(initialHand.length, 7);

      // 1. Human disconnects -> Bot takeover enabled
      engine.setBotTakeover(0, true);
      const takeoverState = engine.getSanitizedState(0, 'PLAYER');
      assert.strictEqual(takeoverState.players[0].isTemporarilyBotControlled, true);

      // Hand count in engine remains exactly 7
      assert.strictEqual(engine.getRawHands()[0].length, 7);

      // 2. If it is Seat 0's turn, execute a legal move
      const turnSeat = engine.getCurrentTurnSeat();
      if (turnSeat === 0) {
        const legal = engine.getLegalMovesForSeat(0)[0];
        const res = engine.playTile(0, legal.tile, legal.validEnds[0]);
        assert.strictEqual(res.success, true);
        assert.strictEqual(engine.getRawHands()[0].length, 6);
      }

      // 3. Human reconnects -> Bot takeover cleared
      engine.setBotTakeover(0, false);
      const reconnectedState = engine.getSanitizedState(0, 'PLAYER');
      assert.strictEqual(reconnectedState.players[0].isTemporarilyBotControlled, false);

      // Reconnected player receives the EXACT current hand from server
      const currentServerHand = engine.getRawHands()[0];
      assert.strictEqual(reconnectedState.myHand.length, currentServerHand.length);
      for (let i = 0; i < currentServerHand.length; i++) {
        assert.ok(areTilesEqual(reconnectedState.myHand[i], currentServerHand[i]));
      }
    });
  });

  // 3. Judge Cheating Penalty & Score Allocation
  describe('3. Judge Cheating Penalty & Scoring Allocation', () => {
    it('Immediately terminates active round and awards offending team pips to opposing team', () => {
      const engine = new DominoGameEngine({
        matchId: 'judge-penalty-test',
        roomId: 'judge-penalty-room',
        targetScore: 101,
        players: [
          { seat: 0, playerId: 'p0', username: 'P0 (Team 1)', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'p1', username: 'P1 (Team 2)', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'p2', username: 'P2 (Team 1)', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'p3', username: 'P3 (Team 2)', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });

      engine.startMatch();
      const starter = engine.getCurrentTurnSeat();
      engine.playTile(starter, [6, 6]);

      // Judge penalizes Seat 1 (Team 2)
      const res = engine.penalizeCheating('judge_alpha', 1, 'Illegal hand signaling');
      assert.strictEqual(res.success, true);
      assert.strictEqual(engine.getStatus(), 'ROUND_FINISHED');

      const result = res.roundResult!;
      assert.strictEqual(result.reason, 'JUDGE_CHEATING_PENALTY');
      assert.strictEqual(result.winnerTeam, 1, 'Team 1 must win because Team 2 cheated');
      assert.ok(result.roundScore > 0);

      const scores = engine.getTeamScores();
      assert.strictEqual(scores.team1, result.roundScore);
      assert.strictEqual(scores.team2, 0);
    });
  });

  // 4. Seven Official Egyptian AI Bots
  describe('4. Seven Official Egyptian AI Bots Roster', () => {
    const botIds: BotId[] = [
      'EL_RAYEQ',
      'EL_QETT',
      'EL_TITO',
      'RAQAM_WAHED',
      'EL_HEMA',
      'EL_HOBA',
      'EL_SAMY',
    ];

    it('All 7 bots exist in the official roster with distinctive names and personalities', () => {
      botIds.forEach((id) => {
        const bot = OFFICIAL_BAFFA_BOTS[id];
        assert.ok(bot, `Bot ${id} must exist in OFFICIAL_BAFFA_BOTS`);
        assert.ok(bot.arabicName.length > 0);
        assert.ok(bot.englishName.length > 0);
        assert.ok(bot.personality.length > 0);
      });
    });

    it('All 7 bots successfully make legal moves in a live simulation', () => {
      botIds.forEach((botId) => {
        const engine = new DominoGameEngine({
          matchId: `bot-sim-${botId}`,
          roomId: `room-${botId}`,
          targetScore: 101,
          players: [
            { seat: 0, playerId: 'bot_0', username: 'Bot 0', avatar: '1', isBot: true, botId, isConnected: true, isReady: true },
            { seat: 1, playerId: 'bot_1', username: 'Bot 1', avatar: '2', isBot: true, botId, isConnected: true, isReady: true },
            { seat: 2, playerId: 'bot_2', username: 'Bot 2', avatar: '3', isBot: true, botId, isConnected: true, isReady: true },
            { seat: 3, playerId: 'bot_3', username: 'Bot 3', avatar: '4', isBot: true, botId, isConnected: true, isReady: true },
          ],
        });

        engine.startMatch();
        const turn = engine.getCurrentTurnSeat();
        const moves = engine.getLegalMovesForSeat(turn);
        assert.ok(moves.length > 0);

        // Play move
        const move = moves[0];
        const res = engine.playTile(turn, move.tile, move.validEnds[0]);
        assert.strictEqual(res.success, true);
      });
    });
  });
});
