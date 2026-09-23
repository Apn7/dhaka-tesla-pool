# Dhaka Tesla Pool — working rules

Take-home project for the RoBenDevs Software Engineer Internship. The brief is in [docs/PRD.md](docs/PRD.md) — read it before any design decision.

## Stack (decided)

- `frontend/` — Next.js (App Router) + TypeScript + Tailwind
- `backend/` — Node.js + Express + TypeScript, Zod validation, JWT in httpOnly cookie
- PostgreSQL via Prisma (raw SQL for the seat-claim query)
- Vitest + supertest against a real Postgres
- `docker compose up` runs everything

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

AI use is allowed and must be shown openly (PRD Section 8). Keep this file in the repo. Note accepted and rejected AI suggestions as we go, for the README's AI Usage section.
