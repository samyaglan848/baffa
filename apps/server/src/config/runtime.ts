import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';

const logger = new Logger('Runtime');

let cachedDataDir: string | null = null;

/**
 * Single, stable location for the permanent JSON database and generated secrets.
 *
 * Previously the data folder depended on the folder the server was launched from
 * (`data/` at the repo root vs `apps/server/data/`), which silently split users and
 * matches into two different databases.
 *
 * Resolution order:
 *  1. DATA_DIR env variable (use this to point at a persistent disk in production, e.g. Render Disk)
 *  2. Under the Node test runner: an isolated temp folder so tests never touch real data
 *  3. apps/server/data (resolved from this file, independent of the working directory)
 */
export function getDataDir(): string {
  if (cachedDataDir) return cachedDataDir;

  let dir: string;
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim()) {
    dir = path.resolve(process.env.DATA_DIR.trim());
  } else if (process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test') {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baffa-test-data-'));
  } else {
    // src/config -> apps/server   |   dist/config -> apps/server
    dir = path.resolve(__dirname, '..', '..', 'data');
  }

  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err: any) {
    logger.error(`Could not create data directory ${dir}: ${err.message}`);
  }

  cachedDataDir = dir;
  return dir;
}

/**
 * Legacy database locations that older builds wrote to, depending on the launch folder.
 * Used once at startup to merge any users/matches that ended up in the "other" file.
 */
export function getLegacyDbFiles(): string[] {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'baffa_db.json'),
    path.resolve(process.cwd(), 'apps', 'server', 'data', 'baffa_db.json'),
    path.resolve(__dirname, '..', '..', '..', '..', 'data', 'baffa_db.json'),
  ];
  return Array.from(new Set(candidates));
}

const secretCache = new Map<string, string>();

/**
 * Returns a signing secret. Uses the env variable when it is set to a reasonably long value.
 * Otherwise a random secret is generated once and stored in the data folder, instead of
 * falling back to a hard-coded string that anyone reading the source code could use to
 * forge login tokens.
 */
export function getSecret(envName: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const cached = secretCache.get(envName);
  if (cached) return cached;

  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim().length >= 16) {
    secretCache.set(envName, fromEnv.trim());
    return fromEnv.trim();
  }

  const file = path.join(getDataDir(), `.${envName.toLowerCase()}`);
  let secret = '';
  try {
    if (fs.existsSync(file)) {
      secret = fs.readFileSync(file, 'utf-8').trim();
    }
  } catch {}

  if (!secret || secret.length < 32) {
    secret = crypto.randomBytes(48).toString('hex');
    try {
      fs.writeFileSync(file, secret, { encoding: 'utf-8', mode: 0o600 });
    } catch (err: any) {
      logger.error(`Could not persist generated ${envName}: ${err.message}`);
    }
    if (!process.env.NODE_TEST_CONTEXT) {
      logger.warn(
        `${envName} is not set. A random secret was generated and saved in the data folder. ` +
          `Set ${envName} in the server environment so logins survive redeploys.`
      );
    }
  }

  secretCache.set(envName, secret);
  return secret;
}

let cachedUploadsDir: string | null | undefined;

/**
 * Persistent folder for uploaded profile photos: `<DATA_DIR>/uploads`, or null when DATA_DIR is
 * not set (local development keeps using the project's `uploads/` folders).
 *
 * The project folders are wiped on every redeploy on hosts like Render, so with DATA_DIR pointing
 * at a persistent disk the photos live next to the database. On first use, photos found in the
 * old project folders are copied over once so nothing goes missing during the move.
 */
export function getPersistentUploadsDir(): string | null {
  if (cachedUploadsDir !== undefined) return cachedUploadsDir;
  if (!process.env.DATA_DIR || !process.env.DATA_DIR.trim()) {
    cachedUploadsDir = null;
    return null;
  }

  const dir = path.join(getDataDir(), 'uploads');
  const avatarsDir = path.join(dir, 'avatars');
  try {
    fs.mkdirSync(avatarsDir, { recursive: true });
    const legacyAvatarDirs = [
      path.resolve(process.cwd(), 'uploads', 'avatars'),
      path.resolve(process.cwd(), 'apps', 'server', 'uploads', 'avatars'),
      path.resolve(__dirname, '..', '..', '..', '..', 'uploads', 'avatars'),
    ];
    let copied = 0;
    for (const legacy of new Set(legacyAvatarDirs)) {
      if (path.resolve(legacy) === path.resolve(avatarsDir) || !fs.existsSync(legacy)) continue;
      for (const name of fs.readdirSync(legacy)) {
        const target = path.join(avatarsDir, name);
        if (!fs.existsSync(target)) {
          fs.copyFileSync(path.join(legacy, name), target);
          copied++;
        }
      }
    }
    if (copied > 0) logger.log(`Copied ${copied} profile photos into ${avatarsDir}`);
  } catch (err: any) {
    logger.error(`Could not prepare uploads directory ${dir}: ${err.message}`);
  }

  cachedUploadsDir = dir;
  return dir;
}
