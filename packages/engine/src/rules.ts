import {
  DominoTile,
  LegalMove,
  PlayerSeat,
  TeamId,
} from '@baffa/shared';
import { DominoChainManager } from './chain';

/**
 * Returns the Team ID (1 or 2) for a given seat.
 * Seats 0 and 2 = Team 1 (Opposite positions: South and North)
 * Seats 1 and 3 = Team 2 (Opposite positions: East and West)
 */
export function getTeamForSeat(seat: PlayerSeat): TeamId {
  return seat === 0 || seat === 2 ? 1 : 2;
}

/**
 * STRICT EGYPTIAN DOMINO RULE:
 * Turn progression is always COUNTER-CLOCKWISE.
 * 0 (South) -> 1 (East) -> 2 (North) -> 3 (West) -> 0
 */
export function getNextSeat(currentSeat: PlayerSeat): PlayerSeat {
  return ((currentSeat + 1) % 4) as PlayerSeat;
}

/**
 * Finds the starting player seat.
 * - Round 1: Strictly the player holding the Double-Six (6|6).
 * - Future rounds: Extensible — default to previous winning player seat,
 *   or player who won the round.
 */
export function determineStartingSeat(
  hands: DominoTile[][],
  roundNumber: number,
  previousWinningSeat: PlayerSeat | null = null
): PlayerSeat {
  if (roundNumber === 1 || previousWinningSeat === null) {
    for (let seat = 0; seat < hands.length; seat++) {
      const hasDoubleSix = hands[seat].some(
        (t) => (t[0] === 6 && t[1] === 6) || (t[1] === 6 && t[0] === 6)
      );
      if (hasDoubleSix) {
        return seat as PlayerSeat;
      }
    }
    // Fallback if somehow 6|6 wasn't dealt in 4-player game (e.g. custom test hands)
    return 0;
  }

  return previousWinningSeat;
}

/**
 * Computes all legal moves for a given hand against the active chain.
 */
export function getLegalMovesForHand(
  hand: DominoTile[],
  chain: DominoChainManager,
  roundNumber: number
): LegalMove[] {
  const legalMoves: LegalMove[] = [];

  if (chain.isEmpty()) {
    // If table is empty:
    if (roundNumber === 1) {
      // In Round 1, the opening move MUST be 6|6
      hand.forEach((tile, index) => {
        if (tile[0] === 6 && tile[1] === 6) {
          legalMoves.push({
            tileIndex: index,
            tile,
            validEnds: ['LEFT'],
          });
        }
      });
    } else {
      // In future rounds, opening player can start with any tile in hand
      hand.forEach((tile, index) => {
        legalMoves.push({
          tileIndex: index,
          tile,
          validEnds: ['LEFT'],
        });
      });
    }
    return legalMoves;
  }

  hand.forEach((tile, index) => {
    const validEnds = chain.getValidEnds(tile);
    if (validEnds.length > 0) {
      legalMoves.push({
        tileIndex: index,
        tile,
        validEnds,
      });
    }
  });

  return legalMoves;
}

/**
 * Calculates sum of pips for an array of tiles.
 */
export function calculatePipSum(tiles: DominoTile[]): number {
  return tiles.reduce((sum, [a, b]) => sum + a + b, 0);
}

/**
 * Helper to check if two tiles are identical regardless of pip ordering.
 */
export function areTilesEqual(t1: DominoTile, t2: DominoTile): boolean {
  return (
    (t1[0] === t2[0] && t1[1] === t2[1]) ||
    (t1[0] === t2[1] && t1[1] === t2[0])
  );
}
