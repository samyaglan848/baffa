'use client';

import React, { useState } from 'react';
import { User, Bot } from 'lucide-react';
import { getAvatarById, resolveAvatarUrl } from '../../constants/avatars';
import { BotId, OFFICIAL_BAFFA_BOTS } from '@baffa/shared';

export interface UserAvatarProps {
  avatar?: string | null;
  username?: string;
  size?: number;
  isBot?: boolean;
  botId?: BotId;
  border?: string;
  boxShadow?: string;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatar,
  username,
  size = 32,
  isBot = false,
  botId,
  border,
  boxShadow,
  borderRadius = '50%',
  className,
  style,
  title,
}) => {
  const [imgError, setImgError] = useState(false);
  const resolvedUrl = resolveAvatarUrl(avatar);

  // If bot entity
  const isBotEntity = isBot || Boolean(avatar && avatar.startsWith('bot-'));
  const botConfig = botId ? OFFICIAL_BAFFA_BOTS[botId] : undefined;

  const containerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
    border: border || 'none',
    boxShadow: boxShadow || 'none',
    position: 'relative',
    userSelect: 'none',
    ...style,
  };

  // Case 1: Custom Image (Uploaded or Google photo URL)
  if (resolvedUrl && !imgError) {
    return (
      <div style={containerStyle} className={className} title={title || username || 'الصورة الشخصية'}>
        <img
          src={resolvedUrl}
          alt={username || 'Avatar'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Case 2: Bot
  if (isBotEntity) {
    const iconSize = Math.max(12, Math.round(size * 0.52));
    return (
      <div
        style={{
          ...containerStyle,
          backgroundColor: 'rgba(6, 182, 212, 0.15)',
          color: 'var(--baffa-cyan-primary)',
        }}
        className={className}
        title={title || botConfig?.arabicName || username || 'بوت'}
      >
        <Bot size={iconSize} />
      </div>
    );
  }

  // Case 3: Catalog Preset Avatar (avatar-1 ... avatar-12 or 1 ... 12)
  const isCatalogAvatar = Boolean(
    avatar &&
    (avatar.startsWith('avatar-') ||
     !isNaN(Number(avatar)) ||
     ['doctor','basha','maalem','captain','prince','osta','joker','maleka','hanem','general','fannan','saqr'].includes(avatar))
  );

  if (isCatalogAvatar) {
    const catalogItem = getAvatarById(avatar);
    const fontSize = Math.max(12, Math.round(size * 0.52));
    return (
      <div
        style={{
          ...containerStyle,
          backgroundColor: `${catalogItem.color}22`,
          color: catalogItem.color,
        }}
        className={className}
        title={title || catalogItem.titleAr || username}
      >
        <span style={{ fontSize: `${fontSize}px`, lineHeight: 1 }}>{catalogItem.emoji}</span>
      </div>
    );
  }

  // Case 4: Default Fallback User Icon
  const iconSize = Math.max(12, Math.round(size * 0.52));
  return (
    <div
      style={{
        ...containerStyle,
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
        color: 'var(--baffa-gold-primary)',
      }}
      className={className}
      title={title || username || 'لاعب'}
    >
      <User size={iconSize} />
    </div>
  );
};
