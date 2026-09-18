import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DominoGameEngine } from '../engine';
import { generateDeck, shuffleDeck, dealHands } from '../deck';
import { DominoTile } from '@baffa/shared';

describe('Dealing & Randomness Rules (Prompt 8)', () => {

  describe('Deck Generation', () => {
    it('generates exactly 28 unique tiles', () => {
      const deck = generateDeck();
      assert.strictEqual(deck.length, 28);
      
      const uniqueTiles = new Set(deck.map(t => `${t[0]}|${t[1]}`));
      assert.strictEqual(uniqueTiles.size, 28);
    });

    it('contains exactly one 6|6 tile', () => {
      const deck = generateDeck();
      const doubleSixes = deck.filter(t => t[0] === 6 && t[1] === 6);
      assert.strictEqual(doubleSixes.length, 1);
    });
  });

  describe('Dealing Mechanics', () => {
    it('deals exactly 7 tiles per player and leaves zero undealt tiles', () => {
      const deck = generateDeck();
      const shuffled = shuffleDeck(deck);
      const hands = dealHands(shuffled);

      assert.strictEqual(hands.length, 4);
      assert.strictEqual(hands[0].length, 7);
      assert.strictEqual(hands[1].length, 7);
      assert.strictEqual(hands[2].length, 7);
      assert.strictEqual(hands[3].length, 7);

      // Total tiles dealt should equal 28
      const allDealt = hands.flat();
      assert.strictEqual(allDealt.length, 28);
    });

    it('creates no duplicate tile instances across all hands', () => {
      const deck = generateDeck();
      const shuffled = shuffleDeck(deck);
      const hands = dealHands(shuffled);
      const allDealt = hands.flat();
      
      const uniqueTiles = new Set(allDealt.map(t => `${t[0]}|${t[1]}`));
      assert.strictEqual(uniqueTiles.size, 28);
    });

    it('multiple rounds produce independent shuffles', () => {
      const engine = new DominoGameEngine({
        matchId: 'test_match_1',
        roomId: 'room_1',
        targetScore: 101,
        players: [
          { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });
      engine.startMatch();
      const hands1 = engine.getRawHands();
      
      // Force round end by artificial empty hand
      engine['hands'][engine.getCurrentTurnSeat()] = []; 
      engine.playTile(engine.getCurrentTurnSeat(), hands1[engine.getCurrentTurnSeat()][0]); // trigger round end
      
      engine.nextRound();
      const hands2 = engine.getRawHands();

      // Ensure at least some hands are different (extremely unlikely to naturally repeat completely)
      const hand1Str = JSON.stringify(hands1);
      const hand2Str = JSON.stringify(hands2);
      assert.notStrictEqual(hand1Str, hand2Str);
    });
  });

  describe('First Round Starter', () => {
    it('starts round 1 with the player holding the 6|6 tile', () => {
      const engine = new DominoGameEngine({
        matchId: 'test_match_1',
        roomId: 'room_1',
        targetScore: 101,
        players: [
          { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });
      engine.startMatch();
      const starterSeat = engine.getCurrentTurnSeat();
      const hands = engine.getRawHands();
      
      const starterHand = hands[starterSeat];
      const hasDoubleSix = starterHand.some(t => t[0] === 6 && t[1] === 6);
      
      assert.strictEqual(hasDoubleSix, true);
    });
  });

  describe('Private Hand Security (Sanitized State)', () => {
    it('unauthorized clients (opponents, spectators, judges) never receive private hand values', () => {
      const engine = new DominoGameEngine({
        matchId: 'test_match_1',
        roomId: 'room_1',
        targetScore: 101,
        players: [
          { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
          { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
          { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
          { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
        ],
      });
      engine.startMatch();
      
      // Get state for player 0
      const p0State = engine.getSanitizedState(0, 'PLAYER');
      assert.strictEqual(p0State.myHand.length, 7);
      
      // P1 state should not include any hands for other players. 
      // The `players` array only exposes `hiddenTilesCount`.
      assert.strictEqual(p0State.players[1].hiddenTilesCount, 7);
      assert.strictEqual((p0State.players[1] as any).hand, undefined);

      // Get state for a spectator (seat null, role SPECTATOR)
      const spectatorState = engine.getSanitizedState(null, 'SPECTATOR');
      assert.strictEqual(spectatorState.myHand.length, 0);
      assert.strictEqual(spectatorState.players[0].hiddenTilesCount, 7);
      assert.strictEqual(spectatorState.players[1].hiddenTilesCount, 7);
      assert.strictEqual((spectatorState.players[0] as any).hand, undefined);

      // Get state for a judge
      const judgeState = engine.getSanitizedState(null, 'JUDGE');
      assert.strictEqual(judgeState.myHand.length, 0);
      assert.strictEqual(judgeState.players[2].hiddenTilesCount, 7);
    });
  });
});
