# BAFFA (بَفّة) — Complete Authentication & Cloud Identity Architecture

## Overview
This document specifies the complete production-grade authentication, account security, verification, password recovery, and multi-device identity architecture for **BAFFA (بَفّة)**.

---

## 1. Identity & User Data Model

### Database Entities
- **`User`**:
  - `id`: Immutable UUID primary key.
  - `username` & `normalizedUsername`: Unique username and lowercase indexed field.
  - `email` & `normalizedEmail`: Unique email and lowercase indexed field.
  - `phone` & `normalizedPhone`: Optional unique phone number.
  - `passwordHash`: Bcrypt hash with 10 salt rounds (never stored in plaintext).
  - `emailVerified` & `phoneVerified`: Authoritative server-side verification status flags.
  - `accountStatus`: `ACTIVE` | `SUSPENDED` | `DEACTIVATED`.
  - `failedLoginAttempts`: Counter for failed attempts.
  - `lockoutUntil`: Temporary lockout timestamp (5 failed attempts = 15-minute lock).
  - `lastLoginAt` & `lastActiveAt`: Tracking user activity.
- **`OtpVerification`**:
  - `id`, `userId`, `target`, `purpose`, `channel`.
  - `codeHash`: SHA-256 cryptographic hash of the 6-digit OTP (never plaintext in DB).
  - `attempts` & `maxAttempts`: Brute force limit (5 attempts max).
  - `expiresAt`: 10-minute validity window.
  - `consumed` & `consumedAt`: Single-use invalidation flag.
- **`Session`**:
  - `id`, `userId`, `refreshTokenHash`, `ipAddress`, `userAgent`, `isRevoked`, `expiresAt`.

---

## 2. Cryptographic Security Standards

1. **Password Security**:
   - High-cost Bcrypt hashing.
   - Live frontend password strength evaluation (*ضعيفة / متوسطة / قوية / ممتازة*).
   - Zero password exposure in API responses, logs, or error messages.
2. **OTP Security**:
   - `crypto.randomInt(100000, 999999)` for unpredictable 6-digit code generation.
   - Immediate SHA-256 hashing prior to persistence.
   - Strict single-use consumption.
   - Rate-limited: minimum 60-second cooldown between resend requests.
3. **Password Recovery Anti-Enumeration**:
   - Public recovery endpoint returns generic response: *"إذا كانت البيانات مرتبطة بحساب، فسنرسل كود الاسترجاع فوراً"* regardless of account existence.

---

## 3. Delivery Provider Abstraction

```
VerificationService
├── EmailProvider (IEmailProvider)
│   ├── MockEmailProvider (Test / Dev Mode)
│   └── SmtpEmailProvider (Production SMTP / SendGrid / AWS SES)
└── WhatsAppProvider (IWhatsAppProvider)
    ├── MockWhatsAppProvider (Test / Dev Mode)
    └── OfficialWhatsAppCloudProvider (Meta Graph API compliant)
```

- When credentials are not configured, the system explicitly operates in `TEST_MOCK` mode and logs clearly without faking deliveries.

---

## 4. Session & Multi-Device Token Lifecycle

- **Access Token**: Short-lived (1 hour) signed with `JWT_SECRET`.
- **Refresh Token**: Long-lived (7 days) signed with `JWT_REFRESH_SECRET`.
- **Token Rotation**: Every refresh request revokes the old session record and issues a fresh token pair.
- **Global Invalidation (`logoutAll`)**: Updates `isRevoked = true` on all active sessions for that user.

---

## 5. API Endpoints Contract

| Method | Path | Description | Protected |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new account & dispatch verification OTP | No |
| `POST` | `/api/auth/login` | Authenticate with username/email/phone & password | No |
| `POST` | `/api/auth/google` | Google OAuth token authentication & account linking | No |
| `POST` | `/api/auth/verify-email` | Verify email OTP code | No |
| `POST` | `/api/auth/resend-verification` | Resend verification OTP (rate-limited) | No |
| `POST` | `/api/auth/forgot-password` | Initiate password recovery (anti-enumeration) | No |
| `POST` | `/api/auth/verify-reset-code` | Verify recovery OTP & issue single-use resetToken | No |
| `POST` | `/api/auth/reset-password` | Set new password using resetToken | No |
| `POST` | `/api/auth/change-password` | Change password with current password verification | Yes (Bearer) |
| `POST` | `/api/auth/change-email` | Change email with OTP verification to new email | Yes (Bearer) |
| `POST` | `/api/auth/logout` | Revoke current refresh token | No |
| `POST` | `/api/auth/logout-all` | Revoke all active user sessions | Yes (Bearer) |
| `POST` | `/api/auth/refresh` | Rotate refresh token and issue new token pair | No |
| `GET` | `/api/auth/me` | Return authenticated user profile | Yes (Bearer) |
