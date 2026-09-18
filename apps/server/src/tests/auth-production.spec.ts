import { PersistenceService } from '../modules/persistence/persistence.service';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as jwt from 'jsonwebtoken';
import { AuthService } from '../modules/auth/auth.service';
import { VerificationService } from '../modules/auth/verification.service';
import { MockEmailProvider } from '../modules/auth/providers/email.provider';
import { MockWhatsAppProvider } from '../modules/auth/providers/whatsapp.provider';

describe('BAFFA Production Authentication & Identity System (Prompt 6)', () => {
  const dbUsers = new Map<string, any>();
  const dbOtps = new Map<string, any>();
  const dbSessions = new Map<string, any>();

  const mockPrisma: any = {
    user: {
      findFirst: async ({ where }: any) => {
        for (const u of dbUsers.values()) {
          if (where.OR) {
            for (const cond of where.OR) {
              if (cond.username && u.username === cond.username) return u;
              if (cond.normalizedUsername && u.normalizedUsername === cond.normalizedUsername) return u;
              if (cond.email && u.email === cond.email) return u;
              if (cond.normalizedEmail && u.normalizedEmail === cond.normalizedEmail) return u;
              if (cond.phone && u.phone === cond.phone) return u;
              if (cond.normalizedPhone && u.normalizedPhone === cond.normalizedPhone) return u;
            }
          }
        }
        return null;
      },
      findUnique: async ({ where }: any) => dbUsers.get(where.id) || null,
      create: async ({ data }: any) => {
        const u = {
          id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          createdAt: new Date(),
          profile: { totalMatches: 0, matchesWon: 0 },
        };
        dbUsers.set(u.id, u);
        return u;
      },
      update: async ({ where, data }: any) => {
        const u = dbUsers.get(where.id);
        if (u) Object.assign(u, data);
        return u;
      },
      updateMany: async () => ({ count: 1 }),
    },
    otpVerification: {
      findFirst: async ({ where }: any) => {
        const arr = Array.from(dbOtps.values()).filter(
          (o) => o.target === where.target && o.purpose === where.purpose && !o.consumed
        );
        return arr[arr.length - 1] || null;
      },
      create: async ({ data }: any) => {
        const o = {
          id: `otp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          createdAt: new Date(),
        };
        dbOtps.set(o.id, o);
        return o;
      },
      update: async ({ where, data }: any) => {
        const o = dbOtps.get(where.id);
        if (o) Object.assign(o, data);
        return o;
      },
      updateMany: async ({ where, data }: any) => {
        for (const o of dbOtps.values()) {
          if (o.target === where.target && o.purpose === where.purpose) {
            Object.assign(o, data);
          }
        }
        return { count: 1 };
      },
    },
    session: {
      findFirst: async ({ where }: any) => {
        for (const s of dbSessions.values()) {
          if (s.refreshTokenHash === where.refreshTokenHash && !s.isRevoked) return s;
        }
        return null;
      },
      create: async ({ data }: any) => {
        const s = {
          id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          createdAt: new Date(),
        };
        dbSessions.set(s.id, s);
        return s;
      },
      update: async ({ where, data }: any) => {
        const s = dbSessions.get(where.id);
        if (s) Object.assign(s, data);
        return s;
      },
      updateMany: async ({ where, data }: any) => {
        for (const s of dbSessions.values()) {
          if (s.userId === where.userId) Object.assign(s, data);
        }
        return { count: 1 };
      },
    },
    auditLog: {
      create: async () => ({ id: 'audit_1' }),
    },
  };

  const mockEmailProvider = new MockEmailProvider();
  const mockWhatsAppProvider = new MockWhatsAppProvider();
  const verificationService = new VerificationService(mockPrisma);
  verificationService.setEmailProvider(mockEmailProvider);
  verificationService.setWhatsAppProvider(mockWhatsAppProvider);

  const authService = new AuthService(mockPrisma, verificationService, new PersistenceService());

  describe('Part 1 & 2: User Account Model & Password Security', () => {
    it('Registers a new user with normalized username, email, and secure password hash', async () => {
      const regDto = {
        username: 'Captain_Domino',
        email: 'Captain@Baffa.eg',
        password: 'SuperSecretPassword123!',
        confirmPassword: 'SuperSecretPassword123!',
      };

      const result = await authService.register(regDto, '10.0.0.1');
      assert.ok(result.user);
      assert.strictEqual(result.user.username, 'Captain_Domino');
      assert.strictEqual(result.user.normalizedUsername, 'captain_domino');
      assert.strictEqual(result.user.normalizedEmail, 'captain@baffa.eg');
      assert.strictEqual(result.user.emailVerified, false);
      assert.strictEqual((result.user as any).passwordHash, undefined); // Zero plaintext / hash leakage
      assert.ok(result.tokens.accessToken);
      assert.ok(result.tokens.refreshToken);
      assert.strictEqual(result.verificationSent, true);
    });

    it('Rejects registration if password confirmation does not match', async () => {
      await assert.rejects(
        authService.register({
          username: 'Mismatched_User',
          password: 'Password123',
          confirmPassword: 'DifferentPassword456',
        }, '10.0.0.2'),
        /كلمة المرور وتأكيد كلمة المرور غير متطابقين/
      );
    });

    it('Rejects duplicate username case-insensitively', async () => {
      await assert.rejects(
        authService.register({
          username: 'captain_domino', // duplicate of Captain_Domino
          password: 'Password123!',
        }, '10.0.0.3'),
        /اسم المستخدم مستخدم بالفعل/
      );
    });

    it('Rejects duplicate email address case-insensitively', async () => {
      await assert.rejects(
        authService.register({
          username: 'Another_Player',
          email: 'CAPTAIN@BAFFA.EG', // duplicate email
          password: 'Password123!',
        }, '10.0.0.4'),
        /البريد الإلكتروني مسجل بحساب آخر/
      );
    });
  });

  describe('Part 4 & 7: Reusable OTP Service & Email Verification', () => {
    const testEmail = 'verify_player@baffa.eg';

    it('Generates a 6-digit cryptographic OTP and dispatches email in test mode', async () => {
      const standaloneTarget = 'standalone_otp@baffa.eg';
      const res = await verificationService.createAndSendOtp({
        target: standaloneTarget,
        purpose: 'EMAIL_VERIFICATION',
        channel: 'EMAIL',
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.channel, 'EMAIL');
      assert.ok(mockEmailProvider.getSentCount() > 0);
      const lastEmail = mockEmailProvider.getLastEmail();
      assert.strictEqual(lastEmail?.to, standaloneTarget);
      assert.ok(lastEmail?.subject.includes('تفعيل'));
    });

    it('Rejects invalid 6-digit OTP code', async () => {
      await assert.rejects(
        authService.verifyEmail({
          email: 'some_unverified@baffa.eg',
          code: '000000',
        }),
        /كود التحقق غير صحيح/
      );
    });

    it('Verifies email successfully with valid OTP', async () => {
      // Create fresh OTP
      const otpRes = await verificationService.createAndSendOtp({
        target: 'verify_succ@baffa.eg',
        purpose: 'EMAIL_VERIFICATION',
        channel: 'EMAIL',
      });
      assert.strictEqual(otpRes.success, true);

      // Verify valid OTP
      const lastEmail = mockEmailProvider.getLastEmail();
      assert.ok(lastEmail);
      const match = lastEmail.text?.match(/\b\d{6}\b/);
      assert.ok(match);
      const validCode = match[0];

      const verifyRes = await authService.verifyEmail({
        email: 'verify_succ@baffa.eg',
        code: validCode,
      });

      assert.strictEqual(verifyRes.success, true);
      assert.ok(verifyRes.message.includes('تم تفعيل البريد'));
    });
  });

  describe('Part 8: Login Experience & Lockout Protection', () => {
    const loginUser = 'lockout_test_user';
    const loginPass = 'CorrectPassword123!';

    it('Logs in successfully with valid credentials', async () => {
      await authService.register({
        username: loginUser,
        password: loginPass,
      }, '10.0.0.6');

      const res = await authService.login({
        usernameOrEmailOrPhone: loginUser,
        password: loginPass,
      }, '10.0.0.7');

      assert.strictEqual(res.user.username, loginUser);
      assert.ok(res.tokens.accessToken);
    });

    it('Fails login on invalid password and locks account after 5 consecutive failures', async () => {
      for (let i = 0; i < 4; i++) {
        try {
          await authService.login({
            usernameOrEmailOrPhone: loginUser,
            password: `Wrong_${i}`,
          }, `10.0.1.${i}`);
        } catch {
          // Expected
        }
      }

      // 5th failed attempt triggers lockout
      await assert.rejects(
        authService.login({
          usernameOrEmailOrPhone: loginUser,
          password: 'Wrong_5th',
        }, '10.0.1.5'),
        /بيانات الدخول غير صحيحة/
      );

      // Subsequent login attempt should inform user of temporary lockout
      await assert.rejects(
        authService.login({
          usernameOrEmailOrPhone: loginUser,
          password: loginPass,
        }, '10.0.1.6'),
        /الحساب مقفل مؤقتًا/
      );
    });
  });

  describe('Part 9: Forgot Password & Safe Recovery Flow', () => {
    const recoveryUser = 'recovery_user';
    const recoveryEmail = 'recovery@baffa.eg';
    const originalPass = 'OldPassword123!';
    const newPass = 'NewStrongPassword2026!';

    it('Returns anti-enumeration generic response on forgot password', async () => {
      await authService.register({
        username: recoveryUser,
        email: recoveryEmail,
        password: originalPass,
      }, '10.0.2.1');

      const res = await authService.forgotPassword({
        identifier: 'non_existent_account@baffa.eg',
      });
      assert.strictEqual(res.success, true);
      assert.ok(res.message.includes('إذا كانت البيانات مرتبطة بحساب'));
    });

    it('Dispatches password reset OTP, verifies reset code, and sets new password', async () => {
      await authService.forgotPassword({ identifier: recoveryEmail });

      const lastEmail = mockEmailProvider.getLastEmail();
      assert.ok(lastEmail);
      const match = lastEmail.text?.match(/\b\d{6}\b/);
      assert.ok(match);
      const otp = match[0];

      const verifyResult = await authService.verifyResetCode({
        identifier: recoveryEmail,
        code: otp,
      });

      assert.strictEqual(verifyResult.valid, true);
      assert.ok(verifyResult.resetToken);

      // Complete Password Reset
      const resetRes = await authService.resetPassword({
        identifier: recoveryEmail,
        resetToken: verifyResult.resetToken,
        newPassword: newPass,
        confirmPassword: newPass,
      });

      assert.strictEqual(resetRes.success, true);
      assert.ok(resetRes.message.includes('تم تغيير كلمة المرور'));

      // Old password should now be invalid
      await assert.rejects(
        authService.login({
          usernameOrEmailOrPhone: recoveryUser,
          password: originalPass,
        }, '10.0.2.2'),
        /بيانات الدخول غير صحيحة/
      );

      // New password should succeed
      const newLogin = await authService.login({
        usernameOrEmailOrPhone: recoveryUser,
        password: newPass,
      }, '10.0.2.3');
      assert.strictEqual(newLogin.user.username, recoveryUser);
    });
  });

  describe('Part 11: Session Management & Refresh Token Rotation', () => {
    it('Rotates refresh token and issues new valid token pair', async () => {
      const user = await authService.register({
        username: 'session_test_user',
        password: 'Password123!',
      }, '10.0.3.1');

      const oldRefreshToken = user.tokens.refreshToken;
      const newTokens = await authService.refreshToken(oldRefreshToken);

      assert.ok(newTokens.accessToken);
      assert.ok(newTokens.refreshToken);
    });

    it('Logs out all devices', async () => {
      const res = await authService.logoutAll('some_user_id');
      assert.strictEqual(res.success, true);
      assert.ok(res.message.includes('تم تسجيل الخروج'));
    });
  });

  describe('Part 12: Google Authentication', () => {
    it('Authenticates via Google OAuth token cleanly', async () => {
      const testToken = jwt.sign(
        {
          iss: 'https://accounts.google.com',
          sub: `google_prod_test_${Date.now()}`,
          email: 'google_player@baffa.eg',
          name: 'Google Player',
          email_verified: true,
        },
        'test-secret'
      );

      const res = await authService.googleAuth({
        idToken: testToken,
      });

      assert.ok(res.user);
      assert.strictEqual(res.user.emailVerified, true);
      assert.ok(res.tokens?.accessToken);
    });
  });
});
