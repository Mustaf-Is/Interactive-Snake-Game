# SNAKE / 97 — Pocket Arcade

A Nokia-inspired Snake game with a React frontend and a Cloudflare Worker + D1 (SQLite) backend.

## Play

Choose Easy, Medium, or Hard, then click Start Game or press Space. Steer with WASD or the arrow keys. Space pauses/resumes; Escape pauses. Leaving the browser automatically pauses the game. Touch direction buttons appear on small screens. Sound is optional.

Each food grows the snake and shortens the tick interval. Easy starts at 180 ms (10 points per food), Medium at 130 ms (20 points), and Hard at 90 ms (30 points). Speeds have lower bounds of 75, 55, and 38 ms. Walls and self-collisions end a run. Filling the board wins.

## Develop

Requires Node 22.13+ and npm. Run `npm run install:ci`, then `npm run build`. Generate migrations only after changing `db/schema.ts` with `npm run db:generate`.

Before the first local run, initialize D1:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_loud_santa_claus.sql
npm run dev
```

Open the local URL printed by the server. If the system npm shim fails, invoke its installed `npm-cli.js` through Node. `node scripts/run-framework.mjs dev` and `node scripts/run-framework.mjs build` bypass the npm shim for development and builds.

## Data and API

- `POST /api/games` starts a durable run and returns its random seed and ID.
- `PUT /api/games` accepts the ID, tick count, and turn log. The server replays the game, rejects incomplete/invalid runs, calculates the score, and saves completion once. Repeating a save is safe.
- `GET /api/games` returns total games started, personal best, total food, five recent runs, and five top scores.

Started runs count toward games played, even if a browser is closed before completion; history marks these as unfinished. Completed runs store difficulty, score, length, food eaten, active play duration, and timestamps. Failed saves remain in the current page with a Retry button; reloading that page discards the unsaved replay. There is no browser-storage score database.

As verified on 2026-09-13, the hosted app is public at [snake-97.ismajlim26.chatgpt.site](https://snake-97.ismajlim26.chatgpt.site). All visitors share the same history, best score, and games-played count; individual player records and application rate limits are not implemented. Replay validation prevents arbitrary submitted score values; it does not prevent scripted play. Replay limits are 100,000 ticks and 20,000 direction events. Recheck Sites for the current audience before changing access or deploying.

## Verify

```sh
node --experimental-strip-types --test tests/snake.test.mjs
node --experimental-strip-types tests/api-smoke.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

The API smoke check targets localhost only and creates one local test run. The six engine tests cover growth, speed, collision rules, deterministic food, and winning. Browser QA also checks keyboard controls, pause/resume, game-over saving, difficulty selection, and responsive layout.

Optional WebMCP tools expose current game status and pausing through the same UI state. The game works without WebMCP support.

## Hosting

The Sites identity and logical D1 binding are in `.openai/hosting.json`. A production build emits the Worker under `dist/server`, client assets under `dist/client`, and the database migrations under `dist/.openai`. Local D1 state is separate from the hosted database and is ignored by Git.

See [AGENTS.md](AGENTS.md) for the repository map, implementation rules, configuration, API contract, deployment workflow, and known limitations for future contributors and AI agents. GitHub `origin` hosts the source; pushing there does not automatically publish to Sites.
