'use client';

import React, { useState } from 'react';
import { DominoTile as DominoTileType, PipValue } from '@baffa/shared';

interface DominoTileProps {
  tile: DominoTileType;
  isVertical?: boolean;
  isPlayable?: boolean;
  isSelected?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  onInvalidClick?: () => void;
  disabled?: boolean;
  isFaceDown?: boolean;
  className?: string;
}

export const DominoTile: React.FC<DominoTileProps> = ({
  tile,
  isVertical = true,
  isPlayable = false,
  isSelected = false,
  size = 'md',
  onClick,
  onInvalidClick,
  disabled = false,
  isFaceDown = false,
  className = '',
}) => {
  const [shaking, setShaking] = useState(false);
  const [pip1, pip2] = tile;

  const handleClick = () => {
    if (disabled) return;
    if (isPlayable) {
      onClick?.();
    } else {
      setShaking(true);
      onInvalidClick?.();
      setTimeout(() => setShaking(false), 400);
    }
  };

  // Dimensions based on size and orientation
  const sizeStyles = {
    xs: isVertical ? { width: '23px', height: '46px' } : { width: '46px', height: '23px' },
    sm: isVertical ? { width: '32px', height: '64px' } : { width: '64px', height: '32px' },
    md: isVertical ? { width: '44px', height: '88px' } : { width: '88px', height: '44px' },
    lg: isVertical ? { width: '56px', height: '112px' } : { width: '112px', height: '56px' },
  }[size];

  const renderPips = (value: PipValue) => {
    // 3x3 grid coordinates for standard domino dots
    const pipPositions: Record<PipValue, number[]> = {
      0: [],
      1: [4], // Center
      2: [0, 8], // Top-left, bottom-right
      3: [0, 4, 8], // Diagonal
      4: [0, 2, 6, 8], // 4 corners
      5: [0, 2, 4, 6, 8], // 4 corners + center
      6: [0, 2, 3, 5, 6, 8], // 2 columns of 3
    };

    const activeIndices = pipPositions[value] || [];

    const pipColors: Record<PipValue, string> = {
      0: 'transparent',
      1: '#2f6fb0', // Blue
      2: '#2f8f4e', // Green
      3: '#c0392b', // Red
      4: '#d4791d', // Orange
      5: '#1c1c1c', // Black
      6: '#7b3fa0', // Purple
    };

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          width: '100%',
          height: '100%',
          padding: size === 'xs' ? '1.5px' : size === 'sm' ? '3px' : '5px',
          boxSizing: 'border-box',
          alignItems: 'center',
          justifyItems: 'center',
        }}
      >
        {Array.from({ length: 9 }).map((_, idx) => (
          <div
            key={idx}
            style={{
              width: size === 'xs' ? '3.5px' : size === 'sm' ? '5px' : size === 'md' ? '7px' : '9px',
              height: size === 'xs' ? '3.5px' : size === 'sm' ? '5px' : size === 'md' ? '7px' : '9px',
              borderRadius: '50%',
              backgroundColor: activeIndices.includes(idx) ? pipColors[value] : 'transparent',
              boxShadow: activeIndices.includes(idx) ? 'inset 0 1px 1px rgba(0,0,0,0.4)' : 'none',
              transition: 'background-color 0.15s ease',
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      dir="ltr"
      onClick={handleClick}
      className={`${shaking ? 'animate-shake' : ''} ${className}`}
      style={{
        ...sizeStyles,
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        background: 'var(--baffa-domino-grad)',
        backgroundColor: 'var(--baffa-domino-bg)',
        borderRadius: size === 'xs' ? '4px' : size === 'sm' ? '6px' : '10px',
        border: isSelected
          ? '2px solid var(--baffa-gold-primary)'
          : isPlayable
          ? '2px solid rgba(245, 158, 11, 0.7)'
          : '1px solid var(--baffa-domino-border)',
        boxShadow: isSelected
          ? '0 0 16px var(--baffa-gold-glow), var(--baffa-domino-shadow)'
          : isPlayable
          ? '0 0 10px rgba(245, 158, 11, 0.4), var(--baffa-domino-shadow)'
          : 'var(--baffa-domino-shadow)',
        cursor: disabled || isFaceDown ? 'default' : isPlayable ? 'pointer' : 'default',
        transform: isSelected ? 'translateY(-8px) scale(1.04)' : isPlayable ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, border-color 0.2s ease',
        userSelect: 'none',
        touchAction: 'manipulation',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {isFaceDown ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--baffa-domino-bg)',
            borderRadius: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.05) 0px, rgba(245, 158, 11, 0.05) 10px, transparent 10px, transparent 20px)',
          }}
        >
          <span
            className="arabic-font"
            style={{
              color: 'rgba(245, 158, 11, 0.5)', // Muted gold
              fontSize: size === 'sm' ? '0.8rem' : size === 'md' ? '1.2rem' : '1.5rem',
              fontWeight: 900,
              transform: isVertical ? 'rotate(-90deg)' : 'none',
              opacity: 0.6,
            }}
          >
            بَفّة
          </span>
        </div>
      ) : (
        <>
          {/* Half 1 */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {renderPips(pip1)}
          </div>

          {/* Center Dividing Line & Brass Spinner */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: isVertical ? '100%' : '2px',
              height: isVertical ? '2px' : '100%',
              alignSelf: 'center',
              backgroundColor: '#b8a994',
              boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.2)',
            }}
          >
            {/* Brass Spinner Dot */}
            <div
              style={{
                position: 'absolute',
                width: size === 'sm' ? '5px' : '7px',
                height: size === 'sm' ? '5px' : '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--baffa-domino-spinner)',
                border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6)',
              }}
            />
          </div>

          {/* Half 2 */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {renderPips(pip2)}
          </div>
        </>
      )}
    </div>
  );
};
