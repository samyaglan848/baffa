import { DominoTile, PipValue } from '@baffa/shared';

/**
 * Generates the full, standard Double-Six Egyptian Domino deck (28 unique tiles).
 * Values: 0|0 through 6|6.
 */
export function generateDeck(): DominoTile[] {
  const deck: DominoTile[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      deck.push([i as PipValue, j as PipValue]);
    }
  }
  return deck;
}

/**
 * Shuffles a domino deck using the Fisher-Yates algorithm.
 * An optional custom RNG function can be provided for deterministic testing.
 */
export function shuffleDeck(
  deck: DominoTile[],
  rng: () => number = Math.random
): DominoTile[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deals tiles to 4 players (7 tiles each = 28 tiles total).
 * Completely exhausts the 28-tile double-six deck with no leftover tiles.
 */
export function dealHands(
  deck: DominoTile[]
): [DominoTile[], DominoTile[], DominoTile[], DominoTile[]] {
  if (deck.length !== 28) {
    throw new Error(`Cannot deal: Deck must contain exactly 28 tiles, got ${deck.length}`);
  }

  const hands: [DominoTile[], DominoTile[], DominoTile[], DominoTile[]] = [
    [],
    [],
    [],
    [],
  ];

  for (let i = 0; i < 28; i++) {
    const playerIndex = i % 4;
    hands[playerIndex].push(deck[i]);
  }

  return hands;
}
