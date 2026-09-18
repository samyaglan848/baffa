'use client';

import React from 'react';
import { SanitizedPlayerState, TeamId } from '@baffa/shared';
import { Bot, User, ShieldAlert } from 'lucide-react';
import { UserAvatar } from '../common/UserAvatar';

interface PlayerSeatBadgeProps {
  player?: SanitizedPlayerState;
  seatPosition: 'South' | 'East' | 'North' | 'West';
  isCurrentTurn: boolean;
  isMyPlayer: boolean;
}

export const PlayerSeatBadge: React.FC<PlayerSeatBadgeProps> = ({
  player,
  seatPosition,
  isCurrentTurn,
  isMyPlayer,
}) => {
  if (!player) {
    return (
      <div
        style={{
          padding: '8px 16px',
          borderRadius: 'var(--baffa-radius-md)',
          backgroundColor: 'var(--baffa-bg-elevated)',
          border: '1px dashed var(--baffa-surface-glass-border)',
          color: 'var(--baffa-text-muted)',
          fontSize: '0.85rem',
          textAlign: 'center',
        }}
      >
        Seat {seatPosition} (Empty)
      </div>
    );
  }

  const isTeam1 = player.team === 1;
  const teamColor = isTeam1 ? 'var(--baffa-team1-color)' : 'var(--baffa-team2-color)';
  const teamBg = isTeam1 ? 'var(--baffa-team1-bg)' : 'var(--baffa-team2-bg)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        borderRadius: 'var(--baffa-radius-lg)',
        backgroundColor: isCurrentTurn ? 'rgba(245, 158, 11, 0.15)' : 'var(--baffa-bg-elevated)',
        border: isCurrentTurn ? '2px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
        boxShadow: isCurrentTurn ? 'var(--baffa-shadow-glow-gold)' : 'none',
        position: 'relative',
        transition: 'all var(--baffa-transition-fast)',
      }}
    >
      {/* Team Ribbon */}
      <div
        style={{
          position: 'absolute',
          top: '-8px',
          right: '12px',
          backgroundColor: teamColor,
          color: '#fff',
          fontSize: '0.65rem',
          padding: '2px 6px',
          borderRadius: 'var(--baffa-radius-sm)',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Team {player.team}
      </div>

      {/* Avatar Icon */}
      <div
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          backgroundColor: teamBg,
          color: teamColor,
          border: `2px solid ${teamColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <UserAvatar
          avatar={player.avatar}
          username={player.username}
          isBot={player.isBot}
          botId={player.botId}
          size={38}
        />
      </div>

      {/* Name and Tile Count */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--baffa-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100px',
            }}
          >
            {player.username}
          </span>
          {isMyPlayer && (
            <span
              style={{
                fontSize: '0.65rem',
                backgroundColor: 'var(--baffa-gold-muted)',
                color: 'var(--baffa-gold-primary)',
                padding: '1px 4px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              YOU
            </span>
          )}
        </div>

        {/* Hidden Tiles Count Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '0.75rem',
              color: 'var(--baffa-text-secondary)',
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: '0.9rem' }}>🀰</span>
            <span>{player.hiddenTilesCount} tiles</span>
          </div>

          {/* Last Action Label */}
          {player.lastAction && (
            <span
              className="arabic-font"
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: player.lastAction === 'PASS' ? 'var(--baffa-warning)' : 'var(--baffa-success)',
              }}
            >
              {player.lastAction === 'PASS' ? 'فوت' : 'لعب'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
