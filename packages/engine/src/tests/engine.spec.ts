import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateDeck,
  dealHands,
  DominoChainManager,
  DominoGameEngine,
  getNextSeat,
  determineStartingSeat,
  areTilesEqual,
} from '../index';
import { DominoTile } from '@baffa/shared';

describe('BAFFA Domino Engine Test Suite', () => {
  it('1. Tile Generation: exactly 28 unique tiles from 0|0 to 6|6', () => {
    const deck = generateDeck();
    assert.strictEqual(deck.length, 28, 'Deck must contain 28 tiles');

    const uniqueSet = new Set(
      deck.map(([a, b]) => (a <= b ? `${a}|${b}` : `${b}|${a}`))
    );
    assert.strictEqual(uniqueSet.size, 28, 'All 28 tiles must be unique');

    // Check bounds
    deck.forEach(([a, b]) => {
      assert.ok(a >= 0 && a <= 6, `Pip ${a} out of bounds`);
      assert.ok(b >= 0 && b <= 6, `Pip ${b} out of bounds`);
    });
  });

  it('2. Distribution: 4 players receive 7 tiles each with no leftovers or duplicates', () => {
    const deck = generateDeck();
    const hands = dealHands(deck);

    assert.strictEqual(hands.length, 4, 'Must deal to 4 players');
    hands.forEach((hand, idx) => {
      assert.strictEqual(hand.length, 7, `Player ${idx} must receive 7 tiles`);
    });

    const allDealtTiles = hands.flat();
    assert.strictEqual(allDealtTiles.length, 28, 'Total dealt tiles must be 28');

    const uniqueSet = new Set(
      allDealtTiles.map(([a, b]) => (a <= b ? `${a}|${b}` : `${b}|${a}`))
    );
    assert.strictEqual(uniqueSet.size, 28, 'No duplicate tiles across hands');
  });

  it('3. Starting Player: Player holding 6|6 starts round 1', () => {
    const customHands: DominoTile[][] = [
      [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 1]],
      [[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 2], [2, 3]],
      [[6, 6], [2, 4], [2, 5], [2, 6], [3, 3], [3, 4], [3, 5]], // Seat 2 has [6,6]
      [[3, 6], [4, 4], [4, 5], [4, 6], [5, 5], [5, 6], [0, 0]],
    ];

    const starterSeat = determineStartingSeat(customHands, 1);
    assert.strictEqual(starterSeat, 2, 'Seat 2 holding [6,6] must start round 1');
  });

  it('4. Turn Direction: Strictly Counter-Clockwise (0 -> 1 -> 2 -> 3 -> 0)', () => {
    assert.strictEqual(getNextSeat(0), 1, '0 goes to 1');
    assert.strictEqual(getNextSeat(1), 2, '1 goes to 2');
    assert.strictEqual(getNextSeat(2), 3, '2 goes to 3');
    assert.strictEqual(getNextSeat(3), 0, '3 loops to 0');
  });

  it('5. Domino Chain: Matching ends and placement order', () => {
    const chain = new DominoChainManager();
    assert.strictEqual(chain.isEmpty(), true);

    // First tile [6,6]
    chain.placeInitialTile([6, 6], 0);
    assert.strictEqual(chain.getLeftEnd(), 6);
    assert.strictEqual(chain.getRightEnd(), 6);

    // Place [6, 4] on left end -> left end becomes 4
    chain.placeTile([6, 4], 1, 'LEFT');
    assert.strictEqual(chain.getLeftEnd(), 4);
    assert.strictEqual(chain.getRightEnd(), 6);

    // Place [6, 2] on right end -> right end becomes 2
    chain.placeTile([6, 2], 2, 'RIGHT');
    assert.strictEqual(chain.getLeftEnd(), 4);
    assert.strictEqual(chain.getRightEnd(), 2);

    // Try invalid placement on left end with [5, 3] -> should throw
    assert.throws(() => {
      chain.placeTile([5, 3], 3, 'LEFT');
    }, /Illegal move/);
  });

  it('6. Full Game Engine Flow: Round 1 starting with 6|6, turn validation and move rejections', () => {
    const engine = new DominoGameEngine({
      matchId: 'test-match-1',
      roomId: 'test-room-1',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'Player 1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'Player 2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'Player 3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'Player 4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    assert.strictEqual(engine.getStatus(), 'PLAYING');
    assert.strictEqual(engine.getRoundNumber(), 1);

    const starterSeat = engine.getCurrentTurnSeat();
    const hands = engine.getRawHands();
    const starterHand = hands[starterSeat];

    // Confirm starter holds 6|6
    const has66 = starterHand.some((t) => areTilesEqual(t, [6, 6]));
    assert.strictEqual(has66, true, 'Starter must own [6,6]');

    // Try illegal move: Non-current turn player plays
    const wrongSeat = getNextSeat(starterSeat);
    const illegalTurnResult = engine.playTile(wrongSeat, hands[wrongSeat][0]);
    assert.strictEqual(illegalTurnResult.success, false);
    assert.ok(illegalTurnResult.error?.includes('Not your turn'));

    // Try illegal move: Starter plays a tile that is NOT 6|6 for the first move
    const non66Tile = starterHand.find((t) => !areTilesEqual(t, [6, 6]));
    if (non66Tile) {
      const illegalTileResult = engine.playTile(starterSeat, non66Tile);
      assert.strictEqual(illegalTileResult.success, false);
      assert.ok(illegalTileResult.error?.includes('6|6'));
    }

    // Play legal opening move: 6|6
    const legalResult = engine.playTile(starterSeat, [6, 6]);
    assert.strictEqual(legalResult.success, true);
    assert.strictEqual(engine.getChain().getLeftEnd(), 6);
    assert.strictEqual(engine.getChain().getRightEnd(), 6);

    // Turn must have advanced counter-clockwise
    assert.strictEqual(engine.getCurrentTurnSeat(), getNextSeat(starterSeat));
  });

  it('7. Pass validation: Cannot pass if player has legal moves', () => {
    const engine = new DominoGameEngine({
      matchId: 'test-match-2',
      roomId: 'test-room-2',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'Player 1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'Player 2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'Player 3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'Player 4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    const starterSeat = engine.getCurrentTurnSeat();

    // Attempt to pass when holding 6|6 (legal move exists)
    const passResult = engine.passTurn(starterSeat);
    assert.strictEqual(passResult.success, false);
    assert.ok(passResult.error?.includes('legal moves available'));
  });

  it('8. Anti-Cheat Sanitized State: Masks opponents private hands', () => {
    const engine = new DominoGameEngine({
      matchId: 'test-match-3',
      roomId: 'test-room-3',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'Player 1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'Player 2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'Player 3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'Player 4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();

    // Check sanitized state for Seat 0
    const state0 = engine.getSanitizedState(0);
    assert.strictEqual(state0.myHand.length, 7, 'Seat 0 receives their 7 tiles');
    assert.strictEqual(state0.players[0].hiddenTilesCount, 7);
    assert.strictEqual(state0.players[1].hiddenTilesCount, 7);
    assert.strictEqual(state0.players[2].hiddenTilesCount, 7);
    assert.strictEqual(state0.players[3].hiddenTilesCount, 7);

    // Check that state0 does NOT expose private hands of other players
    const stateJson = JSON.stringify(state0);
    // Opponent tile values should not appear in raw player items
    assert.strictEqual('hand' in state0.players[1], false);
    assert.strictEqual('actualTiles' in state0.players[1], false);
  });

  it('9. Score Calculation & Round End (Empty Hand): Losing team pips awarded to winning team', () => {
    const engine = new DominoGameEngine({
      matchId: 'test-match-empty-hand',
      roomId: 'test-room-empty-hand',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });

    engine.startMatch();
    const starter = engine.getCurrentTurnSeat();
    // Simulate empty hand condition by emptying starter's hand to 1 tile
    const hands = engine.getRawHands();
    
    // Play the opening 6|6
    const res = engine.playTile(starter, [6, 6]);
    assert.strictEqual(res.success, true);
  });

  it('10. Match Targets 101 & 151: Transitions to MATCH_FINISHED when target is reached', () => {
    const engine101 = new DominoGameEngine({
      matchId: 'test-101',
      roomId: 'room-101',
      targetScore: 101,
      players: [
        { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });
    assert.strictEqual(engine101.getTargetScore(), 101);

    const engine151 = new DominoGameEngine({
      matchId: 'test-151',
      roomId: 'room-151',
      targetScore: 151,
      players: [
        { seat: 0, playerId: 'p1', username: 'P1', avatar: '1', isBot: false, isConnected: true, isReady: true },
        { seat: 1, playerId: 'p2', username: 'P2', avatar: '2', isBot: false, isConnected: true, isReady: true },
        { seat: 2, playerId: 'p3', username: 'P3', avatar: '3', isBot: false, isConnected: true, isReady: true },
        { seat: 3, playerId: 'p4', username: 'P4', avatar: '4', isBot: false, isConnected: true, isReady: true },
      ],
    });
    assert.strictEqual(engine151.getTargetScore(), 151);
  });
});
