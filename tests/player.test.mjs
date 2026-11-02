import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { createPlayerApi } from '../lib/player-api.ts';
import { createGameApi } from '../lib/game-api.ts';
import { currentPlayer, hashPassword, checkPassword } from '../lib/player-session.ts';
import { newGame, step } from '../lib/snake.ts';

const runtime = new Miniflare({cf: false, modules: true, script: 'export default {fetch(){return new Response()}}', compatibilityDate: '2026-05-22', d1Databases: ['DB', 'MIGRATION_DB']});
let db, players, games;
const password = 'one more game in 1997';
before(async () => {
  db = await runtime.getD1Database('DB');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '').split(';').filter(s => s.trim())) await db.prepare(sql).run();
  }
  players = createPlayerApi(() => db); games = createGameApi(() => db);
});
after(() => runtime.dispose());
beforeEach(async () => {
  for (const table of ['games', 'player_sessions', 'players', 'rate_limits']) await db.prepare(`DELETE FROM ${table}`).run();
});
function client() {
  let cookie = '';
  return {
    get cookie() {return cookie;},
    set cookie(value) {cookie = value;},
    request(method = 'GET', data, path = '/api/player') {return new Request(`https://snake.example${path}`, {method, headers: {'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://snake.example'}, body: data ? JSON.stringify(data) : undefined});},
    async call(api, method = 'GET', data, path) {
      const response = await api[method](this.request(method, data, path));
      if (response.headers.has('Set-Cookie')) cookie = response.headers.get('Set-Cookie').split(';')[0];
      return response;
    },
    register(name = 'Arcade_97') {return this.call(players, 'POST', {action: 'register', username: name, password});},
    login(name = 'Arcade_97', pass = password) {return this.call(players, 'POST', {action: 'login', username: name, password: pass});},
    start(data = {difficulty: 'easy'}) {return this.call(games, 'POST', data, '/api/games');},
  };
}
test('passwords have independent salts and reject incorrect passwords', async () => {
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.ok(!a.includes(password));
  assert.equal(await checkPassword(password, a), true);
  assert.equal(await checkPassword('wrong', a), false);
  assert.equal(await checkPassword(password, null), false);
});
test('registration persists only a password hash and an opaque expiring cookie', async () => {
  const user = client();
  assert.deepEqual(await (await user.call(players)).json(), {player: null});
  const response = await user.register();
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.player).sort(), ['guest', 'id', 'username']);
  assert.equal(body.player.username, 'Arcade_97');
  assert.equal(body.player.guest, false);
  assert.match(response.headers.get('Set-Cookie'), /__Host-snake97=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  const row = await db.prepare('SELECT * FROM players').first();
  assert.equal(row.username_key, 'arcade_97');
  assert.match(row.password_hash, /^scrypt-v1\$/);
  const session = await db.prepare('SELECT * FROM player_sessions').first();
  assert.ok(!user.cookie.includes(session.token_hash));
  assert.ok(session.expires_at > Date.now());
  assert.equal((await (await user.call(players)).json()).player.id, row.id);
});
test('case-insensitive usernames remain unique under simultaneous registration', async () => {
  const responses = await Promise.all([client().register('Arcade_97'), client().register('ARCADE_97')]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM players').first()).n, 1);
});
test('invalid, reserved, short-password and extra-field registration inputs are rejected', async () => {
  const user = client();
  for (const input of [
    {username: 'ab'}, {username: 'no spaces'}, {username: '<script>'}, {username: 'LEGACY'}, {username: 'guest'},
    {password: '1234'}, {password: 'x'.repeat(129)}, {admin: true},
  ]) {
    await db.prepare('DELETE FROM rate_limits').run();
    const response = await user.call(players, 'POST', {action: 'register', username: 'Arcade_97', password, ...input});
    assert.equal(response.status, 400);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM players').first()).n, 0);
});
test('login uses a fresh token, works across devices, and logout revokes it', async () => {
  const first = client(); await first.register();
  const old = first.cookie;
  assert.equal((await first.login('ARCADE_97')).status, 200);
  assert.notEqual(first.cookie, old);
  const stolen = client(); stolen.cookie = old;
  assert.equal((await (await stolen.call(players)).json()).player, null);
  const second = client(); assert.equal((await second.login()).status, 200);
  assert.equal((await (await first.call(players)).json()).player.id, (await (await second.call(players)).json()).player.id);
  const beforeLogout = second.cookie;
  const logout = await second.call(players, 'DELETE');
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  second.cookie = beforeLogout;
  assert.equal((await (await second.call(players)).json()).player, null);
  assert.ok((await (await first.call(players)).json()).player);
});
test('incorrect and unknown logins share the same error; repeated attempts are limited', async () => {
  const user = client(); await user.register();
  const bad = await user.login('Arcade_97', 'wrong');
  const unknown = await user.login('Nobody_97', 'wrong');
  assert.equal(bad.status, 401); assert.equal(unknown.status, 401);
  assert.deepEqual(await bad.json(), await unknown.json());
  for (let i = 0; i < 4; i++) assert.equal((await user.login('Arcade_97', 'wrong')).status, 401);
  assert.equal((await user.login()).status, 429);
});
test('expired and malformed sessions cannot authenticate', async () => {
  const user = client(); await user.register();
  await db.prepare('UPDATE player_sessions SET expires_at = 0').run();
  assert.equal(await currentPlayer(db, user.request()), null);
  user.cookie = '__Host-snake97=not-a-token';
  assert.equal(await currentPlayer(db, user.request()), null);
});
test('cross-origin authentication and logout are rejected', async () => {
  for (const method of ['POST', 'DELETE']) {
    const req = client().request(method, {action: 'register', username: 'Arcade_97', password});
    req.headers.set('Origin', 'https://other.example');
    assert.equal((await players[method](req)).status, 403);
  }
});
test('authentication rejects malformed, oversized and non-JSON bodies', async () => {
  for (const [body, contentType] of [['{', 'application/json'], [' '.repeat(4097), 'application/json'], ['{}', 'text/plain']]) {
    const req = new Request('https://snake.example/api/player', {method: 'POST', headers: {'Content-Type': contentType}, body});
    assert.equal((await players.POST(req)).status, 400);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM players').first()).n, 0);
});
test('failed session creation rolls back registration and preserves the guest session', async t => {
  t.mock.method(console, 'error', () => {});
  const user = client(); const guest = await (await user.start()).json();
  await db.prepare("CREATE TRIGGER fail_session BEFORE INSERT ON player_sessions BEGIN SELECT RAISE(ABORT, 'injected failure'); END").run();
  try {assert.equal((await user.register()).status, 503);}
  finally {await db.prepare('DROP TRIGGER fail_session').run();}
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM players').first()).n, 1);
  assert.equal((await (await user.call(players)).json()).player.id, guest.player.id);
  assert.equal((await user.register()).status, 201);
});
test('guests start immediately, keep a browser identity, and cannot impersonate names', async () => {
  const guest = client();
  assert.equal((await guest.start({difficulty: 'easy', player_name: 'ARCADE'})).status, 400);
  const response = await guest.start(); assert.equal(response.status, 201);
  const run = await response.json();
  assert.equal(run.player.guest, true); assert.match(run.player.username, /^GUEST-/);
  assert.equal((await (await guest.start()).json()).player.id, run.player.id);
  const row = await db.prepare('SELECT player_id, player_name FROM games WHERE id = ?').bind(run.id).first();
  assert.deepEqual(row, {player_id: run.player.id, player_name: run.player.username});
  assert.equal((await guest.call(games, 'GET', undefined, '/api/games?scope=mine')).status, 200);
  assert.equal((await client().call(games, 'GET', undefined, '/api/games?scope=mine')).status, 401);
});
test('only the starting player can complete a run, including idempotent saves', async () => {
  const owner = client(), other = client();
  await owner.register(); await other.register('Other_97');
  const run = await (await owner.start()).json();
  let game = newGame(run.seed);
  while (!game.over) game = step(game, 'easy');
  await db.prepare('UPDATE games SET created_at = ? WHERE id = ?').bind(Date.now() - 100000, run.id).run();
  const replay = {id: run.id, ticks: game.ticks, turns: []};
  assert.equal((await other.call(games, 'PUT', replay, '/api/games')).status, 403);
  assert.equal((await client().call(games, 'PUT', replay, '/api/games')).status, 403);
  assert.equal((await owner.call(games, 'PUT', replay, '/api/games')).status, 200);
  assert.equal((await other.call(games, 'PUT', replay, '/api/games')).status, 403);
  const mine = await (await owner.call(games, 'GET', undefined, '/api/games?scope=mine')).json();
  const theirs = await (await other.call(games, 'GET', undefined, '/api/games?scope=mine')).json();
  assert.equal(mine.played, 1); assert.equal(theirs.played, 0);
  assert.equal(mine.recent[0].player_name, 'Arcade_97');
  // Logging in to this account in another browser grants the same owned records.
  const device = client(); await device.login();
  assert.equal((await (await device.call(games, 'GET', undefined, '/api/games?scope=mine')).json()).recent[0].id, run.id);
});
test('registering after guest play leaves guest and legacy scores unclaimed', async () => {
  const user = client(); const guest = await (await user.start()).json();
  await user.register();
  await db.prepare("INSERT INTO games (id, seed, difficulty, status, created_at) VALUES ('legacy', 97, 'easy', 'completed', 0)").run();
  const mine = await (await user.call(games, 'GET', undefined, '/api/games?scope=mine')).json();
  assert.equal(mine.played, 0);
  const all = await (await user.call(games)).json();
  assert.ok(all.recent.some(r => r.player_name === 'LEGACY'));
  assert.ok(all.recent.some(r => r.id === guest.id && r.player_name === guest.player.username));
});
test('authentication database failures return a generic retryable error', async t => {
  t.mock.method(console, 'error', () => {});
  const broken = createPlayerApi(() => {throw Error('private database details');});
  for (const method of ['GET', 'POST', 'DELETE']) {
    const response = await client().call(broken, method, method === 'POST' ? {action: 'login', username: 'Arcade_97', password} : undefined);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('private database details'));
  }
});
test('account migration preserves existing shared records without assigning an owner', async () => {
  const historical = await runtime.getD1Database('MIGRATION_DB');
  async function migrate(file) {
    for (const sql of readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '').split(';').filter(s => s.trim())) await historical.prepare(sql).run();
  }
  await migrate('0000_loud_santa_claus.sql');
  await migrate('0001_bouncy_banshee.sql');
  await historical.prepare("INSERT INTO games (id, seed, difficulty, status, score, length, food, duration_ms, created_at) VALUES ('old-score', 97, 'easy', 'completed', 100, 14, 10, 12000, 123)").run();
  await migrate('0002_purple_ironclad.sql');
  const row = await historical.prepare('SELECT * FROM games').first();
  assert.equal(row.score, 100); assert.equal(row.created_at, 123);
  assert.equal(row.player_id, null); assert.equal(row.player_name, 'LEGACY');
  assert.equal((await historical.prepare('SELECT COUNT(*) AS n FROM players').first()).n, 0);
});
