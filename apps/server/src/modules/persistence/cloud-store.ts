import { Logger } from '@nestjs/common';

/**
 * Permanent storage in a hosted PostgreSQL database (e.g. a free Neon database).
 *
 * The server's own disk on free hosting is wiped whenever the server restarts or wakes from sleep,
 * which deleted every account and match and logged everybody out. When STORE_DATABASE_URL is set,
 * every account, match and the login signing keys are also kept in this database, and loaded back
 * on start, so they survive restarts and are the same whichever device a player signs in from.
 *
 * Records are stored as JSON documents (one row per account / match), so the data model of the
 * game does not depend on database migrations.
 */
export type CloudTable = 'baffa_users' | 'baffa_matches';

export class CloudStore {
  private readonly logger = new Logger(CloudStore.name);

  constructor(private readonly pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>; end?: () => Promise<void> }) {}

  /** Built from STORE_DATABASE_URL (not DATABASE_URL, which switches on the unrelated Prisma code). */
  static fromEnv(): CloudStore | null {
    const url = CloudStore.normalizeUrl(process.env.STORE_DATABASE_URL || '');
    if (!url) return null;
    // Loaded lazily so the server still starts where the package or the variable is missing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      // Hosted databases (Neon, Supabase, ...) require TLS; their certificates are not in Node's bundle on every host.
      ssl: /sslmode=disable/.test(url) || /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    pool.on?.('error', (err: Error) => new Logger(CloudStore.name).warn(`Database connection error: ${err.message}`));
    return new CloudStore(pool);
  }

  /**
   * Accepts the link as people paste it from a provider: Neon's "copy" button can give
   * `psql 'postgresql://...'`, with quotes and a `channel_binding` option the driver does not take.
   */
  static normalizeUrl(raw: string): string {
    let url = raw.trim();
    url = url.replace(/^psql\s+/i, '').trim();
    url = url.replace(/^['"]|['"]$/g, '').trim();
    if (!/^postgres(ql)?:\/\//i.test(url)) return url;
    url = url.replace(/([?&])channel_binding=[^&]*(&?)/i, (_m, sep, tail) => (tail ? sep : '')).replace(/[?&]$/, '');
    return url;
  }

  /** Error text with any credentials removed, safe to show in the health report. */
  static describeError(err: any): string {
    const text = String(err?.message || err || 'unknown error');
    return text.replace(/\/\/[^\s/@]*@/g, '//***@').replace(/password[^,;]*/gi, 'password ***').slice(0, 200);
  }

  async init(): Promise<void> {
    for (const table of ['baffa_users', 'baffa_matches'] as CloudTable[]) {
      if (await this.tableExists(table)) continue;
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`
      );
    }
    if (!(await this.tableExists('baffa_meta'))) {
      await this.pool.query(`CREATE TABLE IF NOT EXISTS baffa_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    }
  }

  private async tableExists(table: string): Promise<boolean> {
    try {
      await this.pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  async loadAll<T>(table: CloudTable): Promise<Record<string, T>> {
    const res = await this.pool.query(`SELECT id, data FROM ${table}`);
    const out: Record<string, T> = {};
    for (const row of res.rows) {
      out[row.id] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    }
    return out;
  }

  async upsertMany(table: CloudTable, records: { id: string; json: string }[]): Promise<void> {
    for (const r of records) {
      await this.pool.query(
        `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [r.id, r.json]
      );
    }
  }

  async getMeta(key: string): Promise<string | null> {
    const res = await this.pool.query(`SELECT value FROM baffa_meta WHERE key = $1`, [key]);
    return res.rows[0]?.value ?? null;
  }

  /** Stores a value only if none exists yet and returns the value that is stored (first writer wins). */
  async ensureMeta(key: string, value: string): Promise<string> {
    await this.pool.query(`INSERT INTO baffa_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [key, value]);
    return (await this.getMeta(key)) ?? value;
  }

  async close(): Promise<void> {
    try {
      await this.pool.end?.();
    } catch (err: any) {
      this.logger.warn(`Closing database pool failed: ${err.message}`);
    }
  }
}
