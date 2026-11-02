# SNAKE / 97 — Pocket Arcade

A Nokia-inspired Snake game with a React frontend and a Cloudflare Worker + D1 (SQLite) backend.

## Play

Choose Easy, Medium, or Hard, then click Start Game or press Space. Steer with WASD or the arrow keys. Space pauses/resumes; Escape pauses. Leaving the browser automatically pauses the game. Touch direction buttons appear on small screens. Sound is optional.

Each food grows the snake and shortens the tick interval. Easy starts at 180 ms (10 points per food), Medium at 130 ms (20 points), and Hard at 90 ms (30 points). Speeds have lower bounds of 75, 55, and 38 ms. Walls and self-collisions end a run. Filling the board wins.

## Develop

Requires Node 22.13+ and npm. Run `npm run install:ci`, then `npm run build`. Generate migrations only after changing `db/schema.ts` with `npm run db:generate`.

For an existing local database, apply only pending migrations in filename order. The new `drizzle/0001_bouncy_banshee.sql` adds rate-limit storage; existing game records are preserved. Before the first local run, initialize D1 and apply the rate-limit migration:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_loud_santa_claus.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_bouncy_banshee.sql
npm run dev
```

Open the local URL printed by the server. If the system npm shim fails, invoke its installed `npm-cli.js` through Node. `node scripts/run-framework.mjs dev` and `node scripts/run-framework.mjs build` bypass the npm shim for development and builds.

## Data and API

- `POST /api/games` starts a durable run and returns its random seed and ID.
- `PUT /api/games` accepts the ID, tick count, and turn log. The server replays the game, rejects incomplete/invalid runs, calculates the score, and saves completion once. Repeated and simultaneous saves return the canonical stored score, even when competing replays differ.
- `GET /api/games` returns total games started, global best, total food, five recent runs, and five top scores.

Started runs count toward games played, even if a browser is closed before completion; history marks these as unfinished. Completed runs store difficulty, score, length, food eaten, active play duration, and timestamps. Failed saves remain in the current page with a Retry button; reloading that page discards the unsaved replay. There is no browser-storage score database.

As verified on 2026-09-13, the hosted app is public at [snake-97.ismajlim26.chatgpt.site](https://snake-97.ismajlim26.chatgpt.site). All visitors share the same history, best score, and games-played count; individual player records are not implemented. The UI labels shared statistics as global. Write endpoints use atomic D1 fixed-window limits per Cloudflare client address: 12 starts and 30 submissions per minute, with separate budgets. Rejected requests return 429 and `Retry-After`; requests without the trusted edge header share a fallback budget. Only a window-specific address digest is stored, and expired counters are removed on subsequent writes. Shared networks share a budget. These basic controls still use database operations and are not a substitute for edge-level flood protection. Replay validation prevents arbitrary submitted score values; it does not prevent scripted play. Replay limits are 100,000 ticks and 20,000 direction events. Recheck Sites for the current audience before changing access or deploying.

## Verify

Install Chromium once after installing dependencies, then run the full local verification:

```sh
npx playwright install chromium
npm run verify
```

`verify` runs six engine tests, isolated D1 API tests, TypeScript checking, linting with zero warnings, the production build, and Playwright. GitHub Actions runs the same command for pushes and pull requests. Browser traces are retained on failure.

Individual commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:browser` (requires a current build).

API tests cover invalid/oversized replays, unknown IDs, turn ordering, post-game ticks, duration validation, database outages/write recovery, repeated and simultaneous completions, and concurrent rate limits. Each test suite gets an isolated in-memory D1 database. Browser tests launch a built Worker on port 4173 with a new database under ignored `.wrangler/e2e/`; they never modify `.wrangler/state`. They cover desktop and phone widths, keyboard/touch controls, pause/resume, focus-loss pause, difficulty locking, completion, persistence after reload, and a failed-save/retry journey. Test databases remain under that ignored directory for inspection.

The browser suite also runs `tests/api-smoke.mjs` against a database prepopulated with five higher scores. The smoke check verifies its exact run through idempotent completion, independent of leaderboard rank. It can also run against an already migrated local development server:

```sh
node --experimental-strip-types tests/api-smoke.mjs
```

It only accepts localhost/127.0.0.1 and creates one local run. No tests write to production.

Optional WebMCP tools expose current game status and pausing through the same UI state. The game works without WebMCP support.

## Hosting

The Sites identity and logical D1 binding are in `.openai/hosting.json`. A production build emits the Worker under `dist/server`, client assets under `dist/client`, and the database migrations under `dist/.openai`. Local D1 state is separate from the hosted database and is ignored by Git.

See [AGENTS.md](AGENTS.md) for the repository map, implementation rules, configuration, API contract, deployment workflow, and known limitations for future contributors and AI agents. GitHub `origin` hosts the source; pushing there does not automatically publish to Sites.
