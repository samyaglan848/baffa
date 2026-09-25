'use client';

import React, { useState, useEffect } from 'react';
import { Play, PlusCircle, LogIn, BookOpen, ShieldCheck, UserCheck, Gavel, Eye, ShieldAlert, WifiOff, Cpu, Bot, Radio, X } from 'lucide-react';
import { JoinRoomModal } from '../room/JoinRoomModal';
import { AuthModal } from '../auth/AuthModal';
import { RoomSettings, UserRole } from '@baffa/shared';
import { DominoTile } from '../common/DominoTile';
import { CurrentUser } from '../../hooks/useGameSocket';

interface HomeScreenProps {
  currentUser: CurrentUser;
  onCreateRoom: (name: string, settings: Partial<RoomSettings>, initialRole?: UserRole) => void;
  onJoinRoom: (code: string) => void;
  onJoinAsJudge: (code: string) => void;
  onJoinAsSpectator: (code: string) => void;
  onQuickPlay: () => void;
  onAuthSuccess: (user: CurrentUser, token: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  currentUser,
  onCreateRoom,
  onJoinRoom,
  onJoinAsJudge,
  onJoinAsSpectator,
  onQuickPlay,
  onAuthSuccess,
}) => {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [joinRole, setJoinRole] = useState<'PLAYER' | 'JUDGE' | 'SPECTATOR'>('PLAYER');

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleJoinSubmit = (code: string) => {
    if (joinRole === 'JUDGE') {
      onJoinAsJudge(code);
    } else if (joinRole === 'SPECTATOR') {
      onJoinAsSpectator(code);
    } else {
      onJoinRoom(code);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '20px 12px' : '36px 20px',
        maxWidth: '1180px',
        margin: '0 auto',
        width: '100%',
        position: 'relative',
      }}
    >
      {/* Hero Brand Section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          marginBottom: isMobile ? '24px' : '42px',
          position: 'relative',
        }}
      >
        {/* Background Ambient Radial Spotlight */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: isMobile ? '260px' : '380px',
            height: isMobile ? '180px' : '240px',
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, rgba(6, 9, 14, 0) 70%)',
            filter: 'blur(30px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Master Luxury 3D Brand Badge */}
        <div
          className="animate-float"
          style={{
            width: isMobile ? '68px' : '92px',
            height: isMobile ? '68px' : '92px',
            borderRadius: isMobile ? '18px' : '26px',
            background: 'linear-gradient(145deg, var(--baffa-gold-hover) 0%, var(--baffa-gold-primary) 50%, var(--baffa-gold-dark) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 32px rgba(245, 197, 24, 0.55), inset 0 2px 2px rgba(255, 255, 255, 0.8), inset 0 -3px 6px rgba(26, 26, 26, 0.4)',
            marginBottom: isMobile ? '12px' : '20px',
            border: '2px solid var(--baffa-gold-frame)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Subtle Metallic Sheen */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '-50%',
              width: '200%',
              height: '100%',
              background: 'linear-gradient(60deg, transparent 40%, rgba(255, 255, 255, 0.4) 50%, transparent 60%)',
              pointerEvents: 'none',
            }}
          />
          <span
            style={{
              fontSize: isMobile ? '2.4rem' : '3.2rem',
              fontWeight: 900,
              fontFamily: 'var(--baffa-font-sans), sans-serif',
              color: 'var(--baffa-black)',
              lineHeight: 1,
              letterSpacing: '-1px',
              textShadow: '0 1px 1px rgba(255, 255, 255, 0.5)',
              transform: 'translateY(-1px)',
              userSelect: 'none',
            }}
          >
            B
          </span>
        </div>

        <h1
          style={{
            fontSize: isMobile ? '2.5rem' : 'clamp(2.6rem, 5.5vw, 4.2rem)',
            fontWeight: 900,
            letterSpacing: isMobile ? '2px' : '4px',
            color: 'var(--baffa-black)',
            margin: 0,
            lineHeight: 1.1,
            zIndex: 1,
            textShadow: '0 2px 10px rgba(217, 164, 4, 0.15)',
          }}
        >
          BAFFA
        </h1>

        <p
          className="arabic-font"
          style={{
            fontSize: isMobile ? '1.15rem' : '1.4rem',
            color: 'var(--baffa-gold-dark)',
            marginTop: '6px',
            fontWeight: 900,
            zIndex: 1,
          }}
        >
          نفس القعدة.. نفس الدومينو
        </p>

        <p
          className="arabic-font"
          style={{
            fontSize: isMobile ? '0.88rem' : '1.05rem',
            color: 'var(--baffa-text-secondary)',
            maxWidth: '620px',
            marginTop: '8px',
            lineHeight: 1.6,
            zIndex: 1,
            padding: '0 8px',
          }}
        >
          العب 2 ضد 2 مع صحابك أونلاين، اتكلموا كأنكم عالقهوة، والعبوا ضد بوتات مصرية فاهمة اللعبة.. من غير غش ولا لعب من تحت الترابيزة. 😎
        </p>

        {/* 3D Tactile Domino Showcase Strip */}
        <div
          style={{
            display: 'flex',
            gap: isMobile ? '8px' : '14px',
            marginTop: isMobile ? '14px' : '22px',
            padding: isMobile ? '8px 16px' : '12px 24px',
            borderRadius: 'var(--baffa-radius-full)',
            backgroundColor: '#ffffff',
            border: '2px solid var(--baffa-gold-frame)',
            boxShadow: '0 8px 24px rgba(184, 134, 11, 0.15), 0 2px 6px rgba(0, 0, 0, 0.04)',
            zIndex: 1,
          }}
        >
          <DominoTile tile={[6, 6]} size={isMobile ? 'xs' : 'sm'} isVertical={false} disabled />
          <DominoTile tile={[6, 5]} size={isMobile ? 'xs' : 'sm'} isVertical={true} disabled />
          <DominoTile tile={[5, 5]} size={isMobile ? 'xs' : 'sm'} isVertical={false} disabled />
          <DominoTile tile={[5, 4]} size={isMobile ? 'xs' : 'sm'} isVertical={true} disabled />
        </div>
      </div>

      {/* Main Action Cards Grid (3D Glassmorphism) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: isMobile ? '14px' : '24px',
          width: '100%',
          maxWidth: '960px',
          zIndex: 1,
        }}
      >
        {/* 1. Quick Play (Primary Golden CTA with Deep Emerald Badge) */}
        <div
          onClick={onQuickPlay}
          className="baffa-card"
          style={{
            padding: isMobile ? '18px 16px' : '30px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            cursor: 'pointer',
            border: '2px solid var(--baffa-gold-frame)',
            boxShadow: '0 8px 30px rgba(184, 134, 11, 0.18), var(--baffa-shadow-elevated)',
            background: 'linear-gradient(170deg, #ffffff 0%, #fffef8 60%, var(--baffa-gold-hover) 100%)',
            transition: 'all 0.25s ease',
            position: 'relative',
            overflow: 'hidden',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-6px)';
            e.currentTarget.style.borderColor = 'var(--baffa-gold-primary)';
            e.currentTarget.style.boxShadow = '0 0 35px rgba(245, 197, 24, 0.45)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'var(--baffa-gold-frame)';
            e.currentTarget.style.boxShadow = '0 8px 30px rgba(184, 134, 11, 0.18), var(--baffa-shadow-elevated)';
          }}
        >
          {/* Top Pill Tag in Deep Emerald (#0F6B4C) for Instant/Active */}
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--baffa-success)',
              color: '#ffffff',
              fontSize: '0.65rem',
              fontWeight: 900,
              boxShadow: '0 2px 6px rgba(15, 107, 76, 0.35)',
            }}
          >
            بدون انتظار • فوري
          </div>

          <div
            style={{
              width: isMobile ? '46px' : '60px',
              height: isMobile ? '46px' : '60px',
              borderRadius: '50%',
              backgroundColor: 'var(--baffa-gold-primary)',
              color: 'var(--baffa-black)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: isMobile ? '10px' : '16px',
              boxShadow: '0 4px 16px rgba(217, 164, 4, 0.4)',
              border: '1.5px solid var(--baffa-gold-frame)',
            }}
          >
            <Play size={isMobile ? 22 : 30} fill="var(--baffa-black)" />
          </div>

          <h2
            className="arabic-font"
            style={{ fontSize: isMobile ? '1.3rem' : '1.6rem', fontWeight: 900, color: 'var(--baffa-black)', margin: 0 }}
          >
            لعب سريع
          </h2>
          <span style={{ fontSize: isMobile ? '0.82rem' : '0.95rem', fontWeight: 700, color: 'var(--baffa-gold-dark)', marginTop: '2px' }}>
            Quick Play with Bots
          </span>
          <p style={{ fontSize: isMobile ? '0.78rem' : '0.82rem', color: 'var(--baffa-text-secondary)', marginTop: isMobile ? '6px' : '10px', lineHeight: 1.5 }}>
            ابدأ ماتش 2v2 فوراً مع أذكى البوتات المصرية (السامي، القط، رقم واحد في العزبة) بروح القهوة.
          </p>
        </div>

        {/* 2. Create Room */}
        <div
          onClick={() => {
            onCreateRoom(
              'قعدة بَفّة المعلمين 🎴',
              {
                targetScore: 101,
                roundTimerSeconds: 20,
                fillWithBots: false,
                allowJudge: true,
                allowSpectator: true,
                voiceEnabled: true,
                quickChatEnabled: true,
                reactionsEnabled: true,
                maxPlayers: 4,
              },
              'ADMIN'
            );
          }}
          className="baffa-card"
          style={{
            padding: isMobile ? '18px 16px' : '30px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            cursor: 'pointer',
            border: '2px solid var(--baffa-gold-frame)',
            boxShadow: '0 8px 30px rgba(184, 134, 11, 0.15), var(--baffa-shadow-elevated)',
            background: 'linear-gradient(170deg, #ffffff 0%, #fffef8 60%, var(--baffa-gold-hover) 100%)',
            transition: 'all 0.25s ease',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-6px)';
            e.currentTarget.style.borderColor = 'var(--baffa-gold-primary)';
            e.currentTarget.style.boxShadow = '0 0 35px rgba(245, 197, 24, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'var(--baffa-gold-frame)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--baffa-gold-hover)',
              color: 'var(--baffa-black)',
              fontSize: '0.62rem',
              fontWeight: 800,
              border: '1px solid var(--baffa-gold-frame)',
            }}
          >
            هدف 101 أو 151
          </div>

          <div
            style={{
              width: isMobile ? '46px' : '60px',
              height: isMobile ? '46px' : '60px',
              borderRadius: '50%',
              background: 'linear-gradient(145deg, var(--baffa-gold-hover) 0%, var(--baffa-gold-primary) 60%, var(--baffa-gold-dark) 100%)',
              color: 'var(--baffa-black)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: isMobile ? '10px' : '16px',
              boxShadow: '0 4px 16px rgba(217, 164, 4, 0.35)',
              border: '1.5px solid var(--baffa-gold-frame)',
            }}
          >
            <PlusCircle size={isMobile ? 22 : 30} color="var(--baffa-black)" />
          </div>

          <h2
            className="arabic-font"
            style={{ fontSize: isMobile ? '1.3rem' : '1.6rem', fontWeight: 900, color: 'var(--baffa-black)', margin: 0 }}
          >
            إنشاء غرفة
          </h2>
          <span style={{ fontSize: isMobile ? '0.82rem' : '0.95rem', fontWeight: 700, color: 'var(--baffa-gold-dark)', marginTop: '2px' }}>
            Create Custom Room
          </span>
          <p style={{ fontSize: isMobile ? '0.78rem' : '0.82rem', color: 'var(--baffa-text-secondary)', marginTop: isMobile ? '6px' : '10px', lineHeight: 1.5 }}>
            خصص قوانين الطاولة، افتح مقاعد الحكم والمتفرج، وفعّل الشات الصوتي المباشر مع صحابك.
          </p>
        </div>

        {/* 3. Join Room */}
        <div
          onClick={() => setShowJoinModal(true)}
          className="baffa-card"
          style={{
            padding: isMobile ? '18px 16px' : '30px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            cursor: 'pointer',
            border: '2px solid var(--baffa-gold-frame)',
            boxShadow: '0 8px 30px rgba(184, 134, 11, 0.12), var(--baffa-shadow-elevated)',
            background: 'linear-gradient(170deg, #ffffff 0%, #fffef8 60%, var(--baffa-gold-hover) 100%)',
            transition: 'all 0.25s ease',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-6px)';
            e.currentTarget.style.borderColor = 'var(--baffa-gold-primary)';
            e.currentTarget.style.boxShadow = '0 0 35px rgba(245, 197, 24, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'var(--baffa-gold-frame)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--baffa-gold-hover)',
              color: 'var(--baffa-black)',
              fontSize: '0.62rem',
              fontWeight: 800,
              border: '1px solid var(--baffa-gold-frame)',
            }}
          >
            كود الغرفة
          </div>

          <div
            style={{
              width: isMobile ? '46px' : '60px',
              height: isMobile ? '46px' : '60px',
              borderRadius: '50%',
              backgroundColor: 'var(--baffa-black)',
              color: 'var(--baffa-gold-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: isMobile ? '10px' : '16px',
              boxShadow: '0 4px 15px rgba(26, 26, 26, 0.2)',
              border: '1.5px solid var(--baffa-gold-frame)',
            }}
          >
            <LogIn size={isMobile ? 22 : 30} color="var(--baffa-gold-primary)" />
          </div>

          <h2
            className="arabic-font"
            style={{ fontSize: isMobile ? '1.3rem' : '1.6rem', fontWeight: 900, color: 'var(--baffa-black)', margin: 0 }}
          >
            انضمام لغرفة
          </h2>
          <span style={{ fontSize: isMobile ? '0.82rem' : '0.95rem', fontWeight: 700, color: 'var(--baffa-gold-dark)', marginTop: '2px' }}>
            Join with Code
          </span>
          <p style={{ fontSize: isMobile ? '0.78rem' : '0.82rem', color: 'var(--baffa-text-secondary)', marginTop: isMobile ? '6px' : '10px', lineHeight: 1.5 }}>
            ادخل بكود الغرفة والعب كلاعب، أو انضم كـ حكم (Judge) أو متفرج (Spectator) في أي وقت.
          </p>
        </div>
      </div>

      {/* Feature Badges Footer Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isMobile ? '10px' : '20px',
          marginTop: isMobile ? '22px' : '36px',
          flexWrap: 'wrap',
          zIndex: 1,
        }}
      >
        <button
          onClick={() => setShowRulesModal(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--baffa-black)',
            fontSize: isMobile ? '0.82rem' : '0.9rem',
            fontWeight: 700,
            padding: isMobile ? '8px 16px' : '10px 20px',
            borderRadius: 'var(--baffa-radius-full)',
            backgroundColor: '#ffffff',
            border: '1.5px solid var(--baffa-gold-frame)',
            boxShadow: '0 4px 16px rgba(184, 134, 11, 0.15)',
            cursor: 'pointer',
          }}
        >
          <BookOpen size={isMobile ? 15 : 18} style={{ color: 'var(--baffa-gold-dark)' }} />
          <span className="arabic-font">قواعد لعبة بَفّة (Game Rules)</span>
        </button>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--baffa-black)',
            fontSize: isMobile ? '0.75rem' : '0.85rem',
            padding: isMobile ? '6px 12px' : '8px 16px',
            borderRadius: 'var(--baffa-radius-full)',
            backgroundColor: '#ffffff',
            border: '1.5px solid var(--baffa-gold-frame)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            textAlign: 'center',
          }}
        >
          <ShieldCheck size={isMobile ? 14 : 16} style={{ color: 'var(--baffa-success)', flexShrink: 0 }} />
          <span>محمي بنظام مكافحة الغش وسلطة السيرفر المطلقة (Anti-Cheat)</span>
        </div>
      </div>

      {/* Modals */}
      <JoinRoomModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoin={handleJoinSubmit}
      />

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={onAuthSuccess}
      />

      {/* Rules Modal */}
      {showRulesModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(26, 26, 26, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            className="baffa-card"
            style={{
              maxWidth: '580px',
              width: '90%',
              padding: '36px 30px',
              maxHeight: '85vh',
              overflowY: 'auto',
              backgroundColor: 'var(--baffa-bg-canvas)',
              border: '2.5px solid var(--baffa-gold-frame)',
              boxShadow: '0 12px 48px rgba(26, 26, 26, 0.25)',
            }}
          >
            <h2
              className="arabic-font"
              style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--baffa-black)', marginBottom: '18px', textAlign: 'center' }}
            >
              قواعد وأصول لعبة بَفّة (BAFFA Rules)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', color: 'var(--baffa-black)', lineHeight: 1.7 }}>
              <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#ffffff', border: '1.5px solid var(--baffa-gold-frame)' }}>
                <strong style={{ color: 'var(--baffa-gold-dark)' }}>1. 28 بلاطة (28 Tiles):</strong> اللعبة تستخدم مجموعة الدومينو الكلاسيكية المزدوجة من 0|0 حتى 6|6 وتوزع 7 بلاطات لكل لاعب بالتساوي.
              </div>
              <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#ffffff', border: '1.5px solid var(--baffa-gold-frame)' }}>
                <strong style={{ color: 'var(--baffa-gold-dark)' }}>2. البداية بالدوش (6|6 Start):</strong> أول جولة في الماتش تبدأ إلزاميًا بصاحب الـ 6|6.
              </div>
              <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#ffffff', border: '1.5px solid var(--baffa-gold-frame)' }}>
                <strong style={{ color: 'var(--baffa-gold-dark)' }}>3. اتجاه اللعب (Counter-Clockwise):</strong> عكس عقارب الساعة إلزاميًا (جنوب ← شرق ← شمال ← غرب)، والزميل يجلس أمامك مباشرة.
              </div>
              <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#ffffff', border: '1.5px solid var(--baffa-gold-frame)' }}>
                <strong style={{ color: 'var(--baffa-gold-dark)' }}>4. الفوت والقفلة (Pass & Blocked):</strong> اللاعب يفوت ("فوت / عدي") فقط إذا لم يكن لديه أي حركة قانونية. عند القفلة، الفريق صاحب المجموع الأصغر من البونت يفوز بالراوند.
              </div>
              <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#ffffff', border: '1.5px solid var(--baffa-gold-frame)' }}>
                <strong style={{ color: 'var(--baffa-gold-dark)' }}>5. سكور الفوز (101 أو 151 Target):</strong> أول فريق يصل أو يتجاوز النقاط المحددة يفوز بالمباراة كاملة.
              </div>

              {/* Real Server-Enforced Anti-Cheat & Penalties Section */}
              <div
                style={{
                  marginTop: '12px',
                  padding: '16px',
                  borderRadius: '10px',
                  backgroundColor: '#fef2f2',
                  border: '1.5px solid #f87171',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 900, marginBottom: '10px', fontSize: '1rem' }}>
                  <ShieldAlert size={20} />
                  <span className="arabic-font">عواقب الغش ونظام الأمان المبرمج بالسيرفر:</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem', color: '#7f1d1d', lineHeight: 1.6 }}>
                  <div>
                    <strong style={{ color: '#991b1b' }}>⚖️ عقوبة ثبوت الغش من الحَكَم أو السيرفر (Cheating Disqualification):</strong>
                    <br />
                    تُطبق هذه العقوبة فقط عند ثبوت حالة غش متعمدة (مثل الاتفاق غير المشروع بين اللاعبين أو التلاعب الأمني): <span style={{ textDecoration: 'underline' }}>تُنهى الجولة فوراً</span> في نفس اللحظة وتُحسب جميع نقاط وبناط بلاطات الفريق المخالف كاملة لصالح الفريق المنافس.
                  </div>

                  <div>
                    <strong style={{ color: '#991b1b' }}>🚫 المنع التلقائي للتمرير الخاطئ (Pass Verification):</strong>
                    <br />
                    محرك السيرفر لا يسمح بأي أمر "فوت / Pass" طالما أن يد اللاعب بها بلاطة صالحة للعب، ويمنع تفويت الدور بدون داعٍ لحماية زميلك.
                  </div>

                  <div>
                    <strong style={{ color: '#991b1b' }}>🔒 العزل التام للأوراق (Zero Hand Exposure):</strong>
                    <br />
                    أوراق كل لاعب مشفرة ومعزولة بالسيرفر ولا تُرسل لشبكة أي خصم أو مشاهد نهائياً، مما يجعل برامج كشف الأوراق مستحيلة تقنياً 100%.
                  </div>

                  <div>
                    <strong style={{ color: '#991b1b' }}>⚡ رصد البوتات والتوقيت المشبوه (Cumulative Risk Score):</strong>
                    <br />
                    أي استخدام لأدوات مؤتمتة بحركات غير بشرية بأقل من 200 ملي ثانية ترفع نقاط الخطورة في السيرفر وتؤدي لطرد اللاعب وتصفير سلسلة انتصاراته (Streak Reset).
                  </div>
                </div>
              </div>

              {/* Roles: Judge & Spectator Permissions */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid var(--baffa-gold-frame)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--baffa-gold-dark)', fontWeight: 900, marginBottom: '10px', fontSize: '1rem' }}>
                  <Gavel size={20} />
                  <span className="arabic-font">صلاحيات الحَكَم والمتفرّج (Judge & Spectator Roles):</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem', color: 'var(--baffa-black)', lineHeight: 1.6 }}>
                  <div>
                    <strong style={{ color: 'var(--baffa-gold-dark)' }}>👨‍⚖️ الحَكَم (Judge - كحد أقصى 1 بكل غرفة):</strong>
                    <br />
                    يشاهد سير الطاولة، توقيت الرمي، وترتيب الأدوار مباشرة مع الصوت، ويمتلك زر <strong>إعلان الغش</strong> لإنهاء الجولة ومعاقبة المخالف. <span style={{ color: 'var(--baffa-gold-dark)', fontWeight: 700 }}>لا يرى الحَكَم أوراق يد اللاعبين الخاصة</span> لضمان النزاهة التامة والحيادية.
                  </div>

                  <div>
                    <strong style={{ color: 'var(--baffa-gold-dark)' }}>👀 المتفرّج (Spectator - كحد أقصى 1 بكل غرفة):</strong>
                    <br />
                    يشاهد طاولة اللعب الحية وسلسلة الدومينو ويستمع لصوت القعدة للتشجيع فقط. لا يمكنه اللعب أو التأثير على الماتش، ولا يرى أوراق أي لاعب مطلقاً.
                  </div>
                </div>
              </div>

              {/* Automated Server Referee */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(15, 107, 76, 0.06)',
                  border: '1.5px solid var(--baffa-success)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--baffa-success)', fontWeight: 900, marginBottom: '10px', fontSize: '1rem' }}>
                  <Cpu size={20} />
                  <span className="arabic-font">التحكيم الرقمي التلقائي (في حالة عدم وجود حَكَم):</span>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--baffa-black)', lineHeight: 1.6 }}>
                  إذا لُعبت المباراة بدون حَكَم بشري، يتولى **محرك السيرفر التلقائي (Server-Authoritative Referee)** التحكيم اللحظي 100%:
                  <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                    <li>التأكد من صحة أطراف السلسلة ومنع لعب أي بلاطة غير متطابقة.</li>
                    <li>إلزام اللاعب باللعب ومنعه من التمرير الخاطئ.</li>
                    <li>حساب نقاط القفلة (Blocked Game) والمجموع الصافي وإعلان الفائز بدقة برمجية مطلقة.</li>
                  </ul>
                </div>
              </div>

              {/* Disconnect & Bot Takeover Handling */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid var(--baffa-gold-frame)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--baffa-black)', fontWeight: 900, marginBottom: '10px', fontSize: '1rem' }}>
                  <WifiOff size={20} />
                  <span className="arabic-font">نظام انقطاع الاتصال وخروج اللاعبين (Disconnect & Bot Takeover):</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem', color: 'var(--baffa-black)', lineHeight: 1.6 }}>
                  <div>
                    <strong style={{ color: 'var(--baffa-gold-dark)' }}>🔴 التنبيه الفوري:</strong>
                    <br />
                    عند خروج أي لاعب أو انقطاع اتصاله، يظهر لجميع الحاضرين إشعار فوري بأن اللاعب <strong>(منقطع الاتصال - Disconnected)</strong> مع شارة تنبيهية على مقعده.
                  </div>

                  <div>
                    <strong style={{ color: 'var(--baffa-gold-dark)' }}>🤖 استلام البوت التلقائي (AI Bot Takeover):</strong>
                    <br />
                    تبدأ مهلة عودة مدتها <strong>120 ثانية</strong>، وخلالها يتولى <strong>بوت مصري ذكي</strong> اللعب مكانه بنفس أوراقه الأصلية فوراً حتى لا تتوقف متعة المباراة.
                  </div>

                  <div>
                    <strong style={{ color: 'var(--baffa-gold-dark)' }}>🔄 استعادة المقعد والأدمن:</strong>
                    <br />
                    بمجرد عودة اللاعب، يستلم أوراقه الأصلية فوراً ويكمل الماتش. وفي حال خروج منشئ الغرفة (الأدمن)، تنتقل صلاحيات الغرفة تلقائياً لزميله المتصل (Admin Transfer).
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowRulesModal(false)}
              className="baffa-btn-primary"
              style={{ width: '100%', marginTop: '24px', padding: '12px' }}
            >
              فهمت القواعد (إغلاق)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
