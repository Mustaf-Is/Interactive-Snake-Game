import { scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export type Player = {id: string; username: string; guest: boolean};
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
export const tokenDigest = async (token: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
function cookieName(req: Request) { return new URL(req.url).protocol === 'https:' ? '__Host-snake97' : 'snake97_session'; }
function sessionToken(req: Request) {
  const token = req.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName(req)}=`))?.split('=')[1];
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function cookie(req: Request, token: string, maxAge = SESSION_SECONDS) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
export async function currentPlayer(db: D1Database, req: Request): Promise<Player | null> {
  const token = sessionToken(req);
  if (!token) return null;
  const row = await db.prepare(`SELECT p.id, p.username, p.username_key FROM player_sessions s
    JOIN players p ON p.id = s.player_id WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await tokenDigest(token), Date.now()).first<{id: string; username: string; username_key: string | null}>();
  return row ? {id: row.id, username: row.username, guest: row.username_key === null} : null;
}
export async function newSession(db: D1Database, req: Request, player: Player, insertPlayer?: D1PreparedStatement) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const statements = [db.prepare('DELETE FROM player_sessions WHERE expires_at <= ?').bind(Date.now())];
  if (insertPlayer) statements.push(insertPlayer);
  const old = sessionToken(req);
  if (old) statements.push(db.prepare('DELETE FROM player_sessions WHERE token_hash = ?').bind(await tokenDigest(old)));
  statements.push(db.prepare('INSERT INTO player_sessions (token_hash, player_id, expires_at) VALUES (?, ?, ?)').bind(await tokenDigest(token), player.id, Date.now() + SESSION_SECONDS * 1000));
  await db.batch(statements);
  return cookie(req, token);
}
export async function guestSession(db: D1Database, req: Request) {
  const existing = await currentPlayer(db, req);
  if (existing) return {player: existing, cookie: null};
  const id = crypto.randomUUID();
  const player: Player = {id, username: `GUEST-${id.slice(0, 6).toUpperCase()}`, guest: true};
  const statement = db.prepare('INSERT INTO players (id, username, created_at) VALUES (?, ?, ?)').bind(id, player.username, Date.now());
  return {player, cookie: await newSession(db, req, player, statement)};
}
export async function endSession(db: D1Database, req: Request) {
  const token = sessionToken(req);
  if (token) await db.prepare('DELETE FROM player_sessions WHERE token_hash = ?').bind(await tokenDigest(token)).run();
  return cookie(req, '', 0);
}

// OWASP's 16 MiB scrypt profile. The versioned format fixes parameters rather
// than accepting attacker-controlled work factors from request input.
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, {N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024}, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `scrypt-v1$${salt}$${hex(await derive(password, salt))}`;
}
export async function checkPassword(password: string, stored: string | null) {
  // Unknown usernames incur the same expensive work as known accounts.
  const dummy = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(64)}`;
  const [version, salt, expected] = (stored ?? dummy).split('$');
  if (version !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Invalid password record');
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex')) && stored !== null;
}
