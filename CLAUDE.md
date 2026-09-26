# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Dhaka Tesla Pool — working rules

Take-home project for the RoBenDevs Software Engineer Internship. The brief is in [docs/PRD.md](docs/PRD.md) — read it before any design decision.

## Stack (decided)

- `frontend/` — Next.js (App Router) + TypeScript + Tailwind
- `backend/` — Node.js + Express + TypeScript, Zod validation, JWT in httpOnly cookie
- PostgreSQL via Drizzle ORM (`drizzle-orm` 0.45 + `pg` driver, `drizzle-kit` 0.31 for migrations)
- Vitest + supertest against a real Postgres
- `docker compose up` runs everything

Not installed yet: Zod, JWT, Vitest, supertest. Add each one in its own step.

## Commands

`backend/` and `frontend/` are two separate pnpm projects (no root `package.json`). Run commands inside each folder.

- Backend: `pnpm dev` (tsx watch, port 4000, loads the root `../.env`; needs `docker compose up -d db`), `pnpm build` (tsc to `dist/`), `pnpm start`
- Backend DB: `pnpm db:generate --name <name>` writes a new SQL migration to `backend/drizzle/` from `src/db/schema.ts`. Always read the generated SQL before committing. Never edit a migration that is already on `master`; add a new one.
- Frontend: `pnpm dev` (port 3000), `pnpm build`, `pnpm lint`
- Everything: `cp .env.example .env`, then `docker compose up --build` from the repo root (db → backend runs migrations → one-shot `seed` fills demo data and exits → frontend)
- Demo logins (seed): `jashim@`, `kamal@` (drivers), `nusrat@`, `rafiq@`, `shirin@` (passengers) `teslapool.test`, password `bullet123`. Local seed: `pnpm db:seed` in backend/
- Health check: `GET http://localhost:4000/health`

No test runner yet.

## Architecture notes

- **Backend layout: feature modules + pure domain.** `src/modules/<feature>/` holds `<feature>.routes.ts` (HTTP only: Zod-validate input, call the service, map result to a status code; no SQL, no business rules) and `<feature>.service.ts` (business rules, transactions, Drizzle queries). `src/domain/` holds pure functions with no DB or HTTP (fare, lifecycle transition map, `geo/` graph + matching) and is unit tested directly. `src/middleware/` has auth and error handling. No repository layer: Drizzle is already the data layer, and the atomic seat-claim SQL must stay visible.
- **Migrations are automatic, seed is not.** The app migrates itself at startup. Demo data lives in `src/db/seed.ts` (`pnpm db:seed`); only docker compose runs it automatically (one-shot `seed` service). The app never seeds itself.
- **Passwords:** Node's built-in `scrypt` (`src/lib/password.ts`), stored as `scrypt$N$r$p$salt$hash`. No bcrypt dependency.
- **Backend `app.ts` / `server.ts` split.** `app.ts` builds and exports the Express app. `server.ts` only calls `listen`. Tests should import `app` directly (supertest), never start the server.
- **Backend is ESM with `module: nodenext`.** Relative imports need the `.js` suffix, even in `.ts` files (`import { app } from "./app.js"`).
- **Frontend uses `output: "standalone"`** in `next.config.ts`. The frontend Dockerfile depends on it. Don't remove it.
- **Next.js version is new (16.x).** Read [frontend/AGENTS.md](frontend/AGENTS.md): check `frontend/node_modules/next/dist/docs/` before writing Next.js code.
- **Compose startup order:** `db` (pg_isready) → `backend` (waits for db healthy, migrates, healthcheck hits `/health`) → one-shot `seed` and `frontend` (both wait for a healthy backend). All ports bind to `127.0.0.1` only. `.env` must set `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` or compose refuses to start.
- **Drizzle is pinned to 0.45 (not the 1.0 RC).** Online docs mix 1.0 syntax in. For 0.45: `migrate(db, { migrationsFolder })` needs the folder; migration files go to `backend/drizzle/`. When unsure, check the installed types in `node_modules/drizzle-orm`.
- **One `.env` at the repo root.** `pnpm dev` loads it with Node's `--env-file` (no dotenv). `DATABASE_URL` uses host `localhost` there; compose builds its own URL with host `db` for the backend container. `src/db/index.ts` throws at startup if `DATABASE_URL` is missing.
- **`/health` runs `select 1`**: 200 `{db:"up"}` or 503 `{db:"down"}`. The pg pool has an `error` listener: without it, a Postgres restart crashes the whole Node process (tested). Keep it.
- **Migrations run at backend startup** (`server.ts`, before `listen`). All pending migrations apply in one transaction; if they fail the process exits. The Dockerfile copies `drizzle/` into the image. No cross-instance lock: fine for one backend.
- **Schema and integrity rules** are explained in [docs/architecture.md](docs/architecture.md) (ERD + every CHECK and index). Keep it in sync with `src/db/schema.ts`. IDs are UUID v7 (`uuidv7()` default), money is integer paisa, distance is integer meters. `roads` is keyed by its area pair. Derived data is not stored: the drop-off order is computed from the road graph, and change times come from `ride_events`. The 5 deliberate denormalizations are listed in the Normalization section there; don't add more without a measured reason.
- **Postgres 18** stores data under `/var/lib/postgresql` (not `.../data`). The volume mount in `docker-compose.yml` is correct as is.

## Product rules (agreed; don't re-open without Ekramul)

- **Booking: driver accepts.** Passenger picks pickup area, drop-off area, seats (1–3), sees the fare, requests. A driver with no active ride sees all open requests; accepting creates a ride. A driver with an open ride sees only requests that fit it; accepting adds them. The backend re-checks the match on every accept. No auto-join.
- **Online/offline:** `vehicles.is_online`. Offline drivers see no requests and can't accept (checked inside the accept transaction). Going offline mid-trip is allowed; the current ride continues.
- **Geography:** 12 areas + 22 roads (`roads.distance_m`, measured in Google Maps, cross-checked with TomTom). Floyd–Warshall runs once at startup (all-pairs shortest distance + path). No map API, no lat/long.
- **Matching:** same pickup area; try every drop-off order and keep the shortest; every passenger's detour (pooled route − direct route) must be ≤ `MAX_DETOUR_M = 3500`. Calibrated on real data: Nusrat (Banani→Mohakhali) + Rafiq (Banani→Gulshan 1) = Rafiq +3.1 km, accepted; Mohakhali + Uttara = +5.6 km, rejected. Multiple pickup areas per ride are out of scope (design choice, listed as a next improvement).
- **Fare:** `(30 Tk + 12 Tk × km) × seats × 0.8`, km = shortest road distance rounded to 0.1 km. Integer math: `(3000 + 120 × units_of_100m) × seats × 4/5` paisa, rounded once. Fixed at request time, never changes. Every ride is shareable (20% pool discount always). Payment: cash only.
- **Lifecycle:** ride `ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED` (or `CANCELLED` if everyone cancels before start); request `REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED` (or `CANCELLED`). One transition map in `domain/`; anything else is rejected. Ride and request statuses change in the same transaction, and every change writes a `ride_events` row.
- **Cancel:** free, any time before the ride starts; not after. Frees the seats in the same transaction. Destination can't be changed after booking.
- **Concurrency (3 races):** last seat (`UPDATE rides SET seats_taken = seats_taken + n WHERE id = $1 AND seats_taken + n <= capacity`, 0 rows = full), two drivers accept the same request (`... WHERE status = 'REQUESTED'`), cancel vs accept (same status condition). Each gets a real concurrent test (`Promise.all` against Postgres). Kamal/Toofan exist in the seed for the two-driver race.

## How we work

- **Step by step.** One small, logical change at a time. Stop after each step so Ekramul can review and understand it. Never build several features in one go.
- **Check docs first.** Before writing code for Express, Drizzle, Next.js, Zod, Vitest or any other library, look up the current docs with Context7. Don't rely on memory for syntax.
- **Keep it boring.** No tech added just to look advanced (PRD Section 9). Every choice must be explainable in the interview.
- **Story cast everywhere.** Jashim (driver), Bullet (3-seat Tesla), Nusrat, Rafiq, Shirin (passengers). Never user1/driver1.
- **Money in integer paisa.** Never floats.

## Git (graded — PRD Sections 10 and 11)

- Branches: `master`, `pre-release`, `release/v1.0.0`, and `feature/*` for all feature work.
- Never commit feature work directly to `master`. Merge through a GitHub PR with a merge commit (not squash/rebase). Ekramul pushes, opens and merges PRs himself; Claude commits locally and writes a concise PR description. Never force-push.
- Commit format: `<type>(<scope>): <short description>` — types: feat, fix, refactor, test, docs, chore, build.
- One commit = one understandable change. No "update", "fix", "final", "wip". Commit messages are one line, with no AI co-author or "Generated with" lines (AI use is documented in docs/ai-usage.md instead). Doc updates go in the same commit as the change they describe.
- Never commit `.env` or secrets. Only `.env.example`.

## AI usage

AI use is allowed and must be shown openly (PRD Section 8). Keep this file in the repo. Log accepted and rejected AI suggestions as we go in [docs/ai-usage.md](docs/ai-usage.md). The README's AI Usage section summarizes it at the end.
