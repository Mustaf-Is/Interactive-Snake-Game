import { z } from 'zod';
import { checkPassword, currentPlayer, endSession, hashPassword, newSession, type Player } from './player-session.ts';
import { limitWrite } from './rate-limit.ts';

const credentials = z.object({
  action: z.enum(['register', 'login']),
  username: z.string().trim().min(3).max(16).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(1).max(128),
}).strict();
const json = (body: unknown, status = 200, cookie?: string) => Response.json(body, {status, headers: {'Cache-Control': 'no-store', ...(cookie ? {'Set-Cookie': cookie} : {})}});
const sameOrigin = (req: Request) => req.headers.get('Sec-Fetch-Site') !== 'cross-site' && (!req.headers.get('Origin') || req.headers.get('Origin') === new URL(req.url).origin);
function failure(error: unknown) { console.error('Player request failed', error); return json({error: 'Player services are unavailable. Please retry.'}, 503); }
async function readCredentials(req: Request) {
  if (!req.headers.get('Content-Type')?.startsWith('application/json') || !req.body) throw Error('Invalid request');
  const reader = req.body.getReader(), decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {await reader.cancel(); throw Error('Invalid request');}
      text += decoder.decode(value, {stream: true});
    }
    return credentials.parse(JSON.parse(text + decoder.decode()));
  } finally {reader.releaseLock();}
}

export function createPlayerApi(getSql: () => D1Database) {
  async function GET(req: Request) {
    try { return json({player: await currentPlayer(getSql(), req)}); } catch (error) { return failure(error); }
  }
  async function POST(req: Request) {
    if (!sameOrigin(req)) return json({error: 'Origin is not allowed'}, 403);
    try {
      const db = getSql();
      const limited = await limitWrite(db, req, 'account');
      if (limited) return limited;
      let input: z.infer<typeof credentials>;
      try {
        input = await readCredentials(req);
      } catch { return json({error: 'Use a 3–16 character username (letters, numbers, underscores) and a password up to 128 characters.'}, 400); }
      const key = input.username.toLowerCase();
      if (input.action === 'register') {
        if (input.password.length < 15) return json({error: 'Choose a password with at least 15 characters. Spaces are welcome.'}, 400);
        if (['guest', 'legacy'].includes(key)) return json({error: 'That player name is reserved.'}, 400);
        const limit = await limitWrite(db, req, 'register');
        if (limit) return limit;
        const player: Player = {id: crypto.randomUUID(), username: input.username, guest: false};
        const hash = await hashPassword(input.password);
        const insert = db.prepare('INSERT INTO players (id, username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').bind(player.id, player.username, key, hash, Date.now());
        try { return json({player}, 201, await newSession(db, req, player, insert)); }
        catch (error) {
          if (await db.prepare('SELECT id FROM players WHERE username_key = ?').bind(key).first()) return json({error: 'That player name is taken. Choose another.'}, 409);
          throw error;
        }
      }
      const limit = await limitWrite(db, req, 'loginName', Date.now(), key);
      if (limit) return limit;
      const row = await db.prepare('SELECT id, username, password_hash FROM players WHERE username_key = ?').bind(key).first<{id: string; username: string; password_hash: string}>();
      if (!await checkPassword(input.password, row?.password_hash ?? null)) return json({error: 'Player name or password is incorrect.'}, 401);
      const player: Player = {id: row!.id, username: row!.username, guest: false};
      return json({player}, 200, await newSession(db, req, player));
    } catch (error) { return failure(error); }
  }
  async function DELETE(req: Request) {
    if (!sameOrigin(req)) return json({error: 'Origin is not allowed'}, 403);
    try { return json({player: null}, 200, await endSession(getSql(), req)); } catch (error) { return failure(error); }
  }
  return {GET, POST, DELETE};
}
