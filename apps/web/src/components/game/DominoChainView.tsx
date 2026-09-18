'use client';

import React, { useRef, useEffect } from 'react';
import { BoardTilePlacement, ChainEnd, DominoChainState, DominoTile as DominoTileType } from '@baffa/shared';
import { DominoTile } from '../common/DominoTile';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DominoChainViewProps {
  chain: DominoChainState;
  selectedTile: DominoTileType | null;
  validEndsForSelected: ChainEnd[];
  onPlaceAtEnd: (end: ChainEnd) => void;
}

export const DominoChainView: React.FC<DominoChainViewProps> = ({
  chain,
  selectedTile,
  validEndsForSelected,
  onPlaceAtEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to center whenever a tile is placed
  useEffect(() => {
    if (containerRef.current) {
      const scrollWidth = containerRef.current.scrollWidth;
      const clientWidth = containerRef.current.clientWidth;
      containerRef.current.scrollTo({
        left: (scrollWidth - clientWidth) / 2,
        behavior: 'smooth',
      });
    }
  }, [chain.tiles.length]);

  const showLeftTarget = selectedTile !== null && validEndsForSelected.includes('LEFT');
  const showRightTarget = selectedTile !== null && validEndsForSelected.includes('RIGHT');

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: chain.tiles.length === 0 ? 'center' : 'flex-start',
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '24px 36px',
        boxSizing: 'border-box',
        gap: '6px',
        scrollBehavior: 'smooth',
      }}
    >
      {/* Empty Board State */}
      {chain.tiles.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--baffa-text-muted)',
            padding: '20px',
            borderRadius: 'var(--baffa-radius-lg)',
            border: '2px dashed rgba(245, 158, 11, 0.25)',
            backgroundColor: 'rgba(10, 27, 24, 0.5)',
          }}
        >
          <span
            className="arabic-font"
            style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--baffa-gold-primary)' }}
          >
            طاولة اللعب
          </span>
          <span style={{ fontSize: '0.85rem', marginTop: '4px' }}>
            First round starts with 6|6
          </span>
        </div>
      )}

      {/* Left Placement Drop Indicator */}
      {showLeftTarget && (
        <button
          onClick={() => onPlaceAtEnd('LEFT')}
          style={{
            minWidth: '68px',
            height: '40px',
            borderRadius: 'var(--baffa-radius-md)',
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            border: '2px dashed var(--baffa-gold-primary)',
            color: 'var(--baffa-gold-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            cursor: 'pointer',
            flexShrink: 0,
            animation: 'turn-glow 1.5s infinite',
            fontWeight: 700,
            fontSize: '0.8rem',
          }}
        >
          <ChevronLeft size={16} /> Place
        </button>
      )}

      {/* Chain Tiles */}
      {chain.tiles.map((item: BoardTilePlacement, idx: number) => {
        // Render doubles vertically for classic domino aesthetics, standard tiles horizontally
        const isVert = item.isDouble;
        return (
          <div
            key={`chain-${idx}-${item.order}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <DominoTile
              tile={item.tile}
              isVertical={isVert}
              size="sm"
              disabled
            />
          </div>
        );
      })}

      {/* Right Placement Drop Indicator */}
      {showRightTarget && (
        <button
          onClick={() => onPlaceAtEnd('RIGHT')}
          style={{
            minWidth: '68px',
            height: '40px',
            borderRadius: 'var(--baffa-radius-md)',
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            border: '2px dashed var(--baffa-gold-primary)',
            color: 'var(--baffa-gold-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            cursor: 'pointer',
            flexShrink: 0,
            animation: 'turn-glow 1.5s infinite',
            fontWeight: 700,
            fontSize: '0.8rem',
          }}
        >
          Place <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
};
