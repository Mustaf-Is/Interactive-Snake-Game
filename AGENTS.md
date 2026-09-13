# AGENTS.md — SNAKE / 97

Repository-wide context and operating guidance for AI agents. Read this before changing the project. Follow the user's current request, inspect the working tree, and keep this document and `README.md` aligned with changes. This is a guide to the implementation, not authorization to change sharing, publish, or migrate services outside the requested scope.

## Project and current state

SNAKE / 97 — Pocket Arcade is a playable, Nokia-inspired Snake MVP. The browser runs the game; a server validates finished runs and keeps durable scores and game history. Preserve the green monochrome LCD, dark console, orange accents, pixel grid, keyboard-first interaction, and responsive layout.

Deployment and repository snapshot verified on **2026-09-13**:

- Live game: https://snake-97.ismajlim26.chatgpt.site
- Sites project ID: `appgprj_6aa5e22a2bf88191968563177682738f`.
- Current audience: **public**. The owner can also use custom access and external viewer invitations. Recheck the live policy before future access or deployment work; it is not stored in Git.
- Latest saved Sites version: **1**, built from `5721a5006421092e5c3490775d076e303bc5f13b`.
- GitHub `origin`: `https://github.com/Mustaf-Is/Interactive-Snake-Game.git`.
- Current local branch: `master`, tracking `origin/master`. Check `git branch -vv` and `git remote -v` before relying on this snapshot.
- No GitHub Actions deployment workflow, Netlify configuration, or GitHub Pages deployment is configured in the tracked source.
- GitHub source hosting and Sites production hosting are separate. A push to GitHub is not a Sites deployment.

The original deployment was private and used another slug. Do not restore that old audience or URL from conversation history. External state and current user instructions take precedence over this snapshot.

## What the game does

- Steer using WASD (including uppercase) or arrow keys. Space starts a ready/finished game and pauses/resumes active play; Escape pauses. Native focused controls retain their own keyboard handling.
- Pause automatically when the window loses focus or the document becomes hidden during play.
- Touch direction buttons appear at viewport widths of 800 px or less. Optional square-wave sound effects use the browser Web Audio API; sound starts disabled.
- Choose Easy, Medium, or Hard before starting. Difficulty changes are disabled during an active run or while a result is awaiting save.
- Eat food to gain points, grow, and increase speed. Hit a wall or the body to lose; fill the board to win. There is no wall wrapping.
- Display score, best score, length, relative speed, and active simulation time. Show total games started, five top completed scores, and five recent runs.
- Save automatically at game over. A failed save stays in memory and exposes Retry; another game cannot start until that save succeeds.

Rules in `lib/snake.ts` are authoritative:

- Board: **28 columns × 22 rows**; initial length **4**, head at `(8, 11)`, facing right. The canvas is 560 × 440 intrinsic pixels, with 20-pixel cells, scaled by CSS.
- Easy: start **180 ms/tick**, subtract **4 ms/food**, minimum **75 ms/tick**, **10 points/food**.
- Medium: start **130 ms/tick**, subtract **3 ms/food**, minimum **55 ms/tick**, **20 points/food**.
- Hard: start **90 ms/tick**, subtract **2 ms/food**, minimum **38 ms/tick**, **30 points/food**.
- Tick interval is `max(min, start - eaten * step)`; score is `eaten * points`. HUD speed is starting interval divided by current interval, displayed to two decimals.
- Opposite-direction turns are ignored. The UI queues at most two valid turns and consumes one per tick.
- Moving into the cell the tail vacates on a non-eating tick is legal. Preserve that collision detail.
- Food uses a deterministic seeded generator and is selected from empty cells. Filling the board ends with `won = true` and `food = null`.
- Duration is the sum of simulation tick intervals, including the final collision tick. It excludes pauses and is not a wall-clock stopwatch.

## Tech stack

- TypeScript **5.9.3**, strict checking, ESM (`"type": "module"`), root import alias `@/*`.
- React / React DOM **19.2.6** with Next-style App Router files and a client game component.
- **Vinext 1.0.0-beta.5** on **Vite 8.0.13** runs and builds the app. `next` **16.3.4** is installed for the Next-compatible surface; this is not configured as a conventional `next dev` / `next build` deployment.
- Cloudflare Workers runtime, `@cloudflare/vite-plugin` **1.37.1**, Wrangler **4.92.0**, and local Cloudflare binding emulation.
- Cloudflare **D1** (SQLite semantics) for storage. Drizzle ORM **0.45.2** defines the schema; Drizzle Kit **0.31.10** generates SQL migrations. The actual game API uses raw D1 prepared statements.
- Tailwind CSS **4.2.1**, custom CSS, bundled Shadcn/Radix primitives, and Lucide icons. Difficulty uses the existing radio-group primitive.
- Zod **3.x** for strict request validation. Native `node:test` and `node:assert/strict` for tests.
- Node **>=22.13.0** and **npm**, with `package-lock.json` as the resolved dependency source. The package name is still `site-creator-vinext-starter`; the product name is SNAKE / 97.

Preserve the lockfile and existing package manager. The starter includes more UI packages than the game uses; do not replace the stack or prune dependencies as unrelated cleanup.

## Repository map

- `app/page.tsx`: root route, renders the game component.
- `app/snake-game.tsx`: UI, canvas drawing, timers, keyboard/touch input, sound, API calls, in-memory replay and optional WebMCP tools.
- `app/globals.css`: theme tokens, LCD/console styling, responsive breakpoints (1100, 800, 500 px), and reduced-motion treatment.
- `app/layout.tsx`: document metadata, global stylesheet, favicon. It currently also contains the `codex-preview: development` metadata marker.
- `public/favicon.svg`: game favicon. Other small SVGs in `public/` are unused starter assets.
- `lib/snake.ts`: pure shared simulation and difficulty definitions; imported by both browser and server. `lib/utils.ts` contains UI utilities.
- `app/api/games/route.ts`: all game API methods; dynamic responses with `Cache-Control: no-store`.
- `db/index.ts`: server-only binding access via `env` from `cloudflare:workers`. `getSql()` returns raw D1; `getDb()` is the available Drizzle wrapper.
- `db/schema.ts`, `drizzle.config.ts`, `drizzle/`: schema, migration configuration, SQL and migration metadata.
- `vite.config.ts`: Vinext, Sites, and Cloudflare plugins plus logical local bindings.
- `build/sites-vite-plugin.ts`: vendored Sites build/preview integration. Copies hosting metadata and migrations to build output and supplies portable preview mock auth.
- `.openai/hosting.json`: durable Sites identity and logical storage declarations.
- `scripts/`: installation, execution profile, environment and build/dev wrappers.
- `app/chatgpt-auth.ts`: available server-side ChatGPT identity/sign-in helpers, currently unused by the game routes.
- `components/ui/`, `hooks/`, `vendor/`: supplied UI primitives/helpers and licensed assets. Compose primitives rather than editing vendored implementations for a one-off style change.
- `tests/snake.test.mjs`: six engine tests. `tests/api-smoke.mjs`: local HTTP/database smoke check.
- `examples/d1/`: starter examples, not live routes; excluded from TypeScript checking. Do not modify these instead of the real application.
- `README.md`: human-facing play, setup and verification guide.

## State, API and database

Client status is `ready | starting | playing | paused | over`. Refs provide current values to timers and event handlers; React state renders the UI. Keep ref/state updates synchronized and clean up timers, listeners and WebMCP registrations on unmount.

The run lifecycle:

1. `POST /api/games` accepts exactly `{ "difficulty": "easy" | "medium" | "hard" }`. The server generates a UUID and unsigned random 32-bit seed, inserts a `started` row, and returns `{ id, seed, difficulty }` with HTTP 201.
2. The browser initializes from that seed and simulates locally. It logs consumed turns as `{ tick, direction }`, with one-based tick numbers. No per-tick network request is made.
3. On collision or victory, `PUT /api/games` sends exactly `{ id, ticks, turns }`. Do not submit a score or trust a client-calculated score.
4. The server loads the original seed and difficulty, replays the run with the same engine, verifies its end, calculates score/length/food/duration, and updates the row to `completed`.
5. A repeat completion request for an already completed ID returns the saved score without inserting another row. UI reloads statistics after successful completion.

`GET /api/games` returns `{ played, best, food, recent, top }`. `played` counts **all started rows**, including abandoned runs. `best` is the maximum stored score across difficulties; `food` sums stored food. `recent` returns the five newest starts; `top` returns five completed runs ordered by score descending, then creation time descending. Returned run fields are `id`, `difficulty`, `score`, `length`, `duration_ms`, `created_at`, and `status`.

Validation and errors:

- Invalid input/replay: 400; mismatched supplied Origin: 403; unknown completion ID: 404; database failure: 503; successful read/save: 200.
- The route checks a supplied Origin against the request URL origin, but permits requests with no Origin. This is not authentication or rate limiting. Cross-origin frontend hosting is not currently configured.
- Request text is capped at **1,000,000 characters after reading it**. Replay permits **100,000 ticks** and **20,000 turns**; turn ticks must strictly increase and cannot exceed the final tick.
- Replays must end exactly at game over; continuing after game over or submitting an unfinished run is rejected. Simulated time cannot exceed time since server-side creation by more than **1,500 ms**.
- Zod schemas reject extra fields. Database errors are logged server-side, while responses give a recoverable generic message.

The `games` table has ten columns: `id` (text primary key), `seed`, `difficulty`, `status`, `score` (default 0), `length` (default 4), `food` (default 0), `duration_ms` (default 0), `created_at`, and nullable `completed_at`. Timestamps are epoch milliseconds. Indexes cover `created_at` and `(status, score, created_at)`.

There is no user ID column, persisted turn log, account system, deletion API, pagination, or ongoing-run recovery. Finished game summaries are durable; active gameplay and unsaved replays are not.

## Local setup and configuration

Run commands from the repository root. Install only when needed; do not run concurrent installers.

```sh
npm run install:ci
npm run build
```

`install:ci` executes locked `npm ci` through npm's JavaScript entrypoint, including dev and optional packages. Do not call `node scripts/install-ci.mjs` alone: it requires npm's `npm_execpath` environment.

Before the first local database use, apply the initial migration **once**:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_loud_santa_claus.sql
npm run dev
```

The build is needed first because it generates `dist/server/wrangler.json`. The dev wrapper starts at port **5173**; use the actual URL printed by the process. `npm start` previews the built Worker locally through Wrangler (it does not deploy); use its printed URL as well. Dev, built preview, and the migration command use `.wrangler/state`. Do not append `/v3` to `--persist-to`; Wrangler manages that internally.

For a fresh clone, the initial SQL is appropriate. For an existing local database, inspect which schema changes are already present and apply only pending files in order; direct `d1 execute --file` is not an automatic migration-journal runner and the initial SQL is not rerunnable.

Windows npm shim fallback, after resolving the installed npm path:

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run install:ci
node scripts/run-framework.mjs dev
node scripts/run-framework.mjs build
```

That npm path worked on the original Windows machine but is not a portable dependency. Quote paths containing spaces. Do not alter global npm/Node settings just to work around a local shim failure.

- The local execution profile is `portable`, recorded in ignored `.sites-runtime/execution-profile.json`; clean clones default to portable. `managed-linux` uses the supplied Bash/Vite paths. If using Sites tooling after moving environments, run its current profile configuration helper first.
- `vite.config.ts` declares local D1 name `site-creator-d1` and placeholder ID `00000000-0000-4000-8000-000000000000`. This is not a production database ID.
- The app needs no OpenAI API key or user-supplied application secret for normal gameplay. D1 is a runtime binding, not a connection string or `.env` value.
- `CLOUDFLARE_CF_FETCH_ENABLED`, `WRANGLER_SEND_METRICS`, and `WRANGLER_WRITE_LOGS` default to false. Tool logs/registries remain under ignored local runtime directories; `SITES_RUNTIME_ROOT` can override the wrapper's runtime directory.
- `cloudflare-env.d.ts` declares optional `DB` and `BUCKET` types; only `DB` is enabled. Missing `DB` causes score endpoints to return 503, and the UI cannot start a saved run.

## Schema changes

1. Edit `db/schema.ts`, then run `npm run db:generate`.
2. Inspect generated SQL and Drizzle journal/snapshot files in `drizzle/`.
3. Keep already published/applied migrations immutable; add forward migrations. Do not generate schema or seed rows in request handlers.
4. Rebuild if configuration/output changed, then apply pending migrations to the local database using the local command above with each actual filename.
5. Validate the changed API and include migrations in the production artifact. Sites applies production migrations separately from local state.

Use one SQL statement per D1 `prepare()` and bind values. Batch related statements as appropriate. Add indexes for real query patterns. Never treat a local migration or local test data as proof the hosted database was migrated.

## Testing and verification

```sh
node --experimental-strip-types --test tests/snake.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

With a running local server and migrated D1 database:

```sh
node --experimental-strip-types tests/api-smoke.mjs
```

There is no `npm test` script. `npm run lint` exists but is separate from build/type checking; do not claim it passed without running it.

Engine tests cover seeded food, growth and immutable previous state, speed changes/caps, reverse-turn rejection, wall/body collision, legal tail-cell movement, and board-fill victory. The API smoke test creates one real **local** run and checks invalid difficulty, a food-eating replay, rejection of score tampering and unfinished replay, persistence, duplicate completion, and statistics. It waits for simulation duration before saving. It defaults to `http://localhost:5173`; `SNAKE_TEST_URL` can change the URL but the script rejects non-localhost/non-127.0.0.1 hosts. Run it without concurrent game starts, since it asserts an exact count increase and membership in the top five. Existing high local scores can make that top-five assertion fail independently of saving correctness.

For gameplay/UI changes, also check start, WASD and arrows, pause/resume, focus-loss pause, difficulty locking, game-over save, failed-save retry, and score history after reload. Check desktop and phone widths (for example 1440 px and 390 px), visible touch controls, focus indicators and reduced motion. Do not run write tests against production by replacing the smoke test's hostname guard. Documentation-only changes need document/path/config verification, not an app deployment or a new game test run.

Optional WebMCP tools are feature-detected through `document.modelContext`: `read_snake_game` reads status/difficulty/score/length; `pause_snake_game` pauses an active run without completing it. Both accept `{}`. Unsupported browsers must keep working normally; if editing these tools, validate registration, normal behavior and invalid input in a supported context.

## Production deployment

The checked-in hosting manifest is:

```json
{
  "d1": "DB",
  "r2": null,
  "project_id": "appgprj_6aa5e22a2bf88191968563177682738f"
}
```

Reuse that project; do not call Sites `create_site` for this checkout. The manifest declares logical resources; Sites provisions actual hosting/storage. Access policy, custom domains, runtime secrets and production database identifiers are managed outside this file.

Build output is `dist/server/index.js` (Worker entrypoint exporting a default object with `fetch`), `dist/client/` (browser assets), `dist/server/wrangler.json` (generated configuration), and `dist/.openai/` (hosting manifest and Drizzle migrations). Preserve `sites()` and Cloudflare integration in `vite.config.ts`. Do not edit `dist` as application source or convert this project to a static-only artifact while keeping its current API requirements.

For requested app publication, follow the currently installed Sites building/hosting instructions and tool schemas:

1. Read the manifest and inspect the existing Site, current audience, source state and pending deployments. Reuse the current project/version if appropriate.
2. Validate the code and build current output. Package only validated runtime output and required metadata/migrations, excluding secrets, local D1 state and dependencies.
3. Obtain the same Site's short-lived source write credential when needed. Its returned Git endpoint and branch are separate from GitHub `origin/master`; never assume the GitHub push satisfies Sites' source requirement. Do not overwrite `origin` with the Sites endpoint.
4. Commit the intended source and push it to the returned Sites source branch using per-command authentication. Keep credentials out of files, remote URLs, saved Git config and logs.
5. After a successful push, read the full `git rev-parse --verify HEAD` SHA. Freeze that source state through packaging and saving; save the artifact against exactly that SHA and the existing project ID.
6. Deploy the saved version using the operation appropriate to the current audience. **The verified audience is public, so do not use the owner-private deployment operation without a subsequent verified policy change.** Never change access just to make deployment succeed.
7. Follow the returned deployment ID to a terminal status. Report the exact successful URL; a saved version or pending status is not proof of publication.

Use the current Sites packaging/build helpers when available; plugin cache locations are machine-specific and can disappear during plugin changes. Repository build commands remain available without those helpers. If tooling is unavailable, do not invent credentials or recreate the Site. The initial successful archive included `.openai/hosting.json` and built `dist/` output; follow the connector's current archive contract before reproducing that fallback.

A failed deployment can have applied migrations before Worker upload failed. Determine the applied boundary before recovery. A rollback to older code is not automatically a database rollback.

## Sharing, portability and limitations

- The game is currently public. Sharing permissions only control who can visit; they do not create player ownership inside the application.
- **All visitors share one database history, best score and games-played count.** The UI's “personal best” is currently site-wide. There are no player names, player-specific records or authenticated write checks in the game route.
- Replay validation prevents simply submitting an arbitrary score, but does not prevent bots or prove a person played. There is no application rate limit. An unknown client can call the public API; Origin validation and random run IDs are not substitutes for authorization.
- For work adding individual records, use a stable server-verified identity and ownership checks, migrate existing shared records deliberately, and update read/write queries together. Existing `app/chatgpt-auth.ts` helpers are not already wired into this flow.
- Sites owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, and `/callback`. The portable preview plugin can mock sign-in on loopback for a fixed local user; that is not production identity or authorization. Do not import the server auth helper into the client bundle or implement replacement reserved routes casually.
- There is no offline mode. Starting requires a successful server insert. Closing/reloading loses a pending replay; its started database row remains unfinished. There is no abandonment cleanup or resumed-game endpoint.
- Replay caps are enforced on the server but not as an explicit frontend game limit. Very long runs can exceed those caps and fail saving; budget any future changes against server CPU/memory and the host's actual limits.
- Completed summaries do not persist turn logs, so full historical visual replay is not available. Engine changes also affect in-flight runs because there is no stored engine-version field; consider compatibility when changing rules.
- GitHub Pages alone cannot host this Worker/D1 backend. A migration would need a static frontend build plus a separately hosted API and updated endpoint/origin configuration.
- Netlify would require runtime/build and database-access adaptation, or a separately retained Cloudflare backend. `cloudflare:workers`/D1 bindings do not transfer as ordinary environment variables.
- Independent Cloudflare Workers + D1 deployment is the closest architectural fit, but still requires the user's own resources, bindings, deployment configuration and an explicit data migration. No such independent deployment is configured here. Check current provider limits instead of promising unlimited free hosting.

## Change discipline and useful starting points

- Start with `git status --short`, inspect relevant files, and preserve unrelated changes. If creating a new branch without a user-specified name, use `codex/` as the prefix; do not rename the existing branch gratuitously.
- Keep the pure engine shared by server and browser. Never duplicate scoring/random-food logic or replace durable score storage with browser storage as a shortcut.
- Use the existing theme and accessible primitives. Keep play available directly on the main screen. Avoid unnecessary packages, routes, account flows, or broad UI rewrites.
- For tuning gameplay: begin at `lib/snake.ts`, then the HUD/input logic and engine tests. For scores/history: begin at the API, schema and API smoke test. For layout: begin at `app/snake-game.tsx` and `app/globals.css`. For hosting: begin at the manifest, Vite config and script wrappers.
- Keep `.wrangler/`, `.sites-runtime/`, `dist/`, `node_modules/`, `.vinext/`, `.next/`, `.env*` and `*.tsbuildinfo` out of Git. Do not inspect or publish credentials as project documentation. Preserve license files accompanying vendored code.
- Report what changed, what was actually checked, and any remaining limitations. Recheck live settings before documenting them as current; update this guide when architecture, commands, storage, URLs or deployment arrangements change.
