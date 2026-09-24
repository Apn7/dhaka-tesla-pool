# AI Usage Log

A running log of how AI was used while building Dhaka Tesla Pool, kept as the work happens. The README's AI Usage section summarizes it.

## Tools

- **Claude Code (Claude Opus)** — pair programmer in the terminal: explained options, wrote code in small reviewed steps, ran builds and tests.
- **Context7 (MCP plugin)** — pulls current, version-specific library docs into Claude Code, so syntax comes from the docs instead of memory.
- **A second AI chat assistant** — used as a second opinion on design choices (for example, the ORM choice below).

How I work with it: one small step at a time. Each step is discussed first, then built, tested, and reviewed by me before it is committed. Working rules are in [CLAUDE.md](../CLAUDE.md).

## Accepted suggestions

| Date | Area | Suggestion | Why I accepted it |
|---|---|---|---|
| 2026-09-24 | Backend / TypeScript | Add `"types": ["node"]` to `tsconfig.json` | Context7 showed that TypeScript 7 loads no global types by default. Older tutorials skip this line and the build breaks. |
| 2026-09-24 | Docker | Mount the Postgres volume at `/var/lib/postgresql`, not `/var/lib/postgresql/data` | Context7 showed that the Postgres 18 image moved its data folder. The old path fails on startup. I tested it: data survived deleting the container. |
| 2026-09-24 | Architecture | Use a Next.js rewrite (`/api/*` → backend) instead of nginx | Next.js is already a server, so it can forward requests itself. One container less, and the auth cookie stays on one site (no CORS, no third-party cookies). In my Angular project I needed nginx because Angular builds to static files. |
| 2026-09-25 | Dependencies | Pin exact versions of `drizzle-orm` (0.45.3) and `drizzle-kit` (0.31.11) | Drizzle 1.0 is still a release candidate and its docs mix 1.0 syntax in (for example, `migrate()` options). Pinning means nothing changes under me before the deadline. |

## Rejected or changed suggestions

| Date | Area | Suggestion | What I did instead, and why |
|---|---|---|---|
| 2026-09-24 | Naming | Name the folders `api/` and `web/` | Renamed to `backend/` and `frontend/`. Clearer for anyone reading the repo for the first time. |
| 2026-09-24 | Git | Add a `Co-Authored-By: Claude` line to every commit | Removed. AI use is documented here and in the README, not inside commit messages. Commits stay one line. |
| 2026-09-24 | Process | Build the whole backend setup in one "Step 1" | Split into smaller steps (line endings, then server, then Docker…), so I could review and understand each change before the next one. |
| 2026-09-25 | Database | Claude suggested Prisma as the ORM | Asked a second AI, which suggested Drizzle. I compared both against the PRD: the hard parts here are constraints, transactions, and the concurrent seat claim, not CRUD. Drizzle expresses CHECK constraints and the atomic `UPDATE ... WHERE seats + n <= capacity` as normal code, stays close to SQL (which I know), and runs migrations from app code with no generate step in Docker. Prisma would need raw SQL and hand-edited migrations for exactly those parts. |
