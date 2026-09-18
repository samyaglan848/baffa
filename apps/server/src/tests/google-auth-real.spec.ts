import { PersistenceService } from '../modules/persistence/persistence.service';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../modules/auth/auth.service';
import { VerificationService } from '../modules/auth/verification.service';

describe('BAFFA Real Production Google Authentication & Account Linking Audit Suite', () => {
  const dbUsers = new Map<string, any>();
  const dbOtps = new Map<string, any>();
  const dbSessions = new Map<string, any>();

  const mockPrisma: any = {
    user: {
      findFirst: async ({ where }: any) => {
        for (const u of dbUsers.values()) {
          if (where.googleId && u.googleId === where.googleId) return u;
          if (where.normalizedEmail && u.normalizedEmail === where.normalizedEmail) return u;
          if (where.email && u.email === where.email) return u;
          if (where.OR) {
            for (const cond of where.OR) {
              if (cond.googleId && u.googleId === cond.googleId) return u;
              if (cond.normalizedEmail && u.normalizedEmail === cond.normalizedEmail) return u;
              if (cond.email && u.email === cond.email) return u;
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
    session: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: `sess_${Date.now()}`, ...data }),
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    otpVerification: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: `otp_${Date.now()}`, ...data }),
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    auditLog: {
      create: async () => ({ id: 'audit_1' }),
    },
  };

  const verificationService = new VerificationService(mockPrisma);
  const authService = new AuthService(mockPrisma, verificationService, new PersistenceService());

  // Helper to create a signed test Google ID token
  const createGoogleToken = (payload: {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    iss?: string;
    aud?: string;
    exp?: number;
  }) => {
    return jwt.sign(
      {
        iss: payload.iss || 'https://accounts.google.com',
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified !== undefined ? payload.email_verified : true,
        name: payload.name || 'Google Player',
        picture: payload.picture || 'https://lh3.googleusercontent.com/a/photo.jpg',
        aud: payload.aud || 'baffa-web-client-id.apps.googleusercontent.com',
        exp: payload.exp || Math.floor(Date.now() / 1000) + 3600,
      },
      'test-google-signing-key-secret'
    );
  };

  describe('1. Server-Authoritative Token Verification & Security Controls', () => {
    it('Verifies Google ID token payload and extracts real profile claims', async () => {
      const token = createGoogleToken({
        sub: '109283746192837461',
        email: 'ahmed.baffa@gmail.com',
        name: 'Ahmed Baffa',
        picture: 'https://lh3.googleusercontent.com/a/ahmed.jpg',
      });

      const claims = await authService.verifyGoogleIdToken(token);
      assert.strictEqual(claims.sub, '109283746192837461');
      assert.strictEqual(claims.email, 'ahmed.baffa@gmail.com');
      assert.strictEqual(claims.name, 'Ahmed Baffa');
      assert.strictEqual(claims.email_verified, true);
    });

    it('Rejects token if Google sub is missing or invalid', async () => {
      const invalidToken = jwt.sign({ email: 'no_sub@gmail.com' }, 'secret');
      await assert.rejects(
        authService.verifyGoogleIdToken(invalidToken),
        /فشل التحقق الأمني من توكن جوجل|معرف حساب جوجل.*مفقود/
      );
    });

    it('Rejects token if email is missing or signature is invalid', async () => {
      const noEmailToken = jwt.sign({ sub: '12345' }, 'secret');
      await assert.rejects(
        authService.verifyGoogleIdToken(noEmailToken),
        /فشل التحقق الأمني من توكن جوجل|البريد الإلكتروني.*مفقود/
      );
    });

    it('Rejects empty or null token defensively', async () => {
      await assert.rejects(
        authService.verifyGoogleIdToken(''),
        /رمز توثيق جوجل مفقود أو غير صالح/
      );
    });
  });

  describe('2. Case B: New Google Account Registration Flow', () => {
    it('Creates a new BAFFA account with real Google name, verified email, and unique sub', async () => {
      const googleSub = '293847192837461829';
      const googleEmail = 'new.player@gmail.com';
      const token = createGoogleToken({
        sub: googleSub,
        email: googleEmail,
        name: 'Tarek Mahmoud',
        picture: 'https://lh3.googleusercontent.com/a/tarek.jpg',
      });

      const res = await authService.googleAuth({ idToken: token });

      assert.ok(res.user);
      assert.strictEqual(res.user.email, googleEmail);
      assert.strictEqual(res.user.displayName, 'Tarek Mahmoud');
      assert.strictEqual(res.user.emailVerified, true);
      assert.ok(res.user.avatarUrl.includes('tarek.jpg'));
      assert.ok(res.tokens);
      assert.ok(res.tokens.accessToken.length > 20);

      // Verify stored in DB
      const stored = dbUsers.get(res.user.id);
      assert.ok(stored);
      assert.strictEqual(stored.googleId, googleSub);
      assert.strictEqual(stored.emailVerified, true);
    });
  });

  describe('3. Case A: Existing Google Account Login Flow', () => {
    it('Logs in existing Google user without creating a duplicate account', async () => {
      const googleSub = '293847192837461829';
      const initialCount = dbUsers.size;

      const token = createGoogleToken({
        sub: googleSub,
        email: 'new.player@gmail.com',
        name: 'Tarek Mahmoud',
      });

      const res = await authService.googleAuth({ idToken: token });

      assert.ok(res.user);
      assert.strictEqual(res.user.email, 'new.player@gmail.com');
      assert.ok(res.tokens);
      // DB user count must NOT increase
      assert.strictEqual(dbUsers.size, initialCount);
    });
  });

  describe('4. Case C: Existing Password Account Linking Flow', () => {
    const existingEmail = 'regular_player@baffa.eg';
    const existingPassword = 'MySecretPassword2026!';
    let existingUserId: string;

    it('Pre-populates an existing password account', async () => {
      const hash = await bcrypt.hash(existingPassword, 10);
      const user = await mockPrisma.user.create({
        data: {
          username: 'regular_player',
          normalizedUsername: 'regular_player',
          email: existingEmail,
          normalizedEmail: existingEmail.toLowerCase(),
          passwordHash: hash,
          googleId: null,
          displayName: 'Regular Player',
          emailVerified: false,
          accountStatus: 'ACTIVE',
        },
      });
      existingUserId = user.id;
    });

    it('Returns requiresLink challenge when authenticating with matching email', async () => {
      const token = createGoogleToken({
        sub: '8877665544332211',
        email: existingEmail,
        name: 'Regular Player Google',
      });

      const res = await authService.googleAuth({ idToken: token });

      assert.strictEqual(res.requiresLink, true);
      assert.ok(res.message?.includes('يوجد بالفعل حساب في بَفّة'));
      assert.strictEqual(res.email, existingEmail);
      assert.strictEqual(res.tokens, undefined);
    });

    it('Rejects account linking on wrong password', async () => {
      const token = createGoogleToken({
        sub: '8877665544332211',
        email: existingEmail,
      });

      await assert.rejects(
        authService.linkGoogleAccount({
          idToken: token,
          password: 'WrongPassword999',
        }),
        /كلمة المرور غير صحيحة/
      );
    });

    it('Successfully links Google account when correct password is provided', async () => {
      const token = createGoogleToken({
        sub: '8877665544332211',
        email: existingEmail,
      });

      const linkRes = await authService.linkGoogleAccount({
        idToken: token,
        password: existingPassword,
      });

      assert.ok(linkRes.user);
      assert.ok(linkRes.tokens);
      assert.strictEqual(linkRes.user.id, existingUserId);
      assert.strictEqual(linkRes.user.emailVerified, true);

      // Verify Google ID attached
      const updated = dbUsers.get(existingUserId);
      assert.strictEqual(updated.googleId, '8877665544332211');
      assert.strictEqual(updated.emailVerified, true);
    });

    it('Subsequent Google sign-in logs in directly as Case A after successful link', async () => {
      const token = createGoogleToken({
        sub: '8877665544332211',
        email: existingEmail,
      });

      const res = await authService.googleAuth({ idToken: token });
      assert.strictEqual(res.requiresLink, undefined);
      assert.strictEqual(res.user?.id, existingUserId);
      assert.ok(res.tokens);
    });
  });
});
