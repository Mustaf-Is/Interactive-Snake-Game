import { cpSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './sites-env.mjs';

// Every launch gets its own database, never the developer's .wrangler/state.
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(path.join(root, '.wrangler/e2e'), {recursive: true});
const state = mkdtempSync(path.join(root, '.wrangler/e2e/run-'));
// Freeze the validated build so source edits or background file sync cannot
// restart the preview in the middle of a browser request.
const artifact = path.join(state, 'artifact');
cpSync(path.join(root, 'dist'), artifact, {recursive: true});
const cli = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const node = process.env.npm_node_execpath || process.execPath;
const common = ['--local', '--config', path.join(artifact, 'server/wrangler.json'), '--persist-to', state];
function execute(args) {
  const result = spawnSync(node, ['--import', './scripts/sites-env.mjs', cli, 'd1', 'execute', 'DB', ...common, ...args], {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const file of readdirSync(path.join(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) execute(['--file', `drizzle/${file}`]);
// A full high-scoring leaderboard proves smoke checks do not depend on rank.
execute(['--command', `INSERT INTO games (id, seed, difficulty, status, score, created_at) VALUES ${Array.from({length: 5}, (_, i) => `('fixture-${i}', 97, 'easy', 'completed', 9990, ${i})`).join(',')}`]);
const server = spawn(node, ['--import', './scripts/sites-env.mjs', cli, 'dev', ...common, '--ip', '127.0.0.1', '--port', '4173', '--inspector-port', '0'], {stdio: 'inherit'});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('error', error => { throw error; });
server.on('exit', code => process.exit(code ?? 1));
