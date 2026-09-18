# BAFFA (بَفّة) — PROMPT 6: Authentication & Cloud Identity Baseline Audit

## Executive Summary
This document establishes the formal Phase 0 audit of the authentication and identity infrastructure in BAFFA prior to the execution of Prompt 6 hardening.

---

## 1. Existing Components Inspected

| Component | Current State | Findings & Gaps | Action Required |
| :--- | :--- | :--- | :--- |
| **User Data Model** | Basic model in Prisma with `username`, `email`, `phone`, `passwordHash`. | Missing case-insensitive normalized columns (`normalizedUsername`, `normalizedEmail`), verification flags (`emailVerified`, `phoneVerified`), account lifecycle status (`accountStatus`), and lockout counters. | Add normalized `@unique` indexes, verification booleans, and lockout metadata. |
| **Password Security** | Bcrypt hashing (10 rounds). Passwords never logged. | Works securely; needs password confirmation validation and live strength evaluator. | Preserve Bcrypt strong cost; add server-side format and confirmation checks. |
| **Registration Flow** | Creates user with username + password. | Lacks email verification dispatch, confirm password check, and strength indicator. | Implement cryptographic OTP email verification and clean multi-step transition. |
| **Login Flow** | Accepts username/email/phone + password. | Missing brute-force lockout tracking (`lockoutUntil`) and last login timestamps. | Add progressive lockout protection and last active session metadata. |
| **Password Recovery** | Absent. | Users cannot recover forgotten passwords without admin intervention. | Build complete multi-step OTP-based password recovery wizard with anti-enumeration. |
| **Email Verification** | Absent. | No OTP generation, delivery, or verification. | Create `VerificationService` with SHA-256 hashed single-use OTPs. |
| **Email & WhatsApp Delivery** | Hardcoded or missing. | No modular abstraction for switching email or WhatsApp providers. | Build `IEmailProvider` and `IWhatsAppProvider` with Test/Mock fallback and production cloud adapters. |
| **Session Management** | Basic JWT Access (1h) & Refresh (7d) tokens. | Lacks explicit server-side revocation (`logoutAll`) and session tracking. | Implement session rotation, revocation tracking, and active session listing. |
| **Google Authentication** | Server-side decoding with mock fallback. | Need seamless account linking to prevent duplicate accounts when email matches. | Verify and link existing accounts by email securely. |
| **Error Handling** | Generic exception mapping. | Basic Arabic mapping present. | Standardize safe Arabic responses without revealing account existence during recovery. |

---

## 2. Reusable Architecture
- **JWT Architecture**: JSON Web Tokens (Access: 1 hour, Refresh: 7 days) and secret verification logic are solid.
- **WebSocket Auth Guard**: `GameGateway` token extraction and guest fallback namespaces (`guest_<socketId>`) are preserved.
- **In-Memory Store Fallback**: Allows full offline and local development without crashing if PostgreSQL is temporarily absent.

---

## 3. Security Requirements for Prompt 6
1. **Zero Plaintext Storage**: Passwords and OTP codes must NEVER be stored in plaintext. OTPs must use SHA-256 cryptographic hashing.
2. **Anti-Account Enumeration**: Public password recovery endpoints must return identical non-revealing responses (*"إذا كانت البيانات مرتبطة بحساب، سنرسل لك تعليمات الاسترجاع"*).
3. **Progressive Rate Limiting**: Limit failed attempts (5 consecutive failures = 15-minute temporary lockout).
4. **Anti-Replay & Token Invalidation**: Password reset tokens and OTP codes must be strictly single-use and short-lived (10 minutes).
