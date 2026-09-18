'use client';

import React, { useState } from 'react';
import { Mic, Smartphone, Monitor, X, RefreshCw } from 'lucide-react';

interface MicPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestPermission: () => void;
}

export const MicPermissionModal: React.FC<MicPermissionModalProps> = ({
  isOpen,
  onClose,
  onRequestPermission,
}) => {
  const [activeTab, setActiveTab] = useState<'PHONE' | 'DESKTOP'>('PHONE');
  const [isRetrying, setIsRetrying] = useState(false);

  if (!isOpen) return null;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRequestPermission();
    } finally {
      setTimeout(() => setIsRetrying(false), 600);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(6, 10, 18, 0.88)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'rgba(14, 23, 38, 0.98)',
          border: '1.5px solid rgba(245, 158, 11, 0.45)',
          borderRadius: '24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(245, 158, 11, 0.2)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          color: '#f8fafc',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '14px',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--baffa-gold-primary)',
              }}
            >
              <Mic size={22} />
            </div>
            <div>
              <h3 className="arabic-font" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#fef08a' }}>
                تفعيل إذن المايك في المتصفح 🎙️
              </h3>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                يحتاج المتصفح لموافقتك للتحدث مع باقي اللاعبين
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Device Switcher (Mobile vs Desktop) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            backgroundColor: 'rgba(2, 6, 12, 0.5)',
            padding: '4px',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('PHONE')}
            className="arabic-font"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: activeTab === 'PHONE' ? 'rgba(245, 158, 11, 0.22)' : 'transparent',
              color: activeTab === 'PHONE' ? '#fbbf24' : '#94a3b8',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Smartphone size={16} />
            <span>الهاتف (الموبايل)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DESKTOP')}
            className="arabic-font"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: activeTab === 'DESKTOP' ? 'rgba(245, 158, 11, 0.22)' : 'transparent',
              color: activeTab === 'DESKTOP' ? '#fbbf24' : '#94a3b8',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Monitor size={16} />
            <span>الكمبيوتر (PC)</span>
          </button>
        </div>

        {/* Step-by-Step Instructions */}
        <div
          style={{
            backgroundColor: 'rgba(2, 6, 15, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {activeTab === 'PHONE' ? (
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  1
                </span>
                <p className="arabic-font" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                  اضغط على أيقونة <strong>الإعدادات 🎚️</strong> أو <strong>القفل 🔒</strong> بجانب رابط الموقع في شريط المتصفح (أو رمز <strong>aA</strong> في آيفون Safari).
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  2
                </span>
                <p className="arabic-font" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                  اختر <strong>أذونات الموقع (Site Permissions)</strong> ثم اضغط على <strong>الميكروفون (Microphone)</strong> واجعله <strong>سماح (Allow)</strong>.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  3
                </span>
                <p className="arabic-font" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                  اضغط على زر <strong>"طلب الإذن وتفعيل المايك الآن"</strong> بالأسفل ليبدأ الصوت فوراً.
                </p>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  1
                </span>
                <p className="arabic-font" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                  في أعلى المتصفح (Chrome / Edge)، اضغط على أيقونة <strong>القفل 🔒</strong> أو <strong>الإعدادات 🎚️</strong> الموجودة في شريط العنوان قبل الرابط مباشرة.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  2
                </span>
                <p className="arabic-font" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                  قم بتفعيل خيار <strong>الميكروفون (Microphone)</strong> وتحويله إلى <strong>السماح (Allow)</strong>.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  3
                </span>
                <p className="arabic-font" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                  اضغط على زر <strong>"طلب الإذن وتفعيل المايك الآن"</strong> ليتم الاتصال فوراً.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="baffa-btn-primary arabic-font"
            style={{
              padding: '13px 20px',
              fontSize: '0.96rem',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 20px rgba(245, 158, 11, 0.5)',
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              opacity: isRetrying ? 0.7 : 1,
            }}
          >
            <RefreshCw size={18} className={isRetrying ? 'animate-spin' : ''} />
            <span>طلب الإذن وتفعيل المايك الآن 🎙️</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="arabic-font"
            style={{
              padding: '10px 16px',
              fontSize: '0.86rem',
              fontWeight: 700,
              color: '#94a3b8',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '8px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            متابعة اللعب بدون صوت
          </button>
        </div>
      </div>
    </div>
  );
};
