import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { createGameApi } from '../lib/game-api.ts';
import { newGame, step } from '../lib/snake.ts';
import { limitWrite, WRITE_LIMITS } from '../lib/rate-limit.ts';
import { guestSession } from '../lib/player-session.ts';

const runtime = new Miniflare({ cf: false, modules: true, script: 'export default {fetch(){return new Response()}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
let db;
let api;
const id = '00000000-0000-4000-8000-000000000001';
let cookie = '';
const request = (method, payload) => new Request('http://localhost/api/games', { method, headers: {'Content-Type': 'application/json', Cookie: cookie}, body: method === 'GET' ? undefined : JSON.stringify(payload) });
const finish = (payload, handler = api.PUT) => handler(request('PUT', { id, ...payload }));

before(async () => {
  db = await runtime.getD1Database('DB');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '').split(';').filter(s => s.trim())) await db.prepare(sql).run();
  }
});
after(() => runtime.dispose());
beforeEach(async () => {
  await db.prepare('DELETE FROM games').run();
  await db.prepare('DELETE FROM rate_limits').run();
  api = createGameApi(() => db);
  cookie = '';
  const session = await guestSession(db, request('GET'));
  cookie = session.cookie.split(';')[0];
  await db.prepare("INSERT INTO games (id, seed, difficulty, status, created_at, player_id, player_name) VALUES (?, 97, 'easy', 'started', ?, ?, ?)").bind(id, Date.now() - 100000, session.player.id, session.player.username).run();
});

function replay(eat) {
  let game = newGame(97);
  const turns = [];
  function move(direction, count) {
    for (let i = 0; i < count; i++) {
      turns.push({tick: game.ticks + 1, direction});
      game = step(game, 'easy', direction);
      assert.equal(game.over, false);
    }
  }
  if (eat) {
    const food = game.food;
    if (food.x < 8 && food.y === 11) { move('up', 1); move('left', 8 - food.x); move('down', 1); }
    else { if (food.y !== 11) move(food.y < 11 ? 'up' : 'down', Math.abs(food.y - 11)); if (food.x !== 8) move(food.x < 8 ? 'left' : 'right', Math.abs(food.x - 8)); }
  }
  while (!game.over) game = step(game, 'easy');
  return { payload: { ticks: game.ticks, turns }, score: game.eaten * 10 };
}

test('unknown game ID returns 404', async () => {
  const response = await finish({id: crypto.randomUUID(), ticks: 1, turns: []});
  assert.equal(response.status, 404);
});
for (const [name, payload] of Object.entries({
  'invalid UUID': {id: 'bad', ticks: 1, turns: []},
  'zero ticks': {ticks: 0, turns: []},
  'fractional ticks': {ticks: 1.5, turns: []},
  'too many ticks': {ticks: 100001, turns: []},
  'too many turns': {ticks: 20001, turns: Array.from({length: 20001}, (_, i) => ({tick: i + 1, direction: 'up'}))},
  'invalid direction': {ticks: 2, turns: [{tick: 1, direction: 'diagonal'}]},
  'score tampering': {...replay(false).payload, score: 999},
  'out-of-order turns': {ticks: 20, turns: [{tick: 2, direction: 'up'}, {tick: 1, direction: 'left'}]},
  'duplicate turn ticks': {ticks: 20, turns: [{tick: 2, direction: 'up'}, {tick: 2, direction: 'left'}]},
  'turn after final tick': {ticks: 1, turns: [{tick: 2, direction: 'up'}]},
  'unfinished run': {ticks: 1, turns: []},
  'continued after collision': {...replay(false).payload, ticks: replay(false).payload.ticks + 1},
})) test(`rejects ${name}`, async () => {
  const response = await finish(payload);
  assert.equal(response.status, 400);
  const expected = {
    'out-of-order turns': 'Invalid turn sequence.',
    'duplicate turn ticks': 'Invalid turn sequence.',
    'turn after final tick': 'Invalid turn sequence.',
    'unfinished run': 'This game has not ended.',
    'continued after collision': 'Replay continued after game over.',
  }[name] ?? 'Invalid game replay.';
  assert.equal((await response.json()).error, expected);
  assert.equal((await db.prepare('SELECT status FROM games WHERE id = ?').bind(id).first()).status, 'started');
});

test('rejects malformed and oversized request bodies', async () => {
  for (const body of ['{', ' '.repeat(1000001)]) {
    const response = await api.PUT(new Request('http://localhost/api/games', {method: 'PUT', body}));
    assert.equal(response.status, 400);
  }
});
test('rejects cross-origin writes', async () => {
  for (const method of ['POST', 'PUT']) {
    const req = request(method, {difficulty: 'easy'});
    req.headers.set('Origin', 'https://elsewhere.example');
    assert.equal((await api[method](req)).status, 403);
  }
});
test('rejects replay faster than server elapsed time', async () => {
  await db.prepare('UPDATE games SET created_at = ? WHERE id = ?').bind(Date.now(), id).run();
  assert.equal((await finish(replay(false).payload)).status, 400);
});
test('database failures return recoverable 503 responses', async t => {
  t.mock.method(console, 'error', () => {});
  const broken = createGameApi(() => { throw Error('injected database failure'); });
  for (const method of ['GET', 'POST', 'PUT']) {
    const res = await broken[method](request(method, method === 'POST' ? {difficulty: 'easy'} : {id, ...replay(false).payload}));
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /retry/i);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
});
test('write limits enforce separate atomic budgets across API instances', async t => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const apis = [createGameApi(() => db), createGameApi(() => db)];
  const starts = await Promise.all(Array.from({length: 20}, (_, i) => apis[i % 2].POST(request('POST', {difficulty: 'easy'}))));
  assert.equal(starts.filter(r => r.status === 201).length, WRITE_LIMITS.start);
  assert.equal(starts.filter(r => r.status === 429).length, 20 - WRITE_LIMITS.start);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM games').first()).n, WRITE_LIMITS.start + 1);
  for (let i = 0; i < WRITE_LIMITS.submit; i++) assert.equal((await finish({ticks: 1, turns: []})).status, 400);
  const denied = await finish(replay(false).payload);
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('Retry-After')) > 0);
  assert.equal((await db.prepare('SELECT status FROM games WHERE id = ?').bind(id).first()).status, 'started');
});
test('budgets reset, expire old keys, and separate trusted client addresses', async () => {
  const req = request('POST', {});
  req.headers.set('CF-Connecting-IP', '192.0.2.1');
  for (let i = 0; i < WRITE_LIMITS.start; i++) assert.equal(await limitWrite(db, req, 'start', 60001), null);
  assert.equal((await limitWrite(db, req, 'start', 60001)).status, 429);
  req.headers.set('CF-Connecting-IP', '192.0.2.2');
  assert.equal(await limitWrite(db, req, 'start', 60001), null);
  req.headers.set('CF-Connecting-IP', '192.0.2.1');
  assert.equal(await limitWrite(db, req, 'start', 120001), null);
  const rows = (await db.prepare('SELECT * FROM rate_limits').all()).results;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].window_start, 120000);
  assert.ok(!rows[0].key.includes('192.0.2.1'));
});
test('database write failure leaves the run retryable', async t => {
  t.mock.method(console, 'error', () => {});
  await db.prepare("CREATE TRIGGER fail_completion BEFORE UPDATE ON games BEGIN SELECT RAISE(ABORT, 'injected failure'); END").run();
  try { assert.equal((await finish(replay(true).payload)).status, 503); }
  finally { await db.prepare('DROP TRIGGER fail_completion').run(); }
  assert.equal((await db.prepare('SELECT status FROM games WHERE id = ?').bind(id).first()).status, 'started');
  assert.equal((await finish(replay(true).payload)).status, 200);
});
test('save persists the replay and repeated completion returns stored score', async () => {
  const run = replay(true);
  assert.ok(run.score > replay(false).score);
  assert.deepEqual(await (await finish(run.payload)).json(), {saved: true, score: run.score});
  assert.deepEqual(await (await finish(replay(false).payload)).json(), {saved: true, score: run.score});
  const row = await db.prepare('SELECT * FROM games WHERE id = ?').bind(id).first();
  assert.equal(row.score, run.score);
  assert.equal(row.status, 'completed');
  assert.equal(row.length, 4 + row.food);
  assert.ok(row.duration_ms > 0);
  assert.ok(row.completed_at > 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM games').first()).n, 1);
});
test('simultaneous duplicate completions persist one run and one global score', async () => {
  const run = replay(true);
  const responses = await Promise.all(Array.from({length: 3}, () => finish(run.payload)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {saved: true, score: run.score});
  }
  const response = await api.GET();
  assert.equal(response.status, 200);
  const stats = await response.json();
  assert.equal(stats.played, 1);
  assert.equal(stats.best, run.score);
  assert.equal(stats.top.length, 1);
  assert.equal(stats.top[0].id, id);
  assert.equal(stats.recent[0].status, 'completed');
});
test('simultaneous different completions both return the canonical stored result', async () => {
  // Hold both initial reads until each has observed started. The writes still
  // execute against real D1, reproducing the losing conditional update.
  let reads = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const racingDb = new Proxy(db, {get(target, property) {
    if (property !== 'prepare') { const value = target[property]; return typeof value === 'function' ? value.bind(target) : value; }
    return sql => {
      const statement = target.prepare(sql);
      if (!sql.startsWith('SELECT seed')) return statement;
      return {bind: (...values) => ({first: async () => {
        const row = await statement.bind(...values).first();
        if (++reads === 2) release();
        await barrier;
        return row;
      }})};
    };
  }});
  const racing = createGameApi(() => racingDb);
  const responses = await Promise.all([finish(replay(false).payload, racing.PUT), finish(replay(true).payload, racing.PUT)]);
  const canonical = (await db.prepare('SELECT score FROM games WHERE id = ?').bind(id).first()).score;
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {saved: true, score: canonical});
  }
});
