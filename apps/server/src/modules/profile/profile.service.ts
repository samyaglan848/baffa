import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UserProfile,
  UpdateProfileDto,
  PublicUserProfile,
  HeadToHeadStats,
  BAFFA_AVATARS,
  Gender,
} from '@baffa/shared';
import { LocalProfileStorage } from './storage/local-profile-storage';
import { ImageProcessor } from './storage/image-processor';
import * as fs from 'fs';
import * as path from 'path';
import { GameGateway } from '../../gateways/game.gateway';
import { PersistenceService, PersistedUser } from '../persistence/persistence.service';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  // In-Memory fallback for environments where Postgres is starting up or in test mode
  private readonly inMemoryProfiles = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalProfileStorage,
    private readonly persistence: PersistenceService,
    @Optional() private readonly gameGateway?: GameGateway
  ) {}

  /**
   * Helper: Map PersistedUser to UserProfile
   */
  public mapPersistedToProfile(u: PersistedUser): UserProfile {
    return {
      id: u.id,
      username: u.username,
      normalizedUsername: u.normalizedUsername,
      email: u.email || null,
      normalizedEmail: u.normalizedEmail || null,
      phone: u.phone || null,
      normalizedPhone: u.normalizedPhone || null,
      displayName: u.displayName || u.username,
      avatarUrl: u.customAvatarUrl || u.avatarUrl || 'avatar-1',
      avatarId: u.avatarId || 'avatar-1',
      customAvatarUrl: u.customAvatarUrl || null,
      gender: u.gender || null,
      bio: u.bio || null,
      age: u.age || null,
      challengeSlogan: u.challengeSlogan || null,
      city: u.city || null,
      playStyle: u.playStyle || null,
      favoriteTile: u.favoriteTile || null,
      emailVerified: !!u.emailVerified,
      phoneVerified: !!u.phoneVerified,
      accountStatus: u.accountStatus || 'ACTIVE',
      totalMatches: u.stats?.totalMatches || 0,
      matchesWon: u.stats?.matchesWon || 0,
      matchesLost: u.stats?.matchesLost || 0,
      totalRounds: u.stats?.totalRounds || 0,
      roundsWon: u.stats?.roundsWon || 0,
      totalPipsScored: u.stats?.totalPipsScored || 0,
      currentStreak: u.stats?.currentStreak || 0,
      bestStreak: u.stats?.bestStreak || 0,
      humanMatchesWon: u.stats?.humanMatchesWon || 0,
      humanMatchesLost: u.stats?.humanMatchesLost || 0,
      botMatchesWon: u.stats?.botMatchesWon || 0,
      botMatchesLost: u.stats?.botMatchesLost || 0,
      lastLoginAt: u.lastLoginAt || null,
      lastActiveAt: u.lastActiveAt || null,
      preferredLanguage: u.preferredLanguage || 'ar',
      timezone: u.timezone || 'Africa/Cairo',
      createdAt: u.createdAt || new Date().toISOString(),
    };
  }

  /**
   * Get authenticated user's complete profile
   */
  async getMyProfile(userId: string): Promise<UserProfile> {
    if (!userId) {
      throw new UnauthorizedException('معرف المستخدم مفقود');
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });

      if (user) {
        const mapped = this.mapUserToProfile(user);
        this.persistence.saveUser({
          id: userId,
          username: mapped.username,
          displayName: mapped.displayName,
          avatarUrl: mapped.avatarUrl,
          avatarId: mapped.avatarId,
          customAvatarUrl: mapped.customAvatarUrl,
          bio: mapped.bio,
          gender: mapped.gender,
          age: mapped.age,
          challengeSlogan: mapped.challengeSlogan,
          city: mapped.city,
          playStyle: mapped.playStyle,
          favoriteTile: mapped.favoriteTile,
        });
        return mapped;
      }
    } catch {
      // fallback to persistence
    }

    // Disk-backed Persistence Lookup
    const persisted = this.persistence.getUserById(userId);
    if (persisted) {
      return this.mapPersistedToProfile(persisted);
    }

    // New profile creation for newly seen user/guest
    const newProfile = this.persistence.saveUser({
      id: userId,
      username: 'player_' + userId.substring(0, 6),
      displayName: 'لاعب',
      avatarUrl: 'avatar-1',
      avatarId: 'avatar-1',
    });

    return this.mapPersistedToProfile(newProfile);
  }

  /**
   * Update authenticated user's profile with strict server-side validation and XSS sanitization
   */
  async updateMyProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    if (!userId) {
      throw new UnauthorizedException('معرف المستخدم مفقود');
    }

    const updates: any = {};
    const profileUpdates: any = {};

    // 1. Display Name Validation
    if (dto.displayName !== undefined) {
      const sanitizedName = this.sanitizeText(dto.displayName);
      if (sanitizedName.length < 2 || sanitizedName.length > 30) {
        throw new BadRequestException('الاسم الظاهر يجب أن يكون بين 2 و 30 حرفاً');
      }
      const normalizedName = sanitizedName.toLowerCase().trim();

      // Check uniqueness against persistence
      const conflictPersisted = this.persistence.findUser(
        (u) =>
          u.id !== userId &&
          (u.normalizedUsername === normalizedName ||
           u.username?.trim().toLowerCase() === normalizedName ||
           u.displayName?.trim().toLowerCase() === normalizedName)
      );
      if (conflictPersisted) {
        throw new BadRequestException('اسم المستخدم أو الاسم الظاهر مستخدم بالفعل، يرجى اختيار اسم آخر');
      }

      // Check uniqueness against Prisma
      try {
        const conflictPrisma = await this.prisma.user.findFirst({
          where: {
            id: { not: userId },
            OR: [
              { username: sanitizedName },
              { normalizedUsername: normalizedName },
              { displayName: sanitizedName },
            ],
          },
        });
        if (conflictPrisma) {
          throw new BadRequestException('اسم المستخدم أو الاسم الظاهر مستخدم بالفعل، يرجى اختيار اسم آخر');
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
      }

      updates.displayName = sanitizedName;
      updates.username = sanitizedName;
      updates.normalizedUsername = normalizedName;
      profileUpdates.displayName = sanitizedName;
    }

    // 2. Bio Validation
    if (dto.bio !== undefined) {
      if (dto.bio === null || dto.bio.trim() === '') {
        updates.bio = null;
        profileUpdates.bio = null;
      } else {
        const sanitizedBio = this.sanitizeText(dto.bio);
        if (sanitizedBio.length > 160) {
          throw new BadRequestException('النبذة الشخصية يجب ألا تتجاوز 160 حرفاً');
        }
        updates.bio = sanitizedBio;
        profileUpdates.bio = sanitizedBio;
      }
    }

    // 3. Gender Validation
    if (dto.gender !== undefined) {
      if (dto.gender === null) {
        updates.gender = null;
        profileUpdates.gender = null;
      } else {
        const validGenders: Gender[] = ['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY'];
        if (!validGenders.includes(dto.gender as Gender)) {
          throw new BadRequestException('قيمة النوع المحددة غير صالحة');
        }
        updates.gender = dto.gender;
        profileUpdates.gender = dto.gender;
      }
    }

    // 4. Avatar Selection Validation
    if (dto.avatarId !== undefined) {
      const isValidAvatar = BAFFA_AVATARS.some((a) => a.id === dto.avatarId);
      if (!isValidAvatar && dto.avatarId !== null) {
        throw new BadRequestException('معرف الأفاتار المختار غير صالح');
      }
      updates.avatarId = dto.avatarId;
      updates.avatarUrl = dto.avatarId || 'avatar-1';
      updates.customAvatarUrl = null;

      profileUpdates.avatarId = dto.avatarId;
      profileUpdates.customAvatarUrl = null;
    }

    // 5. Age Validation
    if (dto.age !== undefined) {
      if (dto.age === null || Number(dto.age) === 0) {
        updates.age = null;
        profileUpdates.age = null;
      } else {
        const parsedAge = Number(dto.age);
        if (isNaN(parsedAge) || parsedAge < 10 || parsedAge > 120) {
          throw new BadRequestException('العمر يجب أن يكون بين 10 و 120 عاماً');
        }
        updates.age = Math.floor(parsedAge);
        profileUpdates.age = Math.floor(parsedAge);
      }
    }

    // 6. Challenge Slogan Validation
    if (dto.challengeSlogan !== undefined) {
      if (dto.challengeSlogan === null || dto.challengeSlogan.trim() === '') {
        updates.challengeSlogan = null;
        profileUpdates.challengeSlogan = null;
      } else {
        const sanitizedSlogan = this.sanitizeText(dto.challengeSlogan);
        if (sanitizedSlogan.length > 100) {
          throw new BadRequestException('جملة التحدي يجب ألا تتجاوز 100 حرف');
        }
        updates.challengeSlogan = sanitizedSlogan;
        profileUpdates.challengeSlogan = sanitizedSlogan;
      }
    }

    // 7. City Validation
    if (dto.city !== undefined) {
      if (dto.city === null || dto.city.trim() === '') {
        updates.city = null;
        profileUpdates.city = null;
      } else {
        const sanitizedCity = this.sanitizeText(dto.city);
        if (sanitizedCity.length > 50) {
          throw new BadRequestException('اسم المدينة يجب ألا يتجاوز 50 حرفاً');
        }
        updates.city = sanitizedCity;
        profileUpdates.city = sanitizedCity;
      }
    }

    // 8. Play Style Validation
    if (dto.playStyle !== undefined) {
      if (dto.playStyle === null || dto.playStyle.trim() === '') {
        updates.playStyle = null;
        profileUpdates.playStyle = null;
      } else {
        const sanitizedStyle = this.sanitizeText(dto.playStyle);
        if (sanitizedStyle.length > 60) {
          throw new BadRequestException('أسلوب اللعب يجب ألا يتجاوز 60 حرفاً');
        }
        updates.playStyle = sanitizedStyle;
        profileUpdates.playStyle = sanitizedStyle;
      }
    }

    // 9. Favorite Tile Validation
    if (dto.favoriteTile !== undefined) {
      if (dto.favoriteTile === null || dto.favoriteTile.trim() === '') {
        updates.favoriteTile = null;
        profileUpdates.favoriteTile = null;
      } else {
        const sanitizedTile = this.sanitizeText(dto.favoriteTile);
        if (sanitizedTile.length > 30) {
          throw new BadRequestException('البلاطة المفضلة يجب ألا تتجاوز 30 حرفاً');
        }
        updates.favoriteTile = sanitizedTile;
        profileUpdates.favoriteTile = sanitizedTile;
      }
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...updates,
          profile: {
            upsert: {
              create: {
                displayName: updates.displayName || 'لاعب',
                bio: updates.bio,
                gender: updates.gender,
                age: updates.age,
                challengeSlogan: updates.challengeSlogan,
                city: updates.city,
                playStyle: updates.playStyle,
                favoriteTile: updates.favoriteTile,
                avatarId: updates.avatarId,
                customAvatarUrl: updates.customAvatarUrl,
              },
              update: profileUpdates,
            },
          },
        },
        include: { profile: true },
      });

      const profile = this.mapUserToProfile(updatedUser);
      this.persistence.saveUser({
        id: userId,
        username: profile.displayName || profile.username,
        normalizedUsername: (profile.displayName || profile.username).toLowerCase(),
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        avatarId: profile.avatarId,
        customAvatarUrl: profile.customAvatarUrl,
        bio: profile.bio,
        gender: profile.gender,
        age: profile.age,
        challengeSlogan: profile.challengeSlogan,
        city: profile.city,
        playStyle: profile.playStyle,
        favoriteTile: profile.favoriteTile,
      });
      this.broadcastProfileUpdate(profile);
      return profile;
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof UnauthorizedException) throw err;

      // Permanent Disk Persistence Fallback
      const persisted = this.persistence.saveUser({
        id: userId,
        username: updates.displayName || updates.username,
        normalizedUsername: updates.displayName ? updates.displayName.toLowerCase() : undefined,
        displayName: updates.displayName,
        bio: updates.bio,
        gender: updates.gender,
        age: updates.age,
        challengeSlogan: updates.challengeSlogan,
        city: updates.city,
        playStyle: updates.playStyle,
        favoriteTile: updates.favoriteTile,
        avatarId: updates.avatarId,
        avatarUrl: updates.avatarUrl,
        customAvatarUrl: updates.customAvatarUrl,
      });

      const profile = this.mapPersistedToProfile(persisted);
      this.broadcastProfileUpdate(profile);
      return profile;
    }
  }

  /**
   * Upload custom profile picture with strict magic bytes, size, and script validation
   */
  async uploadCustomAvatar(
    userId: string,
    buffer: Buffer,
    declaredMimeType?: string
  ): Promise<UserProfile> {
    if (!userId) {
      throw new UnauthorizedException('معرف المستخدم مفقود');
    }

    // 1. Process & Validate Image
    const validated = ImageProcessor.validateAndProcess(buffer, declaredMimeType);

    // 2. Save physical image file safely to disk
    await this.storage.saveImage(
      userId,
      validated.buffer,
      validated.mimeType,
      validated.extension
    );

    // 3. Generate portable Data URL for complete persistence resilience across cloud restarts
    const dataUrl = `data:${validated.mimeType};base64,${validated.buffer.toString('base64')}`;

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          avatarUrl: dataUrl,
          customAvatarUrl: dataUrl,
          profile: {
            upsert: {
              create: {
                displayName: 'لاعب',
                customAvatarUrl: dataUrl,
              },
              update: {
                customAvatarUrl: dataUrl,
              },
            },
          },
        },
        include: { profile: true },
      });

      const profile = this.mapUserToProfile(updatedUser);
      this.persistence.saveUser({
        id: userId,
        avatarUrl: dataUrl,
        customAvatarUrl: dataUrl,
      });
      this.broadcastProfileUpdate(profile);
      return profile;
    } catch {
      // Permanent Disk Persistence Fallback
      const persisted = this.persistence.saveUser({
        id: userId,
        avatarUrl: dataUrl,
        customAvatarUrl: dataUrl,
      });
      const profile = this.mapPersistedToProfile(persisted);
      this.broadcastProfileUpdate(profile);
      return profile;
    }
  }

  /**
   * Remove custom avatar photo and revert to selected avatar
   */
  async deleteCustomAvatar(userId: string): Promise<UserProfile> {
    if (!userId) {
      throw new UnauthorizedException('معرف المستخدم مفقود');
    }

    const existingUser = this.persistence.getUserById(userId);
    if (existingUser?.customAvatarUrl) {
      await this.storage.deleteImage(existingUser.customAvatarUrl).catch(() => {});
    }

    const defaultAvatar = existingUser?.avatarId || 'avatar-1';

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          avatarUrl: defaultAvatar,
          customAvatarUrl: null,
          profile: {
            update: {
              customAvatarUrl: null,
            },
          },
        },
        include: { profile: true },
      });

      const profile = this.mapUserToProfile(updatedUser);
      this.persistence.saveUser({
        id: userId,
        avatarUrl: defaultAvatar,
        customAvatarUrl: null,
      });
      this.broadcastProfileUpdate(profile);
      return profile;
    } catch {
      // Permanent Disk Persistence Fallback
      const persisted = this.persistence.saveUser({
        id: userId,
        avatarUrl: defaultAvatar,
        customAvatarUrl: null,
      });
      const profile = this.mapPersistedToProfile(persisted);
      this.broadcastProfileUpdate(profile);
      return profile;
    }
  }

  /**
   * Get public profile by username or ID (Sanitized, zero private data leakage)
   */
  async getPublicProfile(identifier: string): Promise<PublicUserProfile> {
    if (!identifier || typeof identifier !== 'string') {
      throw new BadRequestException('معرف اللاعب غير صالح');
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    try {
      const user: any = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: identifier },
            { normalizedUsername: cleanIdentifier },
            { username: identifier },
          ],
        },
        include: {
          profile: true,
          matchParticipants: {
            take: 5,
            include: {
              match: true,
            },
          },
        },
      });

      if (user) {
        const stats = user.profile || {
          totalMatches: 0,
          matchesWon: 0,
          matchesLost: 0,
          totalRounds: 0,
          roundsWon: 0,
          totalPipsScored: 0,
          currentStreak: 0,
          bestStreak: 0,
          humanMatchesWon: 0,
          humanMatchesLost: 0,
          botMatchesWon: 0,
          botMatchesLost: 0,
        };

        const winRate =
          stats.totalMatches > 0 ? Math.round((stats.matchesWon / stats.totalMatches) * 100) : 0;

        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatarUrl: user.customAvatarUrl || user.avatarUrl || 'avatar-1',
          avatarId: user.avatarId || 'avatar-1',
          customAvatarUrl: user.customAvatarUrl,
          bio: user.bio || user.profile?.bio || null,
          gender: (user.gender || user.profile?.gender) as Gender | null,
          age: user.age !== undefined ? user.age : (user.profile?.age !== undefined ? user.profile?.age : null),
          challengeSlogan: user.challengeSlogan || user.profile?.challengeSlogan || null,
          city: user.city || user.profile?.city || null,
          playStyle: user.playStyle || user.profile?.playStyle || null,
          favoriteTile: user.favoriteTile || user.profile?.favoriteTile || null,
          createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
          stats: {
            totalMatches: stats.totalMatches,
            matchesWon: stats.matchesWon,
            matchesLost: stats.matchesLost,
            winRate,
            totalRounds: stats.totalRounds,
            roundsWon: stats.roundsWon,
            totalPipsScored: stats.totalPipsScored,
            currentStreak: stats.currentStreak,
            bestStreak: stats.bestStreak,
            humanMatchesWon: stats.humanMatchesWon,
            humanMatchesLost: stats.humanMatchesLost,
            botMatchesWon: stats.botMatchesWon,
            botMatchesLost: stats.botMatchesLost,
          },
          recentMatches: [],
        };
      }
    } catch {}

    // Permanent Disk Persistence Lookup
    const persisted = this.persistence.findUser(
      (u) =>
        u.id === identifier ||
        u.normalizedUsername === cleanIdentifier ||
        u.username === identifier
    );

    if (!persisted) {
      throw new NotFoundException('لم يتم العثور على اللاعب المطلوب');
    }

    const stats = persisted.stats || {
      totalMatches: 0,
      matchesWon: 0,
      matchesLost: 0,
      totalRounds: 0,
      roundsWon: 0,
      totalPipsScored: 0,
      currentStreak: 0,
      bestStreak: 0,
      humanMatchesWon: 0,
      humanMatchesLost: 0,
      botMatchesWon: 0,
      botMatchesLost: 0,
    };

    const winRate =
      stats.totalMatches > 0 ? Math.round((stats.matchesWon / stats.totalMatches) * 100) : 0;

    const userMatches = this.persistence.getUserMatchHistory(persisted.id).slice(0, 5);
    const recentMatches = userMatches.map((m) => ({
      id: m.id,
      winningTeam: m.winningTeam,
      targetScore: m.targetScore,
      team1Score: m.team1Score,
      team2Score: m.team2Score,
      finishedAt: m.finishedAt,
    }));

    return {
      id: persisted.id,
      username: persisted.username,
      displayName: persisted.displayName || persisted.username,
      avatarUrl: persisted.customAvatarUrl || persisted.avatarUrl || 'avatar-1',
      avatarId: persisted.avatarId || 'avatar-1',
      customAvatarUrl: persisted.customAvatarUrl,
      bio: persisted.bio || null,
      gender: (persisted.gender || null) as Gender | null,
      age: persisted.age || null,
      challengeSlogan: persisted.challengeSlogan || null,
      city: persisted.city || null,
      playStyle: persisted.playStyle || null,
      favoriteTile: persisted.favoriteTile || null,
      createdAt: persisted.createdAt || new Date().toISOString(),
      stats: {
        totalMatches: stats.totalMatches,
        matchesWon: stats.matchesWon,
        matchesLost: stats.matchesLost,
        winRate,
        totalRounds: stats.totalRounds,
        roundsWon: stats.roundsWon,
        totalPipsScored: stats.totalPipsScored,
        currentStreak: stats.currentStreak,
        bestStreak: stats.bestStreak,
        humanMatchesWon: stats.humanMatchesWon,
        humanMatchesLost: stats.humanMatchesLost,
        botMatchesWon: stats.botMatchesWon,
        botMatchesLost: stats.botMatchesLost,
      },
      recentMatches,
    };
  }

  /**
   * Calculate head-to-head record between two players
   */
  async getHeadToHead(userIdA: string, userIdB: string): Promise<HeadToHeadStats> {
    if (!userIdA || !userIdB) {
      throw new BadRequestException('معرفات اللاعبين مطلوبة لحساب المواجهات المباشرة');
    }

    if (userIdA === userIdB) {
      throw new BadRequestException('لا يمكن حساب المواجهات المباشرة مع نفس اللاعب');
    }

    try {
      const [user1, user2] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userIdA } }),
        this.prisma.user.findUnique({ where: { id: userIdB } }),
      ]);

      if (!user1 || !user2) {
        throw new NotFoundException('أحد اللاعبين غير موجود');
      }

      // Query shared matches
      const sharedMatches: any[] = await this.prisma.match.findMany({
        where: {
          AND: [
            { participants: { some: { userId: userIdA } } },
            { participants: { some: { userId: userIdB } } },
          ],
        },
        include: {
          participants: true,
          rounds: true,
        },
        orderBy: { startedAt: 'desc' },
        take: 20,
      });

      let user1Wins = 0;
      let user2Wins = 0;
      let totalRounds = 0;
      let user1RoundsWon = 0;
      let user2RoundsWon = 0;

      for (const match of sharedMatches) {
        const p1 = match.participants?.find((p: any) => p.userId === userIdA);
        const p2 = match.participants?.find((p: any) => p.userId === userIdB);

        if (!p1 || !p2) continue;

        // Count match outcome
        if (match.winningTeam === p1.team) user1Wins++;
        if (match.winningTeam === p2.team) user2Wins++;

        totalRounds += match.rounds?.length || 0;
        for (const round of (match.rounds || [])) {
          if (round.winningTeam === p1.team) user1RoundsWon++;
          if (round.winningTeam === p2.team) user2RoundsWon++;
        }
      }

      const totalMatches = sharedMatches.length;
      const user1WinRate = totalMatches > 0 ? Math.round((user1Wins / totalMatches) * 100) : 0;
      const user2WinRate = totalMatches > 0 ? Math.round((user2Wins / totalMatches) * 100) : 0;

      return {
        user1: {
          id: user1.id,
          username: user1.username,
          avatar: user1.customAvatarUrl || user1.avatarUrl || 'avatar-1',
        },
        user2: {
          id: user2.id,
          username: user2.username,
          avatar: user2.customAvatarUrl || user2.avatarUrl || 'avatar-1',
        },
        totalMatches,
        user1Wins,
        user2Wins,
        user1WinRate,
        user2WinRate,
        totalRounds,
        user1RoundsWon,
        user2RoundsWon,
        lastMatches: sharedMatches.map((m: any) => ({
          id: m.id,
          roomId: m.roomId,
          targetScore: m.targetScore as any,
          winningTeam: m.winningTeam as any,
          team1Score: m.team1Score,
          team2Score: m.team2Score,
          hasBots: m.participants?.some((p: any) => p.isBot) || false,
          roundsCount: m.rounds?.length || 0,
          participants: (m.participants || []).map((p: any) => ({
            userId: p.userId,
            username: p.username,
            avatar: p.avatar,
            seat: p.seat as any,
            team: p.team as any,
            isBot: p.isBot,
            botId: p.botId as any,
            pipsScored: p.pipsScored,
          })),
          startedAt: m.startedAt ? m.startedAt.toISOString() : new Date().toISOString(),
          endedAt: m.endedAt ? m.endedAt.toISOString() : null,
          durationSeconds: m.durationSeconds,
        })),
      };
    } catch (err: any) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) throw err;

      // In-memory fallback
      return {
        user1: { id: userIdA, username: 'Player 1', avatar: 'avatar-1' },
        user2: { id: userIdB, username: 'Player 2', avatar: 'avatar-2' },
        totalMatches: 0,
        user1Wins: 0,
        user2Wins: 0,
        user1WinRate: 0,
        user2WinRate: 0,
        totalRounds: 0,
        user1RoundsWon: 0,
        user2RoundsWon: 0,
        lastMatches: [],
      };
    }
  }

  /**
   * Broadcast real-time profile update to connected socket clients, rooms, and game tables
   */
  private broadcastProfileUpdate(profile: UserProfile): void {
    if (this.gameGateway && typeof (this.gameGateway as any).handleProfileUpdated === 'function') {
      (this.gameGateway as any).handleProfileUpdated(profile);
    } else if (this.gameGateway && typeof this.gameGateway.server?.emit === 'function') {
      this.gameGateway.server.emit('server:profile_updated', {
        userId: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        avatarId: profile.avatarId,
        customAvatarUrl: profile.customAvatarUrl,
        bio: profile.bio,
        gender: profile.gender,
      });
    }
  }

  /**
   * Resolve avatar image buffer by filename or userId, checking disk first then permanent database persistence
   */
  public async getAvatarBuffer(identifier: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!identifier) return null;
    const cleanId = path.basename(identifier);

    // 1. Check disk candidates
    const diskDirs = [
      path.resolve(process.cwd(), 'uploads', 'avatars'),
      path.resolve(process.cwd(), 'apps', 'server', 'uploads', 'avatars'),
      path.resolve(__dirname, '..', '..', '..', '..', 'uploads', 'avatars'),
    ];
    for (const dir of diskDirs) {
      const filePath = path.join(dir, cleanId);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return { buffer: await fs.promises.readFile(filePath), mimeType };
      }
    }

    // 2. Lookup user in persistence by ID, username, or matching avatar string
    const user =
      this.persistence.getUserById(cleanId) ||
      this.persistence.getUserByUsername(cleanId) ||
      this.persistence.getAllUsers().find((u: any) =>
        (u.customAvatarUrl && u.customAvatarUrl.includes(cleanId)) ||
        (u.avatarUrl && u.avatarUrl.includes(cleanId))
      );

    if (user && user.customAvatarUrl) {
      let b64 = user.customAvatarUrl;
      let mimeType = 'image/jpeg';
      if (b64.startsWith('data:')) {
        const commaIdx = b64.indexOf(',');
        if (commaIdx !== -1) {
          const match = b64.substring(0, commaIdx).match(/^data:([^;]+);base64/);
          if (match) mimeType = match[1];
          b64 = b64.substring(commaIdx + 1);
        }
        return { buffer: Buffer.from(b64, 'base64'), mimeType };
      }
    }

    return null;
  }

  /**
   * Sanitizes string by stripping dangerous HTML tags and scripts
   */
  private sanitizeText(input: string): string {
    if (!input || typeof input !== 'string') return '';
    return input
      .replace(/<[^>]*>?/gm, '') // Strip HTML tags
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/`/g, '&#x60;')
      .trim();
  }

  /**
   * Maps Prisma User and Profile relation to UserProfile DTO
   */
  private mapUserToProfile(user: any): UserProfile {
    const p = user.profile || {};
    return {
      id: user.id,
      username: user.username,
      normalizedUsername: user.normalizedUsername,
      email: user.email,
      normalizedEmail: user.normalizedEmail,
      phone: user.phone,
      normalizedPhone: user.normalizedPhone,
      displayName: user.displayName || p.displayName || user.username,
      avatarUrl: user.customAvatarUrl || user.avatarUrl || 'avatar-1',
      avatarId: user.avatarId || p.avatarId || 'avatar-1',
      customAvatarUrl: user.customAvatarUrl || p.customAvatarUrl || null,
      gender: (user.gender || p.gender || null) as Gender | null,
      bio: user.bio || p.bio || null,
      age: user.age !== undefined ? user.age : (p.age !== undefined ? p.age : null),
      challengeSlogan: user.challengeSlogan || p.challengeSlogan || null,
      city: user.city || p.city || null,
      playStyle: user.playStyle || p.playStyle || null,
      favoriteTile: user.favoriteTile || p.favoriteTile || null,
      emailVerified: !!user.emailVerified,
      phoneVerified: !!user.phoneVerified,
      accountStatus: user.accountStatus || 'ACTIVE',
      totalMatches: p.totalMatches || 0,
      matchesWon: p.matchesWon || 0,
      matchesLost: p.matchesLost || 0,
      totalRounds: p.totalRounds || 0,
      roundsWon: p.roundsWon || 0,
      totalPipsScored: p.totalPipsScored || 0,
      currentStreak: p.currentStreak || 0,
      bestStreak: p.bestStreak || 0,
      humanMatchesWon: p.humanMatchesWon || 0,
      humanMatchesLost: p.humanMatchesLost || 0,
      botMatchesWon: p.botMatchesWon || 0,
      botMatchesLost: p.botMatchesLost || 0,
      lastLoginAt: user.lastLoginAt?.toISOString() || null,
      lastActiveAt: user.lastActiveAt?.toISOString() || null,
      preferredLanguage: user.preferredLanguage || 'ar',
      timezone: user.timezone || 'Africa/Cairo',
      createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Seeds in-memory profile for testing
   */
  public seedInMemoryProfile(profile: UserProfile): void {
    this.inMemoryProfiles.set(profile.id, profile);
    this.persistence.saveUser({
      id: profile.id,
      username: profile.username,
      normalizedUsername: profile.normalizedUsername || profile.username.toLowerCase(),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      avatarId: profile.avatarId,
      customAvatarUrl: profile.customAvatarUrl,
      gender: profile.gender,
      bio: profile.bio,
      age: profile.age,
      challengeSlogan: profile.challengeSlogan,
      city: profile.city,
      playStyle: profile.playStyle,
      favoriteTile: profile.favoriteTile,
      email: profile.email || null,
      emailVerified: profile.emailVerified,
      stats: {
        totalMatches: profile.totalMatches || 0,
        matchesWon: profile.matchesWon || 0,
        matchesLost: profile.matchesLost || 0,
        totalRounds: profile.totalRounds || 0,
        roundsWon: profile.roundsWon || 0,
        totalPipsScored: profile.totalPipsScored || 0,
        currentStreak: profile.currentStreak || 0,
        bestStreak: profile.bestStreak || 0,
        humanMatchesWon: profile.humanMatchesWon || 0,
        humanMatchesLost: profile.humanMatchesLost || 0,
        botMatchesWon: profile.botMatchesWon || 0,
        botMatchesLost: profile.botMatchesLost || 0,
      },
    });
  }
}
