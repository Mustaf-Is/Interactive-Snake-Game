# SNAKE / 97 — Pocket Arcade

A Nokia-inspired Snake game with a React frontend and a Cloudflare Worker + D1 (SQLite) backend.

## Play

Choose Easy, Medium, or Hard, then click Start Game or press Space. Steer with WASD or the arrow keys. Space pauses/resumes; Escape pauses. Leaving the browser automatically pauses the game. Touch direction buttons appear on small screens. Sound is optional.

Each food grows the snake and shortens the tick interval. Easy starts at 180 ms (10 points per food), Medium at 130 ms (20 points), and Hard at 90 ms (30 points). Speeds have lower bounds of 75, 55, and 38 ms. Walls and self-collisions end a run. Filling the board wins.

## Players

Play immediately as a guest, or open **New player** / **Returning player** in the PLAYER SELECT panel. Accounts use a case-insensitive unique username (3–16 letters, numbers or underscores) and a password of 15–128 characters. No email is collected and there is no password recovery; keep your password safe. Four-digit PINs are not accepted as account passwords.

Guest names are assigned by the server, such as `GUEST-A1B2C3`. Guest identity stays in this browser for the 30-day session; clearing cookies or session expiry loses access to those personal records. Registered players can sign in on another device to see the same records. Player changes are locked during a run or pending save. Signing in or registering does not claim previous guest or legacy scores.

Each new run stores its verified player ID and a name snapshot at start. The server checks ownership before accepting any completion or repeated completion. History and leaderboards show the name, difficulty, score and run details. Switch between **Global scores** and **My records**; the latter only queries the current player's runs. Existing unnamed records remain **LEGACY** and are never assigned to a new account.

## Develop

Requires Node 22.13+ and npm. Run `npm run install:ci`, then `npm run build`. Generate migrations only after changing `db/schema.ts` with `npm run db:generate`.

For an existing local database, apply only pending migrations in filename order. `drizzle/0001_bouncy_banshee.sql` adds rate-limit storage and `drizzle/0002_purple_ironclad.sql` adds players, sessions, and game ownership; existing game records are preserved. Before the first local run, initialize D1 and apply both forward migrations:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_loud_santa_claus.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_bouncy_banshee.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_purple_ironclad.sql
npm run dev
```

Open the local URL printed by the server. If the system npm shim fails, invoke its installed `npm-cli.js` through Node. `node scripts/run-framework.mjs dev` and `node scripts/run-framework.mjs build` bypass the npm shim for development and builds.

## Data and API

- `POST /api/games` starts a durable run for the current account or an automatically created guest, and returns its random seed, ID and player. A new guest also receives a session cookie.
- `PUT /api/games` accepts the ID, tick count, and turn log. The server replays the game, rejects incomplete/invalid runs, calculates the score, and saves completion once. Repeated and simultaneous saves return the canonical stored score, even when competing replays differ.
- `GET /api/player`, `POST /api/player` (`register` / `login`) and `DELETE /api/player` manage player sessions.
- `GET /api/games?scope=mine` returns the same statistics for the authenticated account or current guest; it returns 401 without a valid player session.
- `GET /api/games` returns total games started, global best, total food, five recent runs, and five top scores.

Started runs count toward games played, even if a browser is closed before completion; history marks these as unfinished. Completed runs store difficulty, score, length, food eaten, active play duration, and timestamps. Failed saves remain in the current page with a Retry button; reloading that page discards the unsaved replay. There is no browser-storage score database.

As verified on 2026-09-13, the hosted app is public at [snake-97.ismajlim26.chatgpt.site](https://snake-97.ismajlim26.chatgpt.site). The default history, best score and games-played count combine all visitors; My records filters them to the current player. Write endpoints use atomic D1 fixed-window limits per Cloudflare client address: 12 starts and 30 submissions per minute, with separate budgets. Rejected requests return 429 and `Retry-After`; requests without the trusted edge header share a fallback budget. Only a window-specific address digest is stored, and expired counters are removed on subsequent writes. Shared networks share a budget. These basic controls still use database operations and are not a substitute for edge-level flood protection. Account endpoints additionally allow 10 authentication requests per minute per address, 3 registrations per minute per address, and 5 login attempts per normalized username per minute across addresses. Passwords use salted scrypt (`N=16384, r=8, p=5`); opaque session tokens are stored as SHA-256 digests. Cookies are HttpOnly, SameSite=Lax, and Secure with a `__Host-` prefix on HTTPS. Sessions expire after 30 days and sign-out revokes the current session. Authentication and game writes check the supplied Origin. Replay validation prevents arbitrary submitted score values; it does not prevent scripted play. Replay limits are 100,000 ticks and 20,000 direction events. Recheck Sites for the current audience before changing access or deploying.

## Verify

Install Chromium once after installing dependencies, then run the full local verification:

```sh
npx playwright install chromium
npm run verify
```

`verify` runs six engine tests, isolated D1 API tests, TypeScript checking, linting with zero warnings, the production build, and Playwright, including account registration, sign-in/out, session persistence and named personal records. GitHub Actions runs the same command for pushes and pull requests. Browser traces are retained on failure.

Individual commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:browser` (requires a current build).

API tests also cover password hashing, case-insensitive username races, invalid credentials, session rotation/expiry/revocation, account throttling, guest/legacy separation, cross-device personal history and run ownership. Migration tests verify that existing scores survive without acquiring an owner. Replay API tests cover invalid/oversized replays, unknown IDs, turn ordering, post-game ticks, duration validation, database outages/write recovery, repeated and simultaneous completions, and concurrent rate limits. Each test suite gets an isolated in-memory D1 database. Browser tests launch a frozen copy of the built Worker on port 4173 with a new database under ignored `.wrangler/e2e/`; they never modify `.wrangler/state`. They cover desktop and phone widths, keyboard/touch controls, pause/resume, focus-loss pause, difficulty locking, completion, persistence after reload, and a failed-save/retry journey. Test databases remain under that ignored directory for inspection.

The browser suite also runs `tests/api-smoke.mjs` against a database prepopulated with five higher scores. The smoke check verifies its exact run through idempotent completion, independent of leaderboard rank. It can also run against an already migrated local development server:

```sh
node --experimental-strip-types tests/api-smoke.mjs
```

It only accepts localhost/127.0.0.1 and creates one local run. No tests write to production.

Optional WebMCP tools expose current game status and pausing through the same UI state. The game works without WebMCP support.

## Hosting

The Sites identity and logical D1 binding are in `.openai/hosting.json`. A production build emits the Worker under `dist/server`, client assets under `dist/client`, and the database migrations under `dist/.openai`. Local D1 state is separate from the hosted database and is ignored by Git.

See [AGENTS.md](AGENTS.md) for the repository map, implementation rules, configuration, API contract, deployment workflow, and known limitations for future contributors and AI agents. GitHub `origin` hosts the source; pushing there does not automatically publish to Sites.
