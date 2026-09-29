# AI Usage Log

A running log of how AI was used while building Dhaka Tesla Pool, kept as the work happens. The README's AI Usage section summarizes it.

## Tools

- **Claude Code (Claude Opus)** — pair programmer in the terminal: explained options, wrote code in small reviewed steps, ran builds and tests.
- **Context7 (MCP plugin)** — pulls current, version-specific library docs into Claude Code, so syntax comes from the docs instead of memory.
- **Ponytail (Claude Code plugin)** — makes Claude pick the simplest solution that works and review changes for over-engineering. Code comments starting with `ponytail:` mark a deliberate shortcut, its limit, and when to upgrade it.
- **ChatGPT** — used as a second opinion on design choices (for example, the ORM choice below).
- **Claude Cowork** — browser agent that collected the 22 road distances from Google Maps and TomTom. I reviewed the two lists and chose which value to trust where they disagreed.

How I work with it: one small step at a time. Each step is discussed first, then built, tested, and reviewed by me before it is committed. Working rules are in [CLAUDE.md](../CLAUDE.md).

## Accepted suggestions

| Date | Area | Suggestion | Why I accepted it |
|---|---|---|---|
| 2026-09-24 | Backend / TypeScript | Add `"types": ["node"]` to `tsconfig.json` | Context7 showed that TypeScript 7 loads no global types by default. Older tutorials skip this line and the build breaks. |
| 2026-09-24 | Docker | Mount the Postgres volume at `/var/lib/postgresql`, not `/var/lib/postgresql/data` | Context7 showed that the Postgres 18 image moved its data folder. The old path fails on startup. I tested it: data survived deleting the container. |
| 2026-09-24 | Architecture | Use a Next.js rewrite (`/api/*` → backend) instead of nginx | Next.js is already a server, so it can forward requests itself. One container less, and the auth cookie stays on one site (no CORS, no third-party cookies). In my Angular project I needed nginx because Angular builds to static files. |
| 2026-09-25 | Dependencies | Pin exact versions of `drizzle-orm` (0.45.3) and `drizzle-kit` (0.31.11) | Drizzle 1.0 is still a release candidate and its docs mix 1.0 syntax in (for example, `migrate()` options). Pinning means nothing changes under me before the deadline. |
| 2026-09-26 | Product | Fix each passenger's fare at request time; later joins or cancels never change it | Matches how Uber/Pathao pool pricing works: the price you accept is the price you pay. It also makes the fare testable by hand. |
| 2026-09-26 | Matching | Detour-based matching on a real road graph (same pickup area; every passenger's detour within a limit; best drop-off order) | This is how real pooling systems decide "same direction". A passenger going the opposite way always gets a large detour, so direction needs no extra rule. |
| 2026-09-26 | Matching | Raise the detour limit from 1.5 km to 3.5 km after measuring real roads | Measured data showed Mohakhali and Gulshan 1 are in different directions from Banani: pooling Nusrat and Rafiq costs Rafiq 3.1 km extra. 3.5 km allows neighbouring-area pools like theirs and still rejects cross-city ones (Mohakhali + Uttara = 5.6 km extra). Trade-off: a longer ride for a 20% cheaper fare. |
| 2026-09-26 | Database | Use UUID v7 (built into Postgres 18) once I chose UUIDs | Time-ordered, so new rows land at the end of the index instead of randomly (v4). No extension or library needed. |
| 2026-09-26 | Security | Hash passwords with Node's built-in `scrypt` instead of adding `bcrypt` | No dependency and no native build step. Memory-hard, so it resists GPU cracking better, and OWASP ranks it above bcrypt. Settings are stored in each hash, so they can be raised later. |
| 2026-09-26 | Database | Migrations run automatically at startup; seed data is a separate script that only docker compose runs (one-shot container) | The app can't work without its tables, but demo users must never appear in a real deployment. `docker compose up` still gives the evaluator everything in one command. |
| 2026-09-26 | Code structure | Feature modules (routes + service) plus pure `domain/` functions; no repository layer | Business rules live in plain functions that are easy to test. Drizzle is already a thin query layer, and a repository would hide the atomic seat-claim SQL. |
| 2026-09-26 | Database | Over-engineering review before the PR: drop `drop_order`, `updated_at` and `vehicles.created_at`, key `roads` by its area pair | Drop-off order can be recomputed, and change times are already in `ride_events`, so storing them was duplicated data. Each deliberate duplicate that remains is documented with its reason in `docs/architecture.md`. |
| 2026-09-27 | Database | Move the Dhaka map (areas + roads) from the seed script into a migration; the seed keeps only demo users and cars | A design review (a second Claude session) found that compose seeds only after the backend is healthy, but the backend builds the road graph at startup, so a fresh `docker compose up` would build an empty map. Data the app needs to work belongs in a migration, like Django's data migrations. Tested on a fresh stack and on an already-seeded database (no duplicates). |
| 2026-09-28 | Validation | Validate emails with `z.string().trim().toLowerCase().pipe(z.email())` instead of the shorter `z.email().trim().toLowerCase()` | Ran both in Node before using either. In Zod 4 the short form checks the format before trimming, so `" nusrat@teslapool.test "` was rejected. |
| 2026-09-29 | Frontend | Redesign the first screens with Claude Code's frontend-design skill: rickshaw-red colour tokens, one condensed display font, a pickup-to-drop-off route line as the main visual, seats as a 1/2/3 button group | My first version was plain default Tailwind and looked unfinished. I asked for simple but decent, with no new libraries: the redesign only uses Tailwind theme tokens and one Google font through `next/font`. |

## Rejected or changed suggestions

| Date | Area | Suggestion | What I did instead, and why |
|---|---|---|---|
| 2026-09-24 | Naming | Name the folders `api/` and `web/` | Renamed to `backend/` and `frontend/`. Clearer for anyone reading the repo for the first time. |
| 2026-09-24 | Git | Add a `Co-Authored-By: Claude` line to every commit | Removed. AI use is documented here and in the README, not inside commit messages. Commits stay one line. |
| 2026-09-24 | Process | Build the whole backend setup in one "Step 1" | Split into smaller steps (line endings, then server, then Docker…), so I could review and understand each change before the next one. |
| 2026-09-25 | Database | Claude suggested Prisma as the ORM | Asked ChatGPT, which suggested Drizzle. I compared both against the PRD: the hard parts here are constraints, transactions, and the concurrent seat claim, not CRUD. Drizzle expresses CHECK constraints and the atomic `UPDATE ... WHERE seats + n <= capacity` as normal code, stays close to SQL (which I know), and runs migrations from app code with no generate step in Docker. Prisma would need raw SQL and hand-edited migrations for exactly those parts. |
| 2026-09-26 | Product | Auto-join: the system puts a new request straight into a matching trip | Chose "driver accepts" instead. The PRD's driver list says "accept a ride/pool", and a human gatekeeper fits a three-seat rickshaw. The backend still re-checks the match on every accept. |
| 2026-09-26 | Geography | Straight-line distance between areas now, a road graph later | Built the road graph from the start. Road distance in cities is about 1.2–1.3× the straight line, so straight lines would give wrong fares and wrong matches. The distances were measured in Google Maps (driving, shortest route) and cross-checked with TomTom. |
| 2026-09-26 | Database | Claude suggested plain integer IDs (readable as "ride #12") | Chose UUIDs: they are common practice for IDs exposed in an API and don't reveal how many users or rides exist. |
| 2026-09-27 | Database | After I questioned a separate `dhaka-map.ts`, Claude swung the other way and suggested dropping the `roads` table for a code constant | Kept the table after a web search on reference data. `roads` has foreign keys to `areas` and CHECK constraints, so Postgres guarantees no road points to a fake area. The map is loaded once at startup and kept in memory, which is the usual pattern for static reference data. |
| 2026-09-27 | Git | Add Vitest in its own `build` commit before any test exists | Added it in the same commit as the first real test (the road graph). A test runner with zero tests only makes `pnpm test` fail. |
| 2026-09-27 | Product | Claude said Uber closes a pool once the driver reaches the pickup, and suggested the same | Checked Uber's own driver guides: riders can be added before, during and after the first pickup. Our rides have one pickup area, so a new passenger can join until the driver taps Start (the car is still there). Free cancel ends at the same moment. |
| 2026-09-29 | Frontend | A ponytail review suggested replacing the driver's online switch with a native checkbox (`role="switch"`, 8 lines shorter) | Kept the drawn switch: a checkbox looks like a form field, not an on/off switch, and the current one is already accessible (`role="switch"`, `aria-checked`, works from the keyboard). Took the review's other three cuts: one active-ride query, one event helper, one `RouteLine` for any number of stops. |
