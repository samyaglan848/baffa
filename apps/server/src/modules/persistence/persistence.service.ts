import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getDataDir, getLegacyDbFiles } from '../../config/runtime';
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
export class PersistenceService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PersistenceService.name);
  private readonly dataDir: string;
  private readonly dbFilePath: string;

  private usersMap: Map<string, PersistedUser> = new Map();
  private matchesMap: Map<string, PersistedMatch> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // One fixed location (or DATA_DIR) — no longer depends on the folder the server is started from.
    this.dataDir = getDataDir();
    this.dbFilePath = path.join(this.dataDir, 'baffa_db.json');
    this.ensureDataDir();
    this.loadFromDisk();
    this.mergeLegacyDatabases();
  }

  /** Flush pending writes when the host stops the server (e.g. a redeploy) so nothing is lost. */
  onApplicationShutdown(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
      this.saveToDiskSync();
    }
  }

  async onModuleInit() {
    // Already loaded in the constructor; reloading here would discard writes made in between.
  }

  /**
   * Older builds wrote to `data/` relative to the launch folder, so depending on how the server
   * was started users/matches ended up in different files. Merge them once into the canonical file.
   */
  private mergeLegacyDatabases(): void {
    if (process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test') return;
    let added = 0;
    for (const file of getLegacyDbFiles()) {
      if (path.resolve(file) === path.resolve(this.dbFilePath) || !fs.existsSync(file)) continue;
      try {
        const parsed: PersistedDbData = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const r = this.mergeRecords(parsed);
        added += r.usersAdded + r.matchesAdded;
      } catch (err: any) {
        this.logger.warn(`Could not merge legacy database ${file}: ${err.message}`);
      }
    }
    if (added > 0) {
      this.logger.log(`Merged ${added} records from legacy database files into ${this.dbFilePath}`);
      this.saveToDiskSync();
    }
  }

  /**
   * Adds users/matches from another copy of the database without losing anything: missing records
   * are added, and an existing user is replaced only by a copy that was updated more recently.
   */
  private mergeRecords(parsed: Partial<PersistedDbData>) {
    let usersAdded = 0;
    let usersUpdated = 0;
    let matchesAdded = 0;
    for (const [id, user] of Object.entries(parsed.users || {})) {
      if (!user || typeof user !== 'object') continue;
      const existing = this.usersMap.get(id);
      if (!existing || new Date(user.updatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime()) {
        if (existing) usersUpdated++;
        else usersAdded++;
        this.usersMap.set(id, user);
      }
    }
    for (const [id, match] of Object.entries(parsed.matches || {})) {
      if (match && !this.matchesMap.has(id)) {
        this.matchesMap.set(id, match);
        matchesAdded++;
      }
    }
    return { usersAdded, usersUpdated, matchesAdded };
  }

  /** Restores a backup copy of the database (admin only, see AdminController). Saved right away. */
  public importBackup(parsed: Partial<PersistedDbData>) {
    const result = this.mergeRecords(parsed);
    this.saveToDiskSync();
    this.logger.log(`Imported backup: ${JSON.stringify(result)}; accounts now ${this.usersMap.size}`);
    return { ...result, accounts: this.usersMap.size, matches: this.matchesMap.size };
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

      const tempPath = `${this.dbFilePath}.tmp_${process.pid}`;
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
      this.saveTimeout = null;
      this.saveToDiskSync();
    }, 250);
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

  public getUserByUsername(username: string): PersistedUser | undefined {
    if (!username) return undefined;
    const clean = username.trim().toLowerCase();
    return this.findUser((u) => u.normalizedUsername === clean || Boolean(u.username && u.username.toLowerCase() === clean));
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
