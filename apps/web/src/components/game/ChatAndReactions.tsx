import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import {
  BotChatMessage,
  ClientEvents,
  EmoteReactionBroadcastPayload,
  PlayerSeat,
  QuickChatBroadcastPayload,
  SanitizedPlayerState,
  ServerEvents,
} from '@baffa/shared';
import { MessageSquare, MessageSquareOff, Smile, X } from 'lucide-react';
import { useGameAudio } from '../../hooks/useGameAudio';

const QUICK_CHATS = [
  'يلا بينا 🔥',
  'ركز يا زميل 😂',
  'فوت؟ 😏',
  'الدوش يا رجالة 🎲',
  'براحة يا معلم 😎',
  'إيه اللعب ده 😂',
  'أنا شايفك 👀',
  'استنى دورك ⏳',
  'كده تمام 👌',
  'يا نهار أبيض 😱',
  'هنكسبها إن شاء الله 🏆',
  'ركز يا خصم 😎',
];

const EMOJIS = ['😂', '😎', '😏', '🤣', '🔥', '💀', '😭', '❤️', '👏', '👑', '🤦', '😮'];

interface ActiveChat {
  id: string;
  userId: string;
  senderName: string;
  text: string;
  seat?: number | null;
  createdAt: number;
}

interface ActiveReaction {
  id: string;
  userId: string;
  senderName: string;
  emoji: string;
  seat?: number | null;
  createdAt: number;
}

interface ChatAndReactionsProps {
  socket: Socket | null;
  roomId: string;
  myUserId: string;
  quickChatEnabled: boolean;
  reactionsEnabled: boolean;
  isChatMuted?: boolean;
  isReactionsMuted?: boolean;
  players?: SanitizedPlayerState[];
  mySeat?: PlayerSeat | null;
  isMobile?: boolean;
  isLandscape?: boolean;
}

export const ChatAndReactions: React.FC<ChatAndReactionsProps> = ({
  socket,
  roomId,
  myUserId,
  quickChatEnabled,
  reactionsEnabled,
  isChatMuted = false,
  isReactionsMuted = false,
  players = [],
  mySeat = null,
  isMobile = false,
  isLandscape = false,
}) => {
  const { playSound } = useGameAudio();
  const [isOpen, setIsOpen] = useState(false);
  const [activeChats, setActiveChats] = useState<ActiveChat[]>([]);
  const [activeReactions, setActiveReactions] = useState<ActiveReaction[]>([]);

  // Relative seat calculation for visual positioning on the felt table
  const getRelativeSeat = useCallback(
    (targetSeat: number | null | undefined): 'BOTTOM' | 'TOP' | 'LEFT' | 'RIGHT' => {
      if (targetSeat === null || targetSeat === undefined) return 'BOTTOM';
      const base = mySeat !== null && mySeat !== undefined ? Number(mySeat) : 0;
      const diff = (Number(targetSeat) - base + 4) % 4;
      switch (diff) {
        case 0:
          return 'BOTTOM'; // Me (South)
        case 1:
          return 'RIGHT'; // Right Opponent (East in RTL visual grid)
        case 2:
          return 'TOP'; // Partner (North)
        case 3:
          return 'LEFT'; // Left Opponent (West)
        default:
          return 'BOTTOM';
      }
    },
    [mySeat]
  );

  useEffect(() => {
    if (!socket) return;

    const onQuickChat = (payload: QuickChatBroadcastPayload) => {
      // Avoid duplicate display if already added optimistically for local user
      if (payload.userId === myUserId) return;

      const text = QUICK_CHATS.find((c) => c === payload.messageId) || payload.messageId;
      const id = `${payload.userId}-${payload.timestamp}`;
      const senderPlayer = players.find(
        (p) =>
          p.playerId === payload.userId ||
          (payload.seat !== undefined && payload.seat !== null && Number(p.seat) === Number(payload.seat))
      );
      const senderName = payload.senderName || senderPlayer?.username || 'لاعب';
      const seat =
        payload.seat !== undefined && payload.seat !== null
          ? Number(payload.seat)
          : senderPlayer
          ? Number(senderPlayer.seat)
          : null;

      setActiveChats((prev) => [...prev, { id, userId: payload.userId, senderName, text, seat, createdAt: payload.timestamp }]);
      playSound('pop');
      setTimeout(() => {
        setActiveChats((prev) => prev.filter((c) => c.id !== id));
      }, 4600);
    };

    const onReaction = (payload: EmoteReactionBroadcastPayload) => {
      // Avoid duplicate display if already added optimistically for local user
      if (payload.userId === myUserId) return;

      const id = `${payload.userId}-${payload.timestamp}`;
      const senderPlayer = players.find(
        (p) =>
          p.playerId === payload.userId ||
          (payload.seat !== undefined && payload.seat !== null && Number(p.seat) === Number(payload.seat))
      );
      const senderName = payload.senderName || senderPlayer?.username || 'لاعب';
      const seat =
        payload.seat !== undefined && payload.seat !== null
          ? Number(payload.seat)
          : senderPlayer
          ? Number(senderPlayer.seat)
          : null;

      setActiveReactions((prev) => [
        ...prev,
        { id, userId: payload.userId, senderName, emoji: payload.emoji, seat, createdAt: payload.timestamp },
      ]);
      playSound('pop');
      setTimeout(() => {
        setActiveReactions((prev) => prev.filter((r) => r.id !== id));
      }, 4600);
    };

    const onBotMessage = (payload: BotChatMessage) => {
      const id = `bot-${payload.botId}-${payload.timestamp}`;
      setActiveChats((prev) => [
        ...prev,
        {
          id,
          userId: `bot_${payload.seat}`,
          senderName: payload.botName,
          text: payload.text,
          seat: payload.seat,
          createdAt: payload.timestamp,
        },
      ]);
      playSound('pop');
      setTimeout(() => {
        setActiveChats((prev) => prev.filter((c) => c.id !== id));
      }, 5500);
    };

    socket.on(ServerEvents.BOT_MESSAGE, onBotMessage);
    socket.on(ServerEvents.QUICK_CHAT_BROADCAST, onQuickChat);
    socket.on(ServerEvents.EMOTE_REACTION_BROADCAST, onReaction);

    return () => {
      socket.off(ServerEvents.BOT_MESSAGE, onBotMessage);
      socket.off(ServerEvents.QUICK_CHAT_BROADCAST, onQuickChat);
      socket.off(ServerEvents.EMOTE_REACTION_BROADCAST, onReaction);
    };
  }, [socket, myUserId, players, playSound]);

  const handleSendChat = (text: string) => {
    if (!quickChatEnabled) {
      alert('الشات محظور في هذه الغرفة من إعدادات الأدمن 🚫');
      return;
    }
    const myPlayer = players.find(
      (p) => p.playerId === myUserId || (mySeat !== null && mySeat !== undefined && Number(p.seat) === Number(mySeat))
    );
    if (isChatMuted || myPlayer?.isChatMuted) {
      alert('الشات محظور عنك حالياً بقرار من حكم المباراة ⚖️');
      return;
    }
    const timestamp = Date.now();
    const id = `${myUserId}-${timestamp}`;
    const senderName = myPlayer?.username || 'أنت';
    const seat = mySeat !== null && mySeat !== undefined ? Number(mySeat) : myPlayer ? Number(myPlayer.seat) : 0;

    // Instant optimistic display on local screen
    setActiveChats((prev) => [...prev, { id, userId: myUserId, senderName, text, seat, createdAt: timestamp }]);
    playSound('pop');
    setTimeout(() => {
      setActiveChats((prev) => prev.filter((c) => c.id !== id));
    }, 4600);

    if (socket) {
      socket.emit(ClientEvents.QUICK_CHAT, { roomId, messageId: text });
    }
    setIsOpen(false);
  };

  const handleSendReaction = (emoji: string) => {
    if (!reactionsEnabled) {
      alert('التفاعلات محظورة في هذه الغرفة من إعدادات الأدمن 🚫');
      return;
    }
    const myPlayer = players.find(
      (p) => p.playerId === myUserId || (mySeat !== null && mySeat !== undefined && Number(p.seat) === Number(mySeat))
    );
    if (isReactionsMuted || myPlayer?.isReactionsMuted) {
      alert('التفاعلات محظورة عنك حالياً بقرار من حكم المباراة ⚖️');
      return;
    }
    const timestamp = Date.now();
    const id = `${myUserId}-${timestamp}`;
    const senderName = myPlayer?.username || 'أنت';
    const seat = mySeat !== null && mySeat !== undefined ? Number(mySeat) : myPlayer ? Number(myPlayer.seat) : 0;

    // Instant optimistic display on local screen
    setActiveReactions((prev) => [...prev, { id, userId: myUserId, senderName, emoji, seat, createdAt: timestamp }]);
    playSound('pop');
    setTimeout(() => {
      setActiveReactions((prev) => prev.filter((r) => r.id !== id));
    }, 4600);

    if (socket) {
      socket.emit(ClientEvents.EMOTE_REACTION, { roomId, emoji });
    }
    setIsOpen(false);
  };

  const getPositionStyles = (
    seat: number | null | undefined
  ): { containerStyle: React.CSSProperties; tailStyle?: React.CSSProperties } => {
    const rel = getRelativeSeat(seat);
    switch (rel) {
      case 'BOTTOM':
        return {
          containerStyle: {
            bottom: isLandscape ? '44px' : isMobile ? '68px' : '85px',
            left: '50%',
            transform: 'translateX(-50%)',
          },
          tailStyle: {
            position: 'absolute',
            bottom: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '6px solid var(--baffa-gold-primary)',
          },
        };
      case 'TOP':
        return {
          containerStyle: {
            top: isLandscape ? '44px' : isMobile ? '56px' : '72px',
            left: '50%',
            transform: 'translateX(-50%)',
          },
          tailStyle: {
            position: 'absolute',
            top: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: '6px solid var(--baffa-gold-primary)',
          },
        };
      case 'RIGHT':
        return {
          containerStyle: {
            top: '50%',
            right: isLandscape ? '44px' : isMobile ? '46px' : '72px',
            transform: 'translateY(-50%)',
          },
          tailStyle: {
            position: 'absolute',
            top: '50%',
            right: '-6px',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderLeft: '6px solid var(--baffa-gold-primary)',
          },
        };
      case 'LEFT':
        return {
          containerStyle: {
            top: '50%',
            left: isLandscape ? '44px' : isMobile ? '46px' : '72px',
            transform: 'translateY(-50%)',
          },
          tailStyle: {
            position: 'absolute',
            top: '50%',
            left: '-6px',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderRight: '6px solid var(--baffa-gold-primary)',
          },
        };
      default:
        return {
          containerStyle: {
            bottom: isLandscape ? '44px' : isMobile ? '68px' : '85px',
            left: '50%',
            transform: 'translateX(-50%)',
          },
        };
    }
  };

  return (
    <>
      {/* Floating Chat & Emoji Toggle Button */}
      <div style={{ position: 'absolute', bottom: isLandscape ? '8px' : isMobile ? '12px' : '22px', left: isLandscape ? '8px' : isMobile ? '12px' : '22px', zIndex: 60 }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: isLandscape ? '34px' : isMobile ? '38px' : '46px',
            height: isLandscape ? '34px' : isMobile ? '38px' : '46px',
            borderRadius: '50%',
            backgroundColor: isOpen
              ? 'var(--baffa-gold-primary)'
              : (!quickChatEnabled && !reactionsEnabled) || (isChatMuted && isReactionsMuted)
              ? 'rgba(239, 68, 68, 0.2)'
              : '#ffffff',
            color: isOpen
              ? '#000'
              : (!quickChatEnabled && !reactionsEnabled) || (isChatMuted && isReactionsMuted)
              ? '#fca5a5'
              : '#d97706',
            border: (!quickChatEnabled && !reactionsEnabled) || (isChatMuted && isReactionsMuted)
              ? '2px solid rgba(239, 68, 68, 0.6)'
              : '2px solid var(--baffa-gold-primary)',
            boxShadow: '0 4px 18px rgba(6, 182, 212, 0.25), 0 2px 8px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          title={
            isOpen
              ? 'إغلاق'
              : !quickChatEnabled && !reactionsEnabled
              ? 'الدردشة والتفاعلات محظورة 🚫'
              : isChatMuted && isReactionsMuted
              ? 'الدردشة محظورة بقرار الحكم ⚖️'
              : 'الرسائل والتفاعلات'
          }
        >
          {isOpen ? (
            <X size={isLandscape ? 17 : isMobile ? 19 : 22} />
          ) : (!quickChatEnabled && !reactionsEnabled) || (isChatMuted && isReactionsMuted) ? (
            <MessageSquareOff size={isLandscape ? 17 : isMobile ? 19 : 22} />
          ) : quickChatEnabled ? (
            <MessageSquare size={isLandscape ? 17 : isMobile ? 19 : 22} />
          ) : (
            <Smile size={isLandscape ? 17 : isMobile ? 19 : 22} />
          )}
        </button>
      </div>

      {/* Chat & Emoji Menu Popup */}
      {isOpen && (
        <div
          className="animate-float"
          style={{
            position: 'absolute',
            bottom: isLandscape ? '46px' : isMobile ? '56px' : '76px',
            left: isLandscape ? '8px' : isMobile ? '12px' : '22px',
            width: isLandscape ? '280px' : isMobile ? '280px' : '320px',
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(16px)',
            borderRadius: isMobile ? '18px' : '24px',
            border: '2px solid #f59e0b',
            padding: isLandscape ? '10px' : isMobile ? '12px' : '18px',
            boxShadow: '0 12px 40px rgba(6, 182, 212, 0.25), 0 0 25px rgba(245, 158, 11, 0.25)',
            zIndex: 65,
            display: 'flex',
            flexDirection: 'column',
            gap: isLandscape ? '8px' : isMobile ? '10px' : '16px',
            maxHeight: isLandscape ? '75vh' : '65vh',
            overflowY: 'auto',
          }}
        >
          {/* Emojis / Reactions Section */}
          <div>
            <div
              className="arabic-font"
              style={{
                fontSize: isLandscape ? '0.78rem' : isMobile ? '0.8rem' : '0.85rem',
                fontWeight: 800,
                color: !reactionsEnabled || isReactionsMuted ? '#f87171' : 'var(--baffa-gold-primary)',
                marginBottom: isMobile ? '6px' : '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smile size={isMobile ? 14 : 16} />
                <span>إيموجيز وتفاعلات</span>
              </div>
              {!reactionsEnabled ? (
                <span style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 700 }}>
                  (محظور من الأدمن 🚫)
                </span>
              ) : isReactionsMuted ? (
                <span style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 700 }}>
                  (محظور بقرار الحكم ⚖️)
                </span>
              ) : null}
            </div>

            {!reactionsEnabled ? (
              <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', fontSize: '0.78rem', textAlign: 'center' }}>
                تم تعطيل التفاعلات في هذه الغرفة من إعدادات الأدمن 🚫
              </div>
            ) : isReactionsMuted ? (
              <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', fontSize: '0.78rem', textAlign: 'center' }}>
                تم حظر إرسال التفاعلات عنك بقرار من حكم المباراة ⚖️
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: isMobile ? '6px' : '8px' }}>
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendReaction(emoji)}
                    style={{
                      fontSize: isMobile ? '1.35rem' : '1.7rem',
                      padding: isMobile ? '5px' : '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      borderRadius: isMobile ? '10px' : '14px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.22)';
                      e.currentTarget.style.borderColor = 'var(--baffa-gold-primary)';
                      e.currentTarget.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Chat Section */}
          <div>
            <div
              className="arabic-font"
              style={{
                fontSize: isLandscape ? '0.78rem' : isMobile ? '0.8rem' : '0.85rem',
                fontWeight: 800,
                color: !quickChatEnabled || isChatMuted ? '#f87171' : 'var(--baffa-gold-primary)',
                marginBottom: isMobile ? '6px' : '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={isMobile ? 14 : 16} />
                <span>رسائل سريعة</span>
              </div>
              {!quickChatEnabled ? (
                <span style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 700 }}>
                  (محظور من الأدمن 🚫)
                </span>
              ) : isChatMuted ? (
                <span style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 700 }}>
                  (محظور بقرار الحكم ⚖️)
                </span>
              ) : null}
            </div>

            {!quickChatEnabled ? (
              <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', fontSize: '0.78rem', textAlign: 'center' }}>
                تم تعطيل الشات في هذه الغرفة من إعدادات الأدمن 🚫
              </div>
            ) : isChatMuted ? (
              <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', fontSize: '0.78rem', textAlign: 'center' }}>
                تم حظر إرسال الرسائل عنك بقرار من حكم المباراة ⚖️
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '4px' : '6px' }}>
                {QUICK_CHATS.map((chat) => (
                  <button
                    key={chat}
                    onClick={() => handleSendChat(chat)}
                    className="arabic-font"
                    style={{
                      textAlign: 'right',
                      padding: isLandscape ? '5px 8px' : isMobile ? '6px 10px' : '9px 14px',
                      backgroundColor: '#f8fafc',
                      color: '#0f172a',
                      borderRadius: isMobile ? '8px' : '12px',
                      border: '1px solid rgba(6, 182, 212, 0.25)',
                      fontSize: isLandscape ? '0.75rem' : isMobile ? '0.78rem' : '0.9rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--baffa-gold-primary)';
                      e.currentTarget.style.color = '#d97706';
                      e.currentTarget.style.backgroundColor = 'rgba(254, 243, 199, 0.9)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.25)';
                      e.currentTarget.style.color = '#0f172a';
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                  >
                    {chat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENDER ACTIVE CHATS & REACTIONS ANCHORED BESIDE SENDER BADGE WITHOUT REPEATING NAME */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 75, overflow: 'hidden' }}>
        {activeChats.map((chat) => {
          const { containerStyle, tailStyle } = getPositionStyles(chat.seat);
          return (
            <div
              key={chat.id}
              className="animate-bubble-life arabic-font"
              style={{
                position: 'absolute',
                ...containerStyle,
                padding: isLandscape ? '3px 8px' : isMobile ? '4px 10px' : '6px 14px',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                border: '2px solid #f59e0b',
                borderRadius: isLandscape ? '12px' : isMobile ? '14px' : '18px',
                boxShadow: '0 8px 30px rgba(6, 182, 212, 0.3), 0 2px 8px rgba(0,0,0,0.1)',
                backdropFilter: 'blur(10px)',
                maxWidth: isLandscape ? '140px' : isMobile ? '160px' : '220px',
                textAlign: 'center',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 80,
              }}
            >
              {tailStyle && <div style={tailStyle} />}
              <span
                style={{
                  fontSize: isLandscape ? '0.72rem' : isMobile ? '0.78rem' : '0.9rem',
                  fontWeight: 900,
                  color: '#0f172a',
                  textAlign: 'center',
                  lineHeight: 1.25,
                  wordBreak: 'break-word',
                }}
              >
                {chat.text}
              </span>
            </div>
          );
        })}

        {activeReactions.map((reaction) => {
          const { containerStyle } = getPositionStyles(reaction.seat);
          return (
            <div
              key={reaction.id}
              className="animate-emoji-life"
              style={{
                position: 'absolute',
                ...containerStyle,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 80,
              }}
            >
              <span
                style={{
                  fontSize: isLandscape ? '1.8rem' : isMobile ? '2.1rem' : '2.8rem',
                  filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.85)) drop-shadow(0 0 14px rgba(245, 158, 11, 0.45))',
                  lineHeight: 1,
                  display: 'inline-block',
                }}
              >
                {reaction.emoji}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
};
