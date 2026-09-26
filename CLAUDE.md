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
- Everything: `cp .env.example .env`, then `docker compose up --build` from the repo root
- Health check: `GET http://localhost:4000/health`

No test runner yet.

## Architecture notes

- **Backend `app.ts` / `server.ts` split.** `app.ts` builds and exports the Express app. `server.ts` only calls `listen`. Tests should import `app` directly (supertest), never start the server.
- **Backend is ESM with `module: nodenext`.** Relative imports need the `.js` suffix, even in `.ts` files (`import { app } from "./app.js"`).
- **Frontend uses `output: "standalone"`** in `next.config.ts`. The frontend Dockerfile depends on it. Don't remove it.
- **Next.js version is new (16.x).** Read [frontend/AGENTS.md](frontend/AGENTS.md): check `frontend/node_modules/next/dist/docs/` before writing Next.js code.
- **Compose startup order:** `db` (pg_isready) → `backend` (waits for db healthy; its healthcheck hits `/health`) → `frontend`. All ports bind to `127.0.0.1` only. `.env` must set `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` or compose refuses to start.
- **Drizzle is pinned to 0.45 (not the 1.0 RC).** Online docs mix 1.0 syntax in. For 0.45: `migrate(db, { migrationsFolder })` needs the folder; migration files go to `backend/drizzle/`. When unsure, check the installed types in `node_modules/drizzle-orm`.
- **One `.env` at the repo root.** `pnpm dev` loads it with Node's `--env-file` (no dotenv). `DATABASE_URL` uses host `localhost` there; compose builds its own URL with host `db` for the backend container. `src/db/index.ts` throws at startup if `DATABASE_URL` is missing.
- **`/health` runs `select 1`**: 200 `{db:"up"}` or 503 `{db:"down"}`. The pg pool has an `error` listener: without it, a Postgres restart crashes the whole Node process (tested). Keep it.
- **Migrations run at backend startup** (`server.ts`, before `listen`). All pending migrations apply in one transaction; if they fail the process exits. The Dockerfile copies `drizzle/` into the image. No cross-instance lock: fine for one backend.
- **Schema and integrity rules** are explained in [docs/architecture.md](docs/architecture.md) (ERD + every CHECK and index). Keep it in sync with `src/db/schema.ts`. IDs are UUID v7 (`uuidv7()` default), money is integer paisa, distance is integer meters.
- **Postgres 18** stores data under `/var/lib/postgresql` (not `.../data`). The volume mount in `docker-compose.yml` is correct as is.

## How we work

- **Step by step.** One small, logical change at a time. Stop after each step so Ekramul can review and understand it. Never build several features in one go.
- **Check docs first.** Before writing code for Express, Prisma, Next.js, Zod, Vitest or any other library, look up the current docs with Context7. Don't rely on memory for syntax.
- **Keep it boring.** No tech added just to look advanced (PRD Section 9). Every choice must be explainable in the interview.
- **Story cast everywhere.** Jashim (driver), Bullet (3-seat Tesla), Nusrat, Rafiq, Shirin (passengers). Never user1/driver1.
- **Money in integer paisa.** Never floats.

## Git (graded — PRD Sections 10 and 11)

- Branches: `master`, `pre-release`, `release/v1.0.0`, and `feature/*` for all feature work.
- Never commit feature work directly to `master`. Merge through a GitHub PR (`gh pr create`, then `gh pr merge --merge`). Never force-push.
- Commit format: `<type>(<scope>): <short description>` — types: feat, fix, refactor, test, docs, chore, build.
- One commit = one understandable change. No "update", "fix", "final", "wip".
- Never commit `.env` or secrets. Only `.env.example`.

## AI usage

AI use is allowed and must be shown openly (PRD Section 8). Keep this file in the repo. Log accepted and rejected AI suggestions as we go in [docs/ai-usage.md](docs/ai-usage.md). The README's AI Usage section summarizes it at the end.
