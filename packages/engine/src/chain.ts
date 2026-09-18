import {
  BoardTilePlacement,
  ChainEnd,
  DominoChainState,
  DominoTile,
  PipValue,
  PlayerSeat,
} from '@baffa/shared';

export class DominoChainManager {
  private tiles: BoardTilePlacement[] = [];
  private leftEnd: PipValue | null = null;
  private rightEnd: PipValue | null = null;
  private placementOrder = 0;

  public reset(): void {
    this.tiles = [];
    this.leftEnd = null;
    this.rightEnd = null;
    this.placementOrder = 0;
  }

  public isEmpty(): boolean {
    return this.tiles.length === 0;
  }

  public getLeftEnd(): PipValue | null {
    return this.leftEnd;
  }

  public getRightEnd(): PipValue | null {
    return this.rightEnd;
  }

  public getTiles(): BoardTilePlacement[] {
    return [...this.tiles];
  }

  public getState(): DominoChainState {
    return {
      tiles: [...this.tiles],
      leftEndValue: this.leftEnd,
      rightEndValue: this.rightEnd,
    };
  }

  /**
   * Determine which open ends (LEFT, RIGHT) the given tile can legally connect to.
   */
  public getValidEnds(tile: DominoTile): ChainEnd[] {
    if (this.isEmpty()) {
      return ['LEFT']; // For the first tile, placement is unrestricted
    }

    const [a, b] = tile;
    const validEnds: ChainEnd[] = [];

    if (this.leftEnd !== null && (a === this.leftEnd || b === this.leftEnd)) {
      validEnds.push('LEFT');
    }

    if (this.rightEnd !== null && (a === this.rightEnd || b === this.rightEnd)) {
      // Prevent adding duplicate if both ends are identical and left already pushed
      validEnds.push('RIGHT');
    }

    return validEnds;
  }

  /**
   * Places the very first tile of the round on the table (e.g. 6|6).
   */
  public placeInitialTile(
    tile: DominoTile,
    playedBySeat: PlayerSeat
  ): BoardTilePlacement {
    if (!this.isEmpty()) {
      throw new Error('Initial tile can only be placed on an empty board');
    }

    const isDouble = tile[0] === tile[1];
    const placement: BoardTilePlacement = {
      tile: [tile[0], tile[1]],
      playedBySeat,
      end: 'START',
      flipped: false,
      isDouble,
      order: ++this.placementOrder,
    };

    this.tiles.push(placement);
    this.leftEnd = tile[0];
    this.rightEnd = tile[1];

    return placement;
  }

  /**
   * Appends a tile to either the LEFT or RIGHT open end of the chain.
   */
  public placeTile(
    tile: DominoTile,
    playedBySeat: PlayerSeat,
    end: ChainEnd
  ): BoardTilePlacement {
    if (this.isEmpty()) {
      return this.placeInitialTile(tile, playedBySeat);
    }

    const isDouble = tile[0] === tile[1];
    const targetEndValue = end === 'LEFT' ? this.leftEnd : this.rightEnd;

    if (targetEndValue === null) {
      throw new Error(`Cannot place tile: Chain end ${end} is not initialized`);
    }

    const [a, b] = tile;
    let placedTile: DominoTile;
    let flipped = false;

    if (end === 'LEFT') {
      // Connecting to the left end: outer end becomes the non-matching pip
      if (b === this.leftEnd) {
        placedTile = [a, b];
        this.leftEnd = a;
        flipped = false;
      } else if (a === this.leftEnd) {
        placedTile = [b, a];
        this.leftEnd = b;
        flipped = true;
      } else {
        throw new Error(
          `Illegal move: Tile [${a}|${b}] does not match left chain end (${this.leftEnd})`
        );
      }

      const placement: BoardTilePlacement = {
        tile: placedTile,
        playedBySeat,
        end: 'LEFT',
        flipped,
        isDouble,
        order: ++this.placementOrder,
      };

      this.tiles.unshift(placement);
      return placement;
    } else {
      // Connecting to the right end: outer end becomes the non-matching pip
      if (a === this.rightEnd) {
        placedTile = [a, b];
        this.rightEnd = b;
        flipped = false;
      } else if (b === this.rightEnd) {
        placedTile = [b, a];
        this.rightEnd = a;
        flipped = true;
      } else {
        throw new Error(
          `Illegal move: Tile [${a}|${b}] does not match right chain end (${this.rightEnd})`
        );
      }

      const placement: BoardTilePlacement = {
        tile: placedTile,
        playedBySeat,
        end: 'RIGHT',
        flipped,
        isDouble,
        order: ++this.placementOrder,
      };

      this.tiles.push(placement);
      return placement;
    }
  }
}
