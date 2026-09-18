import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Gender, AccountStatus } from '@baffa/shared';

export interface PersistedUser {
  id: string;
  googleId?: string | null;
  username: string;
  normalizedUsername: string;
  email?: string | null;
  normalizedEmail?: string | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  passwordHash?: string | null;
  displayName: string;
  avatarUrl: string;
  avatarId?: string | null;
  customAvatarUrl?: string | null;
  gender?: Gender | null;
  bio?: string | null;
  age?: number | null;
  challengeSlogan?: string | null;
  city?: string | null;
  playStyle?: string | null;
  favoriteTile?: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  accountStatus: AccountStatus;
  failedLoginAttempts: number;
  lockoutUntil?: string | null;
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
  preferredLanguage: string;
  timezone: string;
  stats: {
    totalMatches: number;
    matchesWon: number;
    matchesLost: number;
    totalRounds: number;
    roundsWon: number;
    totalPipsScored: number;
    currentStreak: number;
    bestStreak: number;
    humanMatchesWon: number;
    humanMatchesLost: number;
    botMatchesWon: number;
    botMatchesLost: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PersistedMatch {
  id: string;
  roomId: string;
  targetScore: number;
  winningTeam: number;
  team1Score: number;
  team2Score: number;
  status: string;
  durationSeconds: number;
  participants: {
    userId: string;
    team: number;
    seatIndex: number;
    pipsScored: number;
    isWinner: boolean;
    isBot: boolean;
  }[];
  startedAt: string;
  finishedAt: string;
}

export interface PersistedDbData {
  version: number;
  users: Record<string, PersistedUser>;
  matches: Record<string, PersistedMatch>;
}

@Injectable()
export class PersistenceService implements OnModuleInit {
  private readonly logger = new Logger(PersistenceService.name);
  private readonly dataDir: string;
  private readonly dbFilePath: string;

  private usersMap: Map<string, PersistedUser> = new Map();
  private matchesMap: Map<string, PersistedMatch> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), 'data');
    this.dbFilePath = path.join(this.dataDir, 'baffa_db.json');
    this.ensureDataDir();
    this.loadFromDisk();
  }

  async onModuleInit() {
    this.ensureDataDir();
    this.loadFromDisk();
  }

  private ensureDataDir(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
        this.logger.log(`Created permanent data directory at: ${this.dataDir}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to create data directory: ${err.message}`);
    }
  }

  /**
   * Load entire database from permanent disk file
   */
  public loadFromDisk(): void {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const parsed: PersistedDbData = JSON.parse(raw);

        this.usersMap.clear();
        this.matchesMap.clear();

        if (parsed.users) {
          for (const [id, user] of Object.entries(parsed.users)) {
            this.usersMap.set(id, user);
          }
        }

        if (parsed.matches) {
          for (const [id, match] of Object.entries(parsed.matches)) {
            this.matchesMap.set(id, match);
          }
        }

        this.logger.log(
          `Permanent Database Loaded: ${this.usersMap.size} users, ${this.matchesMap.size} matches from ${this.dbFilePath}`
        );
      } else {
        this.saveToDiskSync();
        this.logger.log(`Initialized fresh permanent database at: ${this.dbFilePath}`);
      }
    } catch (err: any) {
      this.logger.error(`Error reading permanent database from disk: ${err.message}`);
    }
  }

  /**
   * Save database atomically to disk
   */
  public saveToDiskSync(): void {
    try {
      this.ensureDataDir();
      const data: PersistedDbData = {
        version: 1,
        users: Object.fromEntries(this.usersMap),
        matches: Object.fromEntries(this.matchesMap),
      };

      const tempPath = `${this.dbFilePath}.tmp_${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbFilePath);
    } catch (err: any) {
      this.logger.error(`Failed to write permanent database to disk: ${err.message}`);
    }
  }

  public scheduleDiskSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveToDiskSync();
    }, 100);
  }

  // ==========================================
  // User Persistence Operations
  // ==========================================

  public getAllUsers(): PersistedUser[] {
    return Array.from(this.usersMap.values());
  }

  public getUserById(id: string): PersistedUser | undefined {
    return this.usersMap.get(id);
  }

  public findUser(predicate: (u: PersistedUser) => boolean): PersistedUser | undefined {
    for (const u of this.usersMap.values()) {
      if (predicate(u)) return u;
    }
    return undefined;
  }

  public saveUser(userData: Partial<PersistedUser> & { id: string }): PersistedUser {
    const existing = this.usersMap.get(userData.id);

    const defaultStats = {
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

    const merged: PersistedUser = {
      id: userData.id,
      googleId: userData.googleId !== undefined ? userData.googleId : existing?.googleId || null,
      username: userData.username || existing?.username || 'player_' + userData.id.substring(0, 5),
      normalizedUsername:
        userData.normalizedUsername ||
        existing?.normalizedUsername ||
        (userData.username ? userData.username.toLowerCase().trim() : 'player_' + userData.id.substring(0, 5)),
      email: userData.email !== undefined ? userData.email : existing?.email || null,
      normalizedEmail:
        userData.normalizedEmail !== undefined
          ? userData.normalizedEmail
          : existing?.normalizedEmail || (userData.email ? userData.email.toLowerCase().trim() : null),
      phone: userData.phone !== undefined ? userData.phone : existing?.phone || null,
      normalizedPhone: userData.normalizedPhone !== undefined ? userData.normalizedPhone : existing?.normalizedPhone || null,
      passwordHash: userData.passwordHash !== undefined ? userData.passwordHash : existing?.passwordHash || null,
      displayName: userData.displayName || existing?.displayName || userData.username || 'لاعب',
      avatarUrl: userData.avatarUrl || existing?.avatarUrl || 'avatar-1',
      avatarId: userData.avatarId !== undefined ? userData.avatarId : existing?.avatarId || 'avatar-1',
      customAvatarUrl:
        userData.customAvatarUrl !== undefined ? userData.customAvatarUrl : existing?.customAvatarUrl || null,
      gender: userData.gender !== undefined ? userData.gender : existing?.gender || null,
      bio: userData.bio !== undefined ? userData.bio : existing?.bio || null,
      age: userData.age !== undefined ? userData.age : existing?.age || null,
      challengeSlogan:
        userData.challengeSlogan !== undefined ? userData.challengeSlogan : existing?.challengeSlogan || null,
      city: userData.city !== undefined ? userData.city : existing?.city || null,
      playStyle: userData.playStyle !== undefined ? userData.playStyle : existing?.playStyle || null,
      favoriteTile: userData.favoriteTile !== undefined ? userData.favoriteTile : existing?.favoriteTile || null,
      emailVerified: userData.emailVerified !== undefined ? userData.emailVerified : existing?.emailVerified || false,
      phoneVerified: userData.phoneVerified !== undefined ? userData.phoneVerified : existing?.phoneVerified || false,
      accountStatus: userData.accountStatus || existing?.accountStatus || 'ACTIVE',
      failedLoginAttempts:
        userData.failedLoginAttempts !== undefined
          ? userData.failedLoginAttempts
          : existing?.failedLoginAttempts || 0,
      lockoutUntil: userData.lockoutUntil !== undefined ? userData.lockoutUntil : existing?.lockoutUntil || null,
      lastLoginAt: userData.lastLoginAt !== undefined ? userData.lastLoginAt : existing?.lastLoginAt || null,
      lastActiveAt:
        userData.lastActiveAt !== undefined ? userData.lastActiveAt : existing?.lastActiveAt || new Date().toISOString(),
      preferredLanguage: userData.preferredLanguage || existing?.preferredLanguage || 'ar',
      timezone: userData.timezone || existing?.timezone || 'Africa/Cairo',
      stats: {
        ...defaultStats,
        ...(existing?.stats || {}),
        ...(userData.stats || {}),
      },
      createdAt: existing?.createdAt || userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.usersMap.set(merged.id, merged);
    this.scheduleDiskSave();
    return merged;
  }

  // ==========================================
  // Match Persistence Operations
  // ==========================================

  public getAllMatches(): PersistedMatch[] {
    return Array.from(this.matchesMap.values()).sort(
      (a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime()
    );
  }

  public getMatchById(id: string): PersistedMatch | undefined {
    return this.matchesMap.get(id);
  }

  public saveMatch(match: PersistedMatch): void {
    this.matchesMap.set(match.id, match);
    this.scheduleDiskSave();
  }

  public getUserMatchHistory(userId: string): PersistedMatch[] {
    return this.getAllMatches().filter((m) =>
      m.participants.some((p) => p.userId === userId)
    );
  }
}
