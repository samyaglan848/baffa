import { useMemo } from 'react';
import { BoardTilePlacement } from '@baffa/shared';

const W = 88;
const H = 44;
const U = 44; // 1 Unit = 1 cell = 44px

export interface PlacedTileData {
  placement: BoardTilePlacement;
  x: number;
  y: number;
  rotation: number;
}

interface Tip {
  x: number;
  y: number;
  facing: number; // 0, 90, 180, 270
}

const round = (val: number) => Math.round(val * 100) / 100;

function placeTile(tile: BoardTilePlacement, tip: Tip, branch: 'RIGHT' | 'LEFT') {
  let cx, cy, rotation;
  let nextFrontTip: Tip, nextRightTip: Tip, nextLeftTip: Tip;
  
  if (tile.isDouble) {
    rotation = (tip.facing + 90) % 360;
    cx = tip.x + 0.5 * Math.cos(tip.facing * Math.PI / 180);
    cy = tip.y + 0.5 * Math.sin(tip.facing * Math.PI / 180);
    
    nextFrontTip = {
      x: cx + 0.5 * Math.cos(tip.facing * Math.PI / 180),
      y: cy + 0.5 * Math.sin(tip.facing * Math.PI / 180),
      facing: tip.facing
    };
    nextRightTip = {
      x: cx + 1 * Math.cos((tip.facing + 90) * Math.PI / 180),
      y: cy + 1 * Math.sin((tip.facing + 90) * Math.PI / 180),
      facing: (tip.facing + 90) % 360
    };
    nextLeftTip = {
      x: cx + 1 * Math.cos((tip.facing - 90) * Math.PI / 180),
      y: cy + 1 * Math.sin((tip.facing - 90) * Math.PI / 180),
      facing: (tip.facing + 270) % 360
    };
  } else {
    rotation = branch === 'RIGHT' ? tip.facing : (tip.facing + 180) % 360;
    cx = tip.x + 1 * Math.cos(tip.facing * Math.PI / 180);
    cy = tip.y + 1 * Math.sin(tip.facing * Math.PI / 180);
    
    nextFrontTip = {
      x: cx + 1 * Math.cos(tip.facing * Math.PI / 180),
      y: cy + 1 * Math.sin(tip.facing * Math.PI / 180),
      facing: tip.facing
    };
    
    const outerCellX = cx + 0.5 * Math.cos(tip.facing * Math.PI / 180);
    const outerCellY = cy + 0.5 * Math.sin(tip.facing * Math.PI / 180);
    
    nextRightTip = {
      x: outerCellX + 0.5 * Math.cos((tip.facing + 90) * Math.PI / 180),
      y: outerCellY + 0.5 * Math.sin((tip.facing + 90) * Math.PI / 180),
      facing: (tip.facing + 90) % 360
    };
    nextLeftTip = {
      x: outerCellX + 0.5 * Math.cos((tip.facing - 90) * Math.PI / 180),
      y: outerCellY + 0.5 * Math.sin((tip.facing - 90) * Math.PI / 180),
      facing: (tip.facing + 270) % 360
    };
  }
  
  return {
    cx: round(cx), cy: round(cy), rotation,
    nextFrontTip: { x: round(nextFrontTip.x), y: round(nextFrontTip.y), facing: nextFrontTip.facing },
    nextRightTip: { x: round(nextRightTip.x), y: round(nextRightTip.y), facing: nextRightTip.facing },
    nextLeftTip: { x: round(nextLeftTip.x), y: round(nextLeftTip.y), facing: nextLeftTip.facing }
  };
}

export function useDominoLayout(tiles: BoardTilePlacement[], containerWidth: number = 500, containerHeight: number = 300) {
  return useMemo(() => {
    // Determine effective available width between left and right player cards.
    // containerWidth is measured directly from the board container via ResizeObserver.
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const availableWidth = containerWidth > 0 ? containerWidth : Math.max(screenWidth - 400, 300);
    const availableHeight = containerHeight > 0 ? containerHeight : 300;

    // Change direction 55 pixels before reaching player cards on left/right and top/bottom edges
    const maxXPx = Math.max((availableWidth / 2) - 55, 60);
    const maxYPx = Math.max((availableHeight / 2) - 55, 60);

    const MAX_X = maxXPx / U;
    const MAX_Y = maxYPx / U;

    if (tiles.length === 0) {
      return {
        layout: [],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        openEnds: { RIGHT: { x: 0, y: 0 }, LEFT: { x: 0, y: 0 } }
      };
    }

    const layout: PlacedTileData[] = [];
    const startIndex = tiles.findIndex(t => t.end === 'START');
    
    if (startIndex === -1) {
      return {
        layout: [],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        openEnds: { RIGHT: { x: 0, y: 0 }, LEFT: { x: 0, y: 0 } }
      };
    }

    let minX = 0, maxX = 0, minY = 0, maxY = 0;

    const startTile = tiles[startIndex];
    const startRot = startTile.isDouble ? 90 : 0;
    layout[startIndex] = { placement: startTile, x: 0, y: 0, rotation: startRot };
    
    let initialRightTip: Tip, initialLeftTip: Tip;
    if (startTile.isDouble) {
      initialRightTip = { x: 0.5, y: 0, facing: 0 };
      initialLeftTip = { x: -0.5, y: 0, facing: 180 };
    } else {
      initialRightTip = { x: 1, y: 0, facing: 0 };
      initialLeftTip = { x: -1, y: 0, facing: 180 };
    }

    let rightEndTip = initialRightTip;
    let leftEndTip = initialLeftTip;

    const layoutBranch = (step: 1 | -1, branch: 'RIGHT' | 'LEFT', initialTip: Tip) => {
      let currentTip = initialTip;
      let flowHoriz = branch === 'RIGHT' ? 0 : 180;
      let flowVert = branch === 'RIGHT' ? 90 : 270; // RIGHT branch snakes bottom, LEFT snakes top
      let vertStepsRemaining = 0;

      for (let i = startIndex + step; i >= 0 && i < tiles.length; i += step) {
        const p = tiles[i];
        const { cx, cy, rotation, nextFrontTip, nextRightTip, nextLeftTip } = placeTile(p, currentTip, branch);
        
        const px = Math.round(cx * U);
        const py = Math.round(cy * U);
        layout[i] = { placement: p, x: px, y: py, rotation };
        
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);

        // Check boundary limits for next tile
        const nextX = nextFrontTip.x;
        const nextY = nextFrontTip.y;
        
        if (currentTip.facing === 0 || currentTip.facing === 180) {
          if ((currentTip.facing === 0 && nextX > MAX_X) || (currentTip.facing === 180 && nextX < -MAX_X)) {
            // Start turn: use 2 vertical tiles for double row separation!
            vertStepsRemaining = 2;
            flowHoriz = currentTip.facing === 0 ? 180 : 0;
            if (currentTip.facing === 0) {
              currentTip = flowVert === 90 ? nextRightTip : nextLeftTip;
            } else {
              currentTip = flowVert === 90 ? nextLeftTip : nextRightTip;
            }
            vertStepsRemaining--;
          } else {
            currentTip = nextFrontTip;
          }
        } else {
          // We are moving vertically (facing 90 or 270)
          if (vertStepsRemaining > 0) {
            // 2nd vertical tile step
            currentTip = nextFrontTip;
            vertStepsRemaining--;
          } else {
            // Completed 2 vertical steps: turn horizontally back towards center!
            if (currentTip.facing === 90) {
               currentTip = flowHoriz === 0 ? nextLeftTip : nextRightTip;
            } else if (currentTip.facing === 270) {
               currentTip = flowHoriz === 0 ? nextRightTip : nextLeftTip;
            }
            
            if (nextY > MAX_Y) flowVert = 270;
            if (nextY < -MAX_Y) flowVert = 90;
          }
        }
      }

      if (branch === 'RIGHT') rightEndTip = currentTip;
      if (branch === 'LEFT') leftEndTip = currentTip;
    };

    layoutBranch(1, 'RIGHT', initialRightTip);
    layoutBranch(-1, 'LEFT', initialLeftTip);

    return { 
      layout: layout.filter(Boolean), 
      bounds: { minX, maxX, minY, maxY },
      openEnds: {
        RIGHT: { x: Math.round(rightEndTip.x * U), y: Math.round(rightEndTip.y * U) },
        LEFT: { x: Math.round(leftEndTip.x * U), y: Math.round(leftEndTip.y * U) },
      }
    };
  }, [tiles, containerWidth, containerHeight]);
}
