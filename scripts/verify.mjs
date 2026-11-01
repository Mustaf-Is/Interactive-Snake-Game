import { spawnSync } from 'node:child_process';

// Keep all checks on the runtime that launched npm, even when a PATH shim
// resolves the package script's `node` to a different installed version.
const node = process.env.npm_node_execpath || process.execPath;
for (const args of [
  ['--experimental-strip-types', '--test', 'tests/snake.test.mjs', 'tests/api.test.mjs'],
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['node_modules/eslint/bin/eslint.js', '.', '--max-warnings', '0'],
  ['scripts/run-framework.mjs', 'build'],
  ['node_modules/@playwright/test/cli.js', 'test'],
]) {
  const result = spawnSync(node, args, {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
