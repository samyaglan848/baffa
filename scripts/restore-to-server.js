#!/usr/bin/env node
/**
 * Restores the local backup (accounts, matches, profile photos) onto the game server.
 *
 *   node scripts/restore-to-server.js https://baffa-z8mz.onrender.com
 *
 * Needs ADMIN_IMPORT_TOKEN: the same value as on the server, taken from the environment or from
 * apps/server/.env (so it never has to be typed into a chat or a command line). Nothing on the
 * server is deleted: missing records are added and newer copies on the server are kept.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = (process.argv[2] || 'https://baffa-z8mz.onrender.com').replace(/\/$/, '');

function readToken() {
  if (process.env.ADMIN_IMPORT_TOKEN) return process.env.ADMIN_IMPORT_TOKEN.trim();
  try {
    const env = fs.readFileSync(path.join(root, 'apps', 'server', '.env'), 'utf-8');
    const m = env.match(/^\s*ADMIN_IMPORT_TOKEN\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  } catch {}
  return '';
}

function loadDb(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return { users: {}, matches: {} };
  }
}

async function post(urlPath, body, token) {
  const res = await fetch(server + urlPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${urlPath} -> ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

(async () => {
  const token = readToken();
  if (token.length < 24) {
    console.error('ADMIN_IMPORT_TOKEN missing: put the same value as on the server in apps/server/.env');
    process.exit(1);
  }

  // Merge the two local copies first: per account keep the most recently updated version.
  const users = {};
  const matches = {};
  for (const file of [path.join(root, 'data', 'baffa_db.json'), path.join(root, 'apps', 'server', 'data', 'baffa_db.json')]) {
    const db = loadDb(file);
    for (const [id, u] of Object.entries(db.users || {})) {
      const cur = users[id];
      if (!cur || new Date(u.updatedAt || 0) > new Date(cur.updatedAt || 0)) users[id] = u;
    }
    for (const [id, m] of Object.entries(db.matches || {})) if (!matches[id]) matches[id] = m;
  }
  console.log(`Backup: ${Object.keys(users).length} accounts, ${Object.keys(matches).length} matches`);
  const result = await post('/api/admin/import-db', { users, matches }, token);
  console.log('Server:', result);

  const seen = new Set();
  let saved = 0;
  for (const dir of [path.join(root, 'uploads', 'avatars'), path.join(root, 'apps', 'server', 'uploads', 'avatars')]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (seen.has(name) || !/\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
      seen.add(name);
      const r = await post('/api/admin/import-avatar', { name, base64: fs.readFileSync(path.join(dir, name)).toString('base64') }, token);
      if (r.saved) saved++;
    }
  }
  console.log(`Photos: ${saved} uploaded, ${seen.size - saved} already there`);
})().catch((err) => {
  console.error('Restore failed:', err.message);
  process.exit(1);
});
