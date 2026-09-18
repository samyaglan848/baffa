import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import * as jwt from 'jsonwebtoken';
import { ProfileService } from '../modules/profile/profile.service';
import { LocalProfileStorage } from '../modules/profile/storage/local-profile-storage';
import { PersistenceService } from '../modules/persistence/persistence.service';
import { ImageProcessor } from '../modules/profile/storage/image-processor';
import { UserProfile, BAFFA_AVATARS } from '@baffa/shared';

describe('BAFFA Production User Profile System (Prompt 7)', () => {
  let profileService: ProfileService;
  let storage: LocalProfileStorage;
  let mockGateway: any;
  let emittedEvents: any[] = [];

  const mockUser: UserProfile = {
    id: 'user_test_profile_1',
    username: 'samy_domino',
    displayName: 'سامي الدومينو',
    avatarUrl: 'avatar-1',
    avatarId: 'avatar-1',
    customAvatarUrl: null,
    gender: 'MALE',
    bio: 'عاشق للدومينو المصري والتحديات الكبيرة',
    email: 'samy@baffa.eg',
    phone: '+201001234567',
    emailVerified: true,
    phoneVerified: true,
    accountStatus: 'ACTIVE',
    totalMatches: 25,
    matchesWon: 18,
    matchesLost: 7,
    totalRounds: 80,
    roundsWon: 52,
    totalPipsScored: 2450,
    currentStreak: 4,
    bestStreak: 7,
    humanMatchesWon: 12,
    humanMatchesLost: 4,
    botMatchesWon: 6,
    botMatchesLost: 3,
    createdAt: new Date().toISOString(),
  };

  const mockOpponent: UserProfile = {
    id: 'user_test_profile_2',
    username: 'hossam_pro',
    displayName: 'حسام البرنس',
    avatarUrl: 'avatar-5',
    avatarId: 'avatar-5',
    customAvatarUrl: null,
    gender: 'MALE',
    bio: 'البرنس على الطاولة',
    email: 'hossam@baffa.eg',
    phone: '+201009876543',
    emailVerified: true,
    phoneVerified: false,
    accountStatus: 'ACTIVE',
    totalMatches: 30,
    matchesWon: 15,
    matchesLost: 15,
    totalRounds: 95,
    roundsWon: 48,
    totalPipsScored: 3100,
    currentStreak: 1,
    bestStreak: 5,
    humanMatchesWon: 10,
    humanMatchesLost: 10,
    botMatchesWon: 5,
    botMatchesLost: 5,
    createdAt: new Date().toISOString(),
  };

  before(() => {
    storage = new LocalProfileStorage();
    emittedEvents = [];
    mockGateway = {
      server: {
        emit: (event: string, data: any) => {
          emittedEvents.push({ event, data });
        },
      },
    };

    const mockPrisma: any = {
      user: {
        findUnique: async ({ where }: any) => {
          if (where.id === mockUser.id) return { ...mockUser, profile: mockUser };
          if (where.id === mockOpponent.id) return { ...mockOpponent, profile: mockOpponent };
          return null;
        },
        findFirst: async ({ where }: any) => {
          const idOrUsername = where.OR?.[0]?.id || where.OR?.[2]?.username;
          if (idOrUsername === mockUser.id || idOrUsername === mockUser.username) {
            return { ...mockUser, profile: mockUser, matchParticipants: [] };
          }
          if (idOrUsername === mockOpponent.id || idOrUsername === mockOpponent.username) {
            return { ...mockOpponent, profile: mockOpponent, matchParticipants: [] };
          }
          return null;
        },
        update: async ({ where, data }: any) => {
          if (where.id === mockUser.id) {
            Object.assign(mockUser, data);
            if (data.profile?.update) Object.assign(mockUser, data.profile.update);
            return { ...mockUser, profile: mockUser };
          }
          throw new Error('User not found in mock');
        },
      },
      match: {
        findMany: async () => [],
      },
    };

    profileService = new ProfileService(mockPrisma, storage, new PersistenceService(), mockGateway);
    profileService.seedInMemoryProfile(mockUser);
    profileService.seedInMemoryProfile(mockOpponent);
  });

  describe('Part 1: Own Profile Retrieval & Security', () => {
    it('Retrieves complete authenticated profile with statistics', async () => {
      const p = await profileService.getMyProfile(mockUser.id);
      assert.strictEqual(p.id, mockUser.id);
      assert.strictEqual(p.username, 'samy_domino');
      assert.strictEqual(p.displayName, 'سامي الدومينو');
      assert.strictEqual(p.totalMatches, 25);
      assert.strictEqual(p.matchesWon, 18);
      assert.strictEqual(p.bestStreak, 7);
    });

    it('Rejects retrieval without authenticated user ID', async () => {
      await assert.rejects(profileService.getMyProfile(''), /معرف المستخدم مفقود/);
    });
  });

  describe('Part 2: Public Profile Sanitization & Zero Leakage', () => {
    it('Returns public profile with statistics without private email or phone', async () => {
      const pub = await profileService.getPublicProfile('samy_domino');
      assert.strictEqual(pub.id, mockUser.id);
      assert.strictEqual(pub.username, 'samy_domino');
      assert.strictEqual(pub.displayName, 'سامي الدومينو');
      assert.strictEqual(pub.stats.totalMatches, 25);
      assert.strictEqual(pub.stats.winRate, 72); // 18/25 = 72%

      // Private fields must be strictly absent
      assert.strictEqual((pub as any).email, undefined);
      assert.strictEqual((pub as any).phone, undefined);
      assert.strictEqual((pub as any).passwordHash, undefined);
      assert.strictEqual((pub as any).normalizedEmail, undefined);
    });

    it('Rejects query for non-existent player', async () => {
      await assert.rejects(
        profileService.getPublicProfile('unknown_player_9999'),
        /لم يتم العثور على اللاعب المطلوب/
      );
    });
  });

  describe('Part 3: Profile Updates & Validation Constraints', () => {
    it('Updates display name, gender, and bio cleanly', async () => {
      const updated = await profileService.updateMyProfile(mockUser.id, {
        displayName: 'سامي المعلم',
        gender: 'MALE',
        bio: 'بافّة دومينو على أصولها.. العب باحتراف!',
      });

      assert.strictEqual(updated.displayName, 'سامي المعلم');
      assert.strictEqual(updated.gender, 'MALE');
      assert.strictEqual(updated.bio, 'بافّة دومينو على أصولها.. العب باحتراف!');
    });

    it('Sanitizes XSS and HTML tags from display name and bio', async () => {
      const updated = await profileService.updateMyProfile(mockUser.id, {
        displayName: 'سامي <script>alert("XSS")</script>',
        bio: 'لاعب خطير <img src="x" onerror="evil()" /> جاهز للتحدي',
      });

      assert.ok(!updated.displayName.includes('<script>'));
      assert.ok(!updated.displayName.includes('</script>'));
      assert.ok(!updated.bio?.includes('<img'));
      assert.ok(!updated.bio?.includes('onerror'));
    });

    it('Rejects display name shorter than 2 or longer than 30 characters', async () => {
      await assert.rejects(
        profileService.updateMyProfile(mockUser.id, { displayName: 'A' }),
        /الاسم الظاهر يجب أن يكون بين 2 و 30 حرفاً/
      );

      await assert.rejects(
        profileService.updateMyProfile(mockUser.id, {
          displayName: 'هذا الاسم طويل جداً جداً جداً ويتجاوز الحد الأقصى المسموح به برمجياً',
        }),
        /الاسم الظاهر يجب أن يكون بين 2 و 30 حرفاً/
      );
    });

    it('Rejects bio exceeding 160 characters', async () => {
      const longBio = 'أ'.repeat(161);
      await assert.rejects(
        profileService.updateMyProfile(mockUser.id, { bio: longBio }),
        /النبذة الشخصية يجب ألا تتجاوز 160 حرفاً/
      );
    });

    it('Rejects invalid gender enum value', async () => {
      await assert.rejects(
        profileService.updateMyProfile(mockUser.id, { gender: 'INVALID_GENDER' as any }),
        /قيمة النوع المحددة غير صالحة/
      );
    });
  });

  describe('Part 4: Avatar Selection from BAFFA Catalog', () => {
    it('Selects a valid avatar from BAFFA catalog (e.g. avatar-2 El-Basha)', async () => {
      const updated = await profileService.updateMyProfile(mockUser.id, {
        avatarId: 'avatar-2',
      });

      assert.strictEqual(updated.avatarId, 'avatar-2');
      assert.strictEqual(updated.avatarUrl, 'avatar-2');
      assert.strictEqual(updated.customAvatarUrl, null);
    });

    it('Rejects invalid or unauthorized avatar ID', async () => {
      await assert.rejects(
        profileService.updateMyProfile(mockUser.id, {
          avatarId: 'malicious-custom-avatar-999',
        }),
        /معرف الأفاتار المختار غير صالح/
      );
    });
  });

  describe('Part 5: Secure Image Upload & Magic Byte Verification', () => {
    it('Validates and accepts true JPEG image buffer', () => {
      // JPEG magic bytes: FF D8 FF E0
      const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const res = ImageProcessor.validateAndProcess(validJpeg, 'image/jpeg');
      assert.strictEqual(res.mimeType, 'image/jpeg');
      assert.strictEqual(res.extension, 'jpg');
    });

    it('Validates and accepts true PNG image buffer', () => {
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const res = ImageProcessor.validateAndProcess(validPng, 'image/png');
      assert.strictEqual(res.mimeType, 'image/png');
      assert.strictEqual(res.extension, 'png');
    });

    it('Rejects oversized image (> 25MB)', () => {
      const oversized = Buffer.alloc(26 * 1024 * 1024);
      oversized[0] = 0xff;
      oversized[1] = 0xd8;
      oversized[2] = 0xff;
      assert.throws(
        () => ImageProcessor.validateAndProcess(oversized, 'image/jpeg'),
        /حجم الصورة يتجاوز الحد الأقصى/
      );
    });

    it('Rejects fake image with invalid signature / executable content', () => {
      // Executable disguised as image
      const fakeExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00');
      assert.throws(
        () => ImageProcessor.validateAndProcess(fakeExe, 'image/jpeg'),
        /نوع الملف غير مدعوم/
      );

      // SVG with script payload
      const evilSvg = Buffer.from('<svg onload="alert(1)"><script>evil()</script></svg>');
      assert.throws(
        () => ImageProcessor.validateAndProcess(evilSvg, 'image/svg+xml'),
        /نوع الملف غير مدعوم|تم اكتشاف محتوى غير آمن/
      );
    });

    it('Uploads valid custom avatar and updates user profile', async () => {
      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);

      const res = await profileService.uploadCustomAvatar(mockUser.id, validPng, 'image/png');
      assert.ok(res.customAvatarUrl);
      assert.ok(res.customAvatarUrl.includes('/uploads/avatars/'));
      assert.strictEqual(res.avatarUrl, res.customAvatarUrl);
    });

    it('Deletes custom uploaded avatar and reverts back to avatarId', async () => {
      const res = await profileService.deleteCustomAvatar(mockUser.id);
      assert.strictEqual(res.customAvatarUrl, null);
      assert.strictEqual(res.avatarUrl, 'avatar-2');
    });
  });

  describe('Part 6: Real-Time Synchronization & Head-to-Head', () => {
    it('Emits server:profile_updated websocket event upon profile change', async () => {
      emittedEvents = [];
      await profileService.updateMyProfile(mockUser.id, {
        displayName: 'سامي المطور',
      });

      assert.strictEqual(emittedEvents.length, 1);
      assert.strictEqual(emittedEvents[0].event, 'server:profile_updated');
      assert.strictEqual(emittedEvents[0].data.userId, mockUser.id);
      assert.strictEqual(emittedEvents[0].data.displayName, 'سامي المطور');
    });

    it('Calculates head-to-head statistics cleanly between two players', async () => {
      const h2h = await profileService.getHeadToHead(mockUser.id, mockOpponent.id);
      assert.strictEqual(h2h.user1.id, mockUser.id);
      assert.strictEqual(h2h.user2.id, mockOpponent.id);
      assert.strictEqual(typeof h2h.totalMatches, 'number');
    });

    it('Rejects calculating head-to-head with same player ID', async () => {
      await assert.rejects(
        profileService.getHeadToHead(mockUser.id, mockUser.id),
        /لا يمكن حساب المواجهات المباشرة مع نفس اللاعب/
      );
    });
  });
});
