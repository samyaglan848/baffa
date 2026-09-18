'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  Lock,
  User,
  Mail,
  Phone,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Link2,
} from 'lucide-react';
import { CurrentUser } from '../../hooks/useGameSocket';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: CurrentUser, token: string) => void;
}

type AuthView = 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD' | 'VERIFY_EMAIL' | 'ACCOUNT_LINK_REQUIRED';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [view, setView] = useState<AuthView>('LOGIN');

  // Form Fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Google OAuth Credentials & Linking
  const [googleIdToken, setGoogleIdToken] = useState('');
  const [linkAccountEmail, setLinkAccountEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [showLinkPassword, setShowLinkPassword] = useState(false);

  // Recovery & Verification Fields
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [recoveryResetToken, setRecoveryResetToken] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<1 | 2 | 3>(1);

  // Email Verification Fields
  const [verifyEmailAddress, setVerifyEmailAddress] = useState('');
  const [verifyOtpCode, setVerifyOtpCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Feedback & Loading
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Initialize Official Google Identity Services (GIS)
  useEffect(() => {
    if (!isOpen) return;

    const initGoogleGsi = () => {
      const clientId =
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
        '651902823236-u0p9o7grl0ik7p9l37l8jfo5pj8s7oe8.apps.googleusercontent.com';

      if (typeof window !== 'undefined' && (window as any).google?.accounts?.id && clientId) {
        try {
          (window as any).google.accounts.id.initialize({
            client_id: clientId,
            callback: (res: any) => {
              if (res?.credential) {
                handleGoogleCredentialResponse({ idToken: res.credential });
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });
        } catch {
          // Google GSI silent catch
        }
      }
    };

    const timeout = setTimeout(initGoogleGsi, 200);
    return () => clearTimeout(timeout);
  }, [isOpen, view]);

  if (!isOpen) return null;

  // Password strength calculator
  const getPasswordStrength = (pass: string): { label: string; color: string; percent: number } => {
    if (!pass) return { label: '', color: '#475569', percent: 0 };
    if (pass.length < 6) return { label: 'ضعيفة جداً', color: '#ef4444', percent: 25 };
    let score = 1;
    if (pass.length >= 8) score++;
    if (/[0-9]/.test(pass) && /[a-zA-Z\u0600-\u06FF]/.test(pass)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pass) || pass.length >= 10) score++;

    switch (score) {
      case 2:
        return { label: 'متوسطة', color: '#f59e0b', percent: 50 };
      case 3:
        return { label: 'قوية', color: '#10b981', percent: 75 };
      case 4:
      default:
        return { label: 'ممتازة', color: '#06b6d4', percent: 100 };
    }
  };

  const strength = getPasswordStrength(view === 'REGISTER' ? password : recoveryNewPassword);

  const resetMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  // Handle Login & Register Submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    const isRegister = view === 'REGISTER';
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

    if (isRegister && password !== confirmPassword) {
      setError('كلمة المرور وتأكيد كلمة المرور غير متطابقين');
      setLoading(false);
      return;
    }

    const payload = isRegister
      ? {
          username: username.trim(),
          password,
          confirmPassword,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          avatarUrl: 'avatar-1',
        }
      : { usernameOrEmailOrPhone: username.trim(), password };

    try {
      const res = await fetch(`http://localhost:4000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'فشلت العملية، يرجى المحاولة مجددًا');
      }

      if (isRegister) {
        if (data.verificationSent && email.trim()) {
          setVerifyEmailAddress(email.trim());
          setCountdown(60);
          setView('VERIFY_EMAIL');
          setSuccessMessage('تم إنشاء الحساب بنجاح! تم إرسال كود التفعيل إلى بريدك الإلكتروني.');
        } else {
          setView('LOGIN');
          setPassword('');
          setConfirmPassword('');
          setSuccessMessage('تم إنشاء الحساب بنجاح! 🎉 يمكنك الآن تسجيل الدخول.');
        }
        return;
      }

      // Login success
      const loggedUser: CurrentUser = {
        id: data.user.id,
        username: data.user.displayName || data.user.username,
        avatar: data.user.customAvatarUrl || data.user.avatarUrl || 'avatar-1',
        token: data.tokens.accessToken,
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('baffa_user', JSON.stringify(loggedUser));
        localStorage.setItem('baffa_token', data.tokens.accessToken);
      }

      onSuccess(loggedUser, data.tokens.accessToken);
      onClose();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setLoading(false);
    }
  };

  // Process Real Google Credential (ID Token or Access Token)
  const handleGoogleCredentialResponse = async (payload: { idToken?: string; accessToken?: string }) => {
    resetMessages();
    setLoading(true);

    try {
      const res = await fetch('http://localhost:4000/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'فشل التحقق من حساب Google');
      }

      // Case C: Account Linking Required
      if (data.requiresLink) {
        if (payload.idToken) setGoogleIdToken(payload.idToken);
        setLinkAccountEmail(data.email || '');
        setView('ACCOUNT_LINK_REQUIRED');
        setSuccessMessage(data.message || 'يرجى تأكيد كلمة المرور لربط حساب Google.');
        setLoading(false);
        return;
      }

      // Case A & B: Login or Created
      const googleUser: CurrentUser = {
        id: data.user.id,
        username: data.user.displayName || data.user.username,
        avatar: data.user.customAvatarUrl || data.user.avatarUrl || 'avatar-1',
        token: data.tokens.accessToken,
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('baffa_user', JSON.stringify(googleUser));
        localStorage.setItem('baffa_token', data.tokens.accessToken);
      }

      onSuccess(googleUser, data.tokens.accessToken);
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل الدخول بواسطة Google');
    } finally {
      setLoading(false);
    }
  };

  // Trigger Google Sign-In via Google Identity Services / Token Client Popup
  const handleGoogleBtnClick = () => {
    resetMessages();
    setLoading(true);

    const clientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      '651902823236-u0p9o7grl0ik7p9l37l8jfo5pj8s7oe8.apps.googleusercontent.com';

    // 1. Try Google Identity Services OAuth2 Token Client (Opens Google Official Popup)
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: async (tokenResponse: any) => {
            if (tokenResponse?.access_token) {
              await handleGoogleCredentialResponse({ accessToken: tokenResponse.access_token });
            } else {
              setLoading(false);
            }
          },
          error_callback: () => {
            setLoading(false);
          },
        });

        client.requestAccessToken();
        return;
      } catch {
        // Fallback to GSI prompt
      }
    }

    // 2. Fallback to GSI One Tap / Prompt
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
      try {
        (window as any).google.accounts.id.prompt(() => {
          setLoading(false);
        });
      } catch {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  };

  // Submit Password to Link Google Account (Case C)
  const handleLinkAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      const res = await fetch('http://localhost:4000/api/auth/google/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: googleIdToken,
          password: linkPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'فشل ربط الحساب');
      }

      const linkedUser: CurrentUser = {
        id: data.user.id,
        username: data.user.displayName || data.user.username,
        avatar: data.user.customAvatarUrl || data.user.avatarUrl || 'avatar-1',
        token: data.tokens.accessToken,
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('baffa_user', JSON.stringify(linkedUser));
        localStorage.setItem('baffa_token', data.tokens.accessToken);
      }

      onSuccess(linkedUser, data.tokens.accessToken);
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل تأكيد كلمة المرور وربط الحساب');
    } finally {
      setLoading(false);
    }
  };

  // Guest Mode
  const handleGuestPlay = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const guestUser: CurrentUser = {
      id: `user_guest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      username: `لاعب_بَفّة_${randomNum}`,
      avatar: 'avatar-1',
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('baffa_user', JSON.stringify(guestUser));
    }
    onSuccess(guestUser, '');
    onClose();
  };

  // Forgot Password Wizard Step 1: Send OTP
  const handleForgotStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: recoveryIdentifier.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecoveryStep(2);
        setCountdown(60);
        setSuccessMessage('إذا كانت البيانات صحيحة، فقد أرسلنا كود التحقق المكون من 6 أرقام.');
      } else {
        throw new Error(data.message || 'فشل إرسال كود الاسترجاع');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password Wizard Step 2: Verify OTP
  const handleForgotStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: recoveryIdentifier.trim(),
          code: recoveryOtp.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setRecoveryResetToken(data.resetToken);
        setRecoveryStep(3);
        setSuccessMessage('تم التحقق من الكود بنجاح! أدخل كلمة المرور الجديدة الآن.');
      } else {
        throw new Error(data.message || 'كود التحقق غير صحيح');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password Wizard Step 3: Set New Password
  const handleForgotStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setError('كلمة المرور وتأكيد كلمة المرور غير متطابقين');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: recoveryIdentifier.trim(),
          resetToken: recoveryResetToken,
          newPassword: recoveryNewPassword,
          confirmPassword: recoveryConfirmPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setView('LOGIN');
        setUsername(recoveryIdentifier);
        setPassword('');
        setRecoveryStep(1);
        setSuccessMessage('تم تغيير كلمة المرور بنجاح! 🎉 يرجى تسجيل الدخول بكلمة المرور الجديدة.');
      } else {
        throw new Error(data.message || 'فشل تحديث كلمة المرور');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Email Verification Submit
  const handleVerifyEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verifyEmailAddress.trim(),
          code: verifyOtpCode.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setView('LOGIN');
        setSuccessMessage('تم تفعيل بريدك الإلكتروني بنجاح! 🎉 يمكنك الآن تسجيل الدخول.');
      } else {
        throw new Error(data.message || 'كود التفعيل غير صحيح');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Resend Email Verification
  const handleResendEmailOtp = async () => {
    if (countdown > 0) return;
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmailAddress.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCountdown(60);
        setSuccessMessage('تم إرسال كود تفعيل جديد إلى بريدك الإلكتروني.');
      } else {
        throw new Error(data.message || 'فشل إعادة إرسال الكود');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(4, 7, 13, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.25s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: '#0a101d',
          backgroundImage:
            'radial-gradient(circle at 50% 0%, rgba(245, 158, 11, 0.12) 0%, rgba(6, 11, 20, 0.95) 75%)',
          borderRadius: 'var(--baffa-radius-xl)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(245, 158, 11, 0.15)',
          padding: '28px 24px',
          position: 'relative',
          direction: 'rtl',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: 'var(--baffa-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.color = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
            e.currentTarget.style.color = 'var(--baffa-text-secondary)';
          }}
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              background:
                'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              boxShadow: '0 8px 20px rgba(245, 158, 11, 0.35)',
              border: '1px solid rgba(251, 191, 36, 0.6)',
            }}
          >
            {view === 'FORGOT_PASSWORD' ? (
              <KeyRound size={26} color="#080d1a" strokeWidth={2.5} />
            ) : view === 'VERIFY_EMAIL' ? (
              <ShieldCheck size={26} color="#080d1a" strokeWidth={2.5} />
            ) : view === 'ACCOUNT_LINK_REQUIRED' ? (
              <Link2 size={26} color="#080d1a" strokeWidth={2.5} />
            ) : (
              <Sparkles size={26} color="#080d1a" strokeWidth={2.5} />
            )}
          </div>

          <h2
            className="arabic-font"
            style={{
              fontSize: '1.4rem',
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '-0.02em',
            }}
          >
            {view === 'LOGIN' && 'تسجيل الدخول'}
            {view === 'REGISTER' && 'إنشاء حساب جديد'}
            {view === 'FORGOT_PASSWORD' && 'استرجاع كلمة المرور'}
            {view === 'VERIFY_EMAIL' && 'تأكيد البريد الإلكتروني'}
            {view === 'ACCOUNT_LINK_REQUIRED' && 'ربط الحساب بحساب Google'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--baffa-text-secondary)', marginTop: '4px' }}>
            {view === 'LOGIN' && 'ادخل لحسابك لمتابعة المباريات وسجل مواجهاتك'}
            {view === 'REGISTER' && 'سجل حسابك واحفظ إحصائياتك ونسبة فوزك في بَفّة'}
            {view === 'FORGOT_PASSWORD' && 'أدخل بيانات حسابك وسنرسل لك كود الاسترجاع'}
            {view === 'VERIFY_EMAIL' && `أدخل كود التحقق المرسل إلى: ${verifyEmailAddress}`}
            {view === 'ACCOUNT_LINK_REQUIRED' && `أدخل كلمة مرور حسابك لتأكيد الربط مع: ${linkAccountEmail}`}
          </p>
        </div>

        {/* Segmented Mode Tabs (دخول / تسجيل) */}
        {(view === 'LOGIN' || view === 'REGISTER') && (
          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(6, 9, 14, 0.6)',
              borderRadius: 'var(--baffa-radius-full)',
              padding: '4px',
              border: '1px solid var(--baffa-surface-glass-border)',
              marginBottom: '20px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setView('LOGIN');
                resetMessages();
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--baffa-radius-full)',
                border: 'none',
                backgroundColor: view === 'LOGIN' ? 'var(--baffa-gold-primary)' : 'transparent',
                color: view === 'LOGIN' ? '#080d1a' : 'var(--baffa-text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              <LogIn size={15} />
              <span className="arabic-font">تسجيل الدخول</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setView('REGISTER');
                resetMessages();
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--baffa-radius-full)',
                border: 'none',
                backgroundColor: view === 'REGISTER' ? 'var(--baffa-gold-primary)' : 'transparent',
                color: view === 'REGISTER' ? '#080d1a' : 'var(--baffa-text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              <UserPlus size={15} />
              <span className="arabic-font">حساب جديد</span>
            </button>
          </div>
        )}

        {/* Success Alert Banner */}
        {successMessage && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#6ee7b7',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              fontSize: '0.85rem',
              marginBottom: '18px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert Banner */}
        {error && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              fontSize: '0.85rem',
              marginBottom: '18px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* -------------------- VIEW 1 & 2: LOGIN & REGISTER -------------------- */}
        {(view === 'LOGIN' || view === 'REGISTER') && (
          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Username Field */}
            <div>
              <label
                className="arabic-font"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  color: 'var(--baffa-text-primary)',
                  fontWeight: 700,
                  marginBottom: '6px',
                }}
              >
                {view === 'REGISTER' ? 'اسم المستخدم (Username)' : 'اسم المستخدم أو البريد الإلكتروني'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={view === 'REGISTER' ? 'مثال: player_1' : 'اسم المستخدم أو الإيميل أو الموبايل'}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 38px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: 'var(--baffa-bg-elevated)',
                    border: '1px solid var(--baffa-surface-glass-border)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none',
                    transition: 'border 0.2s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--baffa-gold-primary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--baffa-surface-glass-border)')}
                />
                <User size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--baffa-text-muted)' }} />
              </div>
            </div>

            {/* Optional Email & Phone for Register */}
            {view === 'REGISTER' && (
              <>
                <div>
                  <label
                    className="arabic-font"
                    style={{
                      display: 'block',
                      fontSize: '0.85rem',
                      color: 'var(--baffa-text-secondary)',
                      marginBottom: '6px',
                    }}
                  >
                    البريد الإلكتروني (اختياري)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 38px',
                        borderRadius: 'var(--baffa-radius-md)',
                        backgroundColor: 'var(--baffa-bg-elevated)',
                        border: '1px solid var(--baffa-surface-glass-border)',
                        color: '#fff',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--baffa-gold-primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'var(--baffa-surface-glass-border)')}
                    />
                    <Mail size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--baffa-text-muted)' }} />
                  </div>
                </div>

                <div>
                  <label
                    className="arabic-font"
                    style={{
                      display: 'block',
                      fontSize: '0.85rem',
                      color: 'var(--baffa-text-secondary)',
                      marginBottom: '6px',
                    }}
                  >
                    رقم الهاتف (اختياري)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01012345678"
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 38px',
                        borderRadius: 'var(--baffa-radius-md)',
                        backgroundColor: 'var(--baffa-bg-elevated)',
                        border: '1px solid var(--baffa-surface-glass-border)',
                        color: '#fff',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--baffa-gold-primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'var(--baffa-surface-glass-border)')}
                    />
                    <Phone size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--baffa-text-muted)' }} />
                  </div>
                </div>
              </>
            )}

            {/* Password Field */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="arabic-font" style={{ fontSize: '0.85rem', color: 'var(--baffa-text-primary)', fontWeight: 700 }}>
                  كلمة المرور
                </label>
                {view === 'LOGIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      setView('FORGOT_PASSWORD');
                      resetMessages();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--baffa-gold-primary)',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    نسيت كلمة السر؟
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 70px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: 'var(--baffa-bg-elevated)',
                    border: '1px solid var(--baffa-surface-glass-border)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none',
                    transition: 'border 0.2s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--baffa-gold-primary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--baffa-surface-glass-border)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    left: '36px',
                    top: '12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--baffa-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--baffa-text-muted)' }} />
              </div>

              {/* Live Password Strength Evaluator in Registration */}
              {view === 'REGISTER' && password && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--baffa-text-secondary)' }}>قوة كلمة المرور:</span>
                    <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${strength.percent}%`, height: '100%', backgroundColor: strength.color, transition: 'all 0.3s ease' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password in Registration */}
            {view === 'REGISTER' && (
              <div>
                <label className="arabic-font" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--baffa-text-primary)', fontWeight: 700, marginBottom: '6px' }}>
                  تأكيد كلمة المرور
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 70px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'var(--baffa-bg-elevated)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                      color: '#fff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--baffa-gold-primary)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--baffa-surface-glass-border)')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      left: '36px',
                      top: '12px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--baffa-text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0,
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <Lock size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--baffa-text-muted)' }} />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 'var(--baffa-radius-md)',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#080d1a',
                fontSize: '0.95rem',
                fontWeight: 900,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '4px',
                transition: 'all 0.2s ease',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span className="arabic-font">جاري المعالجة...</span>
                </>
              ) : (
                <>
                  {view === 'REGISTER' ? <UserPlus size={18} /> : <LogIn size={18} />}
                  <span className="arabic-font">{view === 'REGISTER' ? 'إنشاء الحساب والبدء' : 'تسجيل الدخول'}</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* -------------------- VIEW 5: ACCOUNT LINK REQUIRED (CASE C) -------------------- */}
        {view === 'ACCOUNT_LINK_REQUIRED' && (
          <form onSubmit={handleLinkAccountSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 'var(--baffa-radius-lg)',
                padding: '14px',
                fontSize: '0.85rem',
                color: 'var(--baffa-text-primary)',
                lineHeight: '1.6',
              }}
            >
              يوجد حساب بالفعل مسجل بالبريد الإلكتروني <strong>{linkAccountEmail}</strong>.
              يرجى إدخال كلمة مرور هذا الحساب لتأكيد هويتك وربطه بحساب Google.
            </div>

            <div>
              <label className="arabic-font" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--baffa-text-primary)', fontWeight: 700, marginBottom: '6px' }}>
                كلمة المرور الحالية للحساب
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showLinkPassword ? 'text' : 'password'}
                  required
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 70px',
                    borderRadius: 'var(--baffa-radius-md)',
                    backgroundColor: 'var(--baffa-bg-elevated)',
                    border: '1px solid var(--baffa-surface-glass-border)',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowLinkPassword(!showLinkPassword)}
                  style={{
                    position: 'absolute',
                    left: '36px',
                    top: '12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--baffa-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {showLinkPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--baffa-text-muted)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  padding: '12px',
                  borderRadius: 'var(--baffa-radius-md)',
                  border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#080d1a',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'تأكيد الربط وتسجيل الدخول'}
              </button>

              <button
                type="button"
                onClick={() => setView('LOGIN')}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--baffa-text-secondary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        {/* -------------------- VIEW 3: FORGOT PASSWORD WIZARD -------------------- */}
        {view === 'FORGOT_PASSWORD' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Step Indicator */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  style={{
                    width: '30px',
                    height: '6px',
                    borderRadius: '3px',
                    backgroundColor: recoveryStep >= s ? 'var(--baffa-gold-primary)' : 'rgba(255, 255, 255, 0.1)',
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>

            {/* Step 1: Identifier */}
            {recoveryStep === 1 && (
              <form onSubmit={handleForgotStep1} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="arabic-font" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--baffa-text-primary)', fontWeight: 700, marginBottom: '6px' }}>
                    اسم المستخدم أو البريد الإلكتروني أو الهاتف
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      required
                      value={recoveryIdentifier}
                      onChange={(e) => setRecoveryIdentifier(e.target.value)}
                      placeholder="أدخل بريدك أو اسم المستخدم"
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 38px',
                        borderRadius: 'var(--baffa-radius-md)',
                        backgroundColor: 'var(--baffa-bg-elevated)',
                        border: '1px solid var(--baffa-surface-glass-border)',
                        color: '#fff',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                    <Mail size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--baffa-text-muted)' }} />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#080d1a',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                  <span className="arabic-font">إرسال كود الاسترجاع</span>
                </button>
              </form>
            )}

            {/* Step 2: OTP Entry */}
            {recoveryStep === 2 && (
              <form onSubmit={handleForgotStep2} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="arabic-font" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--baffa-text-primary)', fontWeight: 700, marginBottom: '6px' }}>
                    أدخل كود التحقق المكون من 6 أرقام
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={recoveryOtp}
                    onChange={(e) => setRecoveryOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'var(--baffa-bg-elevated)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                      color: '#f59e0b',
                      fontSize: '1.4rem',
                      fontWeight: 800,
                      letterSpacing: '8px',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || recoveryOtp.length < 6}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#080d1a',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  <span className="arabic-font">تأكيد كود الاسترجاع</span>
                </button>
              </form>
            )}

            {/* Step 3: New Password */}
            {recoveryStep === 3 && (
              <form onSubmit={handleForgotStep3} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="arabic-font" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--baffa-text-primary)', fontWeight: 700, marginBottom: '6px' }}>
                    كلمة المرور الجديدة
                  </label>
                  <input
                    type="password"
                    required
                    value={recoveryNewPassword}
                    onChange={(e) => setRecoveryNewPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'var(--baffa-bg-elevated)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label className="arabic-font" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--baffa-text-primary)', fontWeight: 700, marginBottom: '6px' }}>
                    تأكيد كلمة المرور الجديدة
                  </label>
                  <input
                    type="password"
                    required
                    value={recoveryConfirmPassword}
                    onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 'var(--baffa-radius-md)',
                      backgroundColor: 'var(--baffa-bg-elevated)',
                      border: '1px solid var(--baffa-surface-glass-border)',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 'var(--baffa-radius-md)',
                    border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#080d1a',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <span className="arabic-font">تعيين كلمة المرور والانتهاء</span>}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => {
                setView('LOGIN');
                resetMessages();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--baffa-text-secondary)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                textAlign: 'center',
                marginTop: '8px',
              }}
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        )}

        {/* -------------------- VIEW 4: EMAIL VERIFICATION -------------------- */}
        {view === 'VERIFY_EMAIL' && (
          <form onSubmit={handleVerifyEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="arabic-font" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--baffa-text-primary)', fontWeight: 700, marginBottom: '6px' }}>
                كود التفعيل (6 أرقام)
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={verifyOtpCode}
                onChange={(e) => setVerifyOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'var(--baffa-bg-elevated)',
                  border: '1px solid var(--baffa-surface-glass-border)',
                  color: '#f59e0b',
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  letterSpacing: '8px',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleResendEmailOtp}
                disabled={countdown > 0 || loading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: countdown > 0 ? 'var(--baffa-text-muted)' : 'var(--baffa-gold-primary)',
                  fontSize: '0.8rem',
                  cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <RefreshCw size={14} />
                <span>{countdown > 0 ? `إعادة الإرسال بعد (${countdown} ث)` : 'إعادة إرسال الكود'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setView('LOGIN');
                  resetMessages();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--baffa-text-secondary)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                تخطي والدخول لاحقاً
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || verifyOtpCode.length < 6}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 'var(--baffa-radius-md)',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#080d1a',
                fontSize: '0.95rem',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              <span className="arabic-font">تأكيد الكود وتفعيل الحساب</span>
            </button>
          </form>
        )}

        {/* Social / Guest Action Area */}
        {(view === 'LOGIN' || view === 'REGISTER') && (
          <div style={{ marginTop: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--baffa-surface-glass-border)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)', fontWeight: 700 }}>أو للمتابعة الفورية</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--baffa-surface-glass-border)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Single Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleBtnClick}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span className="arabic-font">المتابعة بحساب Google</span>
              </button>

              {/* Guest Button */}
              <button
                type="button"
                onClick={handleGuestPlay}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: 'var(--baffa-radius-md)',
                  backgroundColor: 'rgba(6, 182, 212, 0.08)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  color: '#06b6d4',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Zap size={16} />
                <span className="arabic-font">متابعة كضيف سريع (بدون تسجيل)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
