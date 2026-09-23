# AI Usage Log

A running log of how AI was used while building Dhaka Tesla Pool, kept as the work happens. The README's AI Usage section summarizes it.

## Tools

- **Claude Code (Claude Opus)** — pair programmer in the terminal: explained options, wrote code in small reviewed steps, ran builds and tests.
- **Context7 (MCP plugin)** — pulls current, version-specific library docs into Claude Code, so syntax comes from the docs instead of memory.

How I work with it: one small step at a time. Each step is discussed first, then built, tested, and reviewed by me before it is committed. Working rules are in [CLAUDE.md](../CLAUDE.md).

## Accepted suggestions

| Date | Area | Suggestion | Why I accepted it |
|---|---|---|---|
| 2026-09-24 | Backend / TypeScript | Add `"types": ["node"]` to `tsconfig.json` | Context7 showed that TypeScript 7 loads no global types by default. Older tutorials skip this line and the build breaks. |
| 2026-09-24 | Docker | Mount the Postgres volume at `/var/lib/postgresql`, not `/var/lib/postgresql/data` | Context7 showed that the Postgres 18 image moved its data folder. The old path fails on startup. I tested it: data survived deleting the container. |
| 2026-09-24 | Architecture | Use a Next.js rewrite (`/api/*` → backend) instead of nginx | Next.js is already a server, so it can forward requests itself. One container less, and the auth cookie stays on one site (no CORS, no third-party cookies). In my Angular project I needed nginx because Angular builds to static files. |

## Rejected or changed suggestions

| Date | Area | Suggestion | What I did instead, and why |
|---|---|---|---|
| 2026-09-24 | Naming | Name the folders `api/` and `web/` | Renamed to `backend/` and `frontend/`. Clearer for anyone reading the repo for the first time. |
| 2026-09-24 | Git | Add a `Co-Authored-By: Claude` line to every commit | Removed. AI use is documented here and in the README, not inside commit messages. Commits stay one line. |
| 2026-09-24 | Process | Build the whole backend setup in one "Step 1" | Split into smaller steps (line endings, then server, then Docker…), so I could review and understand each change before the next one. |
