# Dhaka Tesla Pool

**Share a seat. Split the fare. Survive Dhaka traffic.**

A ride-pooling MVP for three-seat electric rickshaws ("Teslas") in Dhaka, built for the RoBenDevs Software Engineer Internship.

| | |
|---|---|
| **Live app** | https://dhaka-tesla-pool-beta.vercel.app (tap a name on the login page, or use `nusrat@teslapool.test` / `bullet123`) |
| **Demo video (6 min)** | [Watch the walkthrough on Google Drive](https://drive.google.com/file/d/1NxxA8AX7FcTg0NDwfcrG1Bc3W-9yeA_k/view) |
| **Stack** | Next.js 16 · Express 5 · PostgreSQL 18 · Drizzle ORM · TypeScript · Docker Compose |

> The live API runs on a free plan. A ping every 10 minutes keeps it awake. If it falls asleep anyway, the first visit takes about a minute, and the app shows "Waking up the free server" meanwhile.

## Contents

[Summary](#summary) · [Problem](#the-problem) · [Screenshots](#screenshots) · [Features](#features) · [How it works](#how-it-works) · [Architecture](#architecture) · [Database](#database-erd) · [Concurrency](#concurrency-the-last-seat) · [Tech choices](#tech-choices) · [Project structure](#project-structure) · [Run it](#run-it) · [Demo logins](#demo-logins) · [API](#api-overview) · [Tests](#what-the-tests-cover) · [Deployment](#deployment) · [Assumptions](#assumptions) · [Decisions](#decisions-and-trade-offs) · [Limitations](#known-limitations) · [Next](#next-improvements) · [If it goes viral](#if-it-goes-viral) · [Git workflow](#git-workflow) · [AI usage](#ai-usage)

## Summary

Passengers going the same way share one three-seat Tesla and each pay less. Nusrat books Banani → Mohakhali. Rafiq books Banani → Gulshan 1. Jashim sees both requests, takes them in one ride in his Tesla, Bullet, and gets his stops in the best drop-off order. Each passenger pays their own fare, fixed when they booked, in cash.

The cast from the brief is used everywhere: in the seed data, the tests, the screenshots and this README. Kamal and his Tesla Toofan exist for the "two drivers accept the same request" race.

## The problem

Pooling looks simple until you list what must never go wrong:

- **Who can share?** Two trips from the same place can still go different ways. Rafiq should ride with Nusrat, but not with someone going to Uttara.
- **What does each person pay?** Every passenger needs their own fare, fixed at booking and checkable by hand.
- **Never overbook.** Bullet has 3 seats. Two taps at the same instant must not squeeze in a fourth passenger.
- **Privacy.** Nusrat sees her own fare and status, not Rafiq's.
- **History.** After the trip, the system can explain who did what, and when.

## Screenshots

From the live site, at phone size.

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/login.png" width="220" alt="Login page with one-tap buttons for the demo cast"><br><sub>Log in: one tap for each demo user</sub></td>
    <td align="center"><img src="docs/screenshots/nusrat-booking.png" width="220" alt="Nusrat picks Banani to Mohakhali and sees the fare breakdown: 50.88 Tk"><br><sub>Nusrat sees her fare before booking</sub></td>
    <td align="center"><img src="docs/screenshots/nusrat-pooled.png" width="220" alt="Nusrat's ride card: driver on the way, sharing with 1 other passenger"><br><sub>Nusrat is matched and shares the ride</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/jashim-requests.png" width="220" alt="Jashim online, with Nusrat's and Rafiq's requests waiting"><br><sub>Jashim sees the waiting requests</sub></td>
    <td align="center"><img src="docs/screenshots/jashim-ride.png" width="220" alt="Jashim's pooled ride: drop Nusrat at Mohakhali, then Rafiq at Gulshan 1, 102.72 Tk to collect"><br><sub>One pool: drop-off order and cash</sub></td>
    <td align="center"><img src="docs/screenshots/jashim-history.png" width="220" alt="Jashim's past rides after completing the trip"><br><sub>After the trip: ride history</sub></td>
  </tr>
</table>

## Features

**Passenger (Nusrat, Rafiq, Shirin)**

- Sign up and log in. The session is an httpOnly cookie.
- Pick a pickup and a drop-off from 12 Dhaka areas, and 1–3 seats. See the road distance and the fare breakdown before booking.
- Track the trip: waiting → driver on the way → driver here → on the trip → completed (or cancelled). The screen refreshes every 5 seconds.
- See the driver and how many others share the car, never their names or fares.
- Cancel for free until the trip starts.
- See past trips with their fares.

**Driver (Jashim in Bullet, Kamal in Toofan)**

- Go online or offline. Offline drivers see no requests and can't accept.
- See waiting requests that fit: any request when the car is free; once a ride is open, only passengers going the same way.
- Accept a request. It starts a new ride, or adds the passenger to the open one.
- A ride card with the stops in drop-off order, each passenger's fare, the seats in use and the cash to collect.
- One button for the next step: arrived → start trip → complete.
- See past rides with the number of passengers and the cash collected.

**Both screens**

- Loading, empty and error states: "Loading…" until the first answer, a message while the server can't be reached (it clears by itself on the next refresh), and a "Waking up the free server" notice.
- Every action button shows that it's working ("Requesting…", "Cancelling…") and can't be pressed twice meanwhile. The server refuses doubles anyway.

**Pool**

- Several requests share one ride. Occupied seats never exceed capacity: the check is in the SQL and in a database constraint.
- Each passenger has their own fare.
- New passengers can join until the driver taps Start.
- Every status change is recorded in `ride_events`: who, what and when.

## How it works

### Matching rule (PRD Section 4)

1. **Same pickup area.** One ride picks everyone up in one place, for example Banani.
2. **Small detours only.** For each possible drop-off order, every passenger's detour = the distance travelled until their drop-off − their direct distance. An order is valid if every detour is at most **3.5 km**. The shortest valid order wins. If no order is valid, they can't share.

Distances are real driving distances: 12 areas and 22 roads, measured in Google Maps and cross-checked with TomTom (`backend/drizzle/0001_dhaka_map.sql`). At startup the API computes the shortest distance between every pair of areas once (Floyd–Warshall) and keeps it in memory.

**Nusrat and Rafiq, both from Banani:**

| Drop-off order | Route | Detour | Total |
|---|---|---|---|
| **Mohakhali, then Gulshan 1** | 2.8 km + 3.2 km | Rafiq: 6.0 − 2.9 = **3.1 km** | **6.0 km (chosen)** |
| Gulshan 1, then Mohakhali | 2.9 km + 3.2 km | Nusrat: 6.1 − 2.8 = 3.3 km | 6.1 km |

So they pool, and Jashim drops Nusrat first. Someone going to Uttara can't join them: even the best order costs someone 5.6 km extra. The 3.5 km limit was calibrated on this map. It allows pools across neighbouring areas like Nusrat's and Rafiq's, and rejects cross-city ones.

Code: `planDropoffs` in `backend/src/domain/matching.ts`, and `backend/src/domain/graph.ts`.

### Fare (PRD Section 5)

```
fare per seat = 30 Tk base + 12 Tk × km − 20% pool discount
fare          = fare per seat × seats
```

km is the shortest road distance, rounded to 0.1 km (halves up). That is the only rounding.

| | Nusrat: Banani → Mohakhali, 2.8 km, 1 seat | Rafiq: Banani → Gulshan 1, 2.9 km, 1 seat |
|---|---|---|
| Base fare | 30.00 | 30.00 |
| Distance charge | 12 × 2.8 = 33.60 | 12 × 2.9 = 34.80 |
| Pool discount, 20% | −12.72 | −12.96 |
| **Pays** | **50.88 Tk** | **51.84 Tk** |

Jashim collects **102.72 Tk** in cash.

- **Money is stored as integer paisa** (5088, not 50.88). Floating point can't hold 0.1 exactly, so sums could drift by a paisa. The 20% is always a whole number of paisa, because 3000 and 120 both divide by 5.
- **The fare is fixed at booking** and stored with the request, like the price on a receipt. Later joins or cancels never change it.
- **Every ride is shareable**, so the pool discount always applies.
- **Cash only.** No payment gateway.

Code: `backend/src/domain/fare.ts`.

### Lifecycle (PRD Section 3)

Two status machines instead of one:

```
Ride (Jashim's trip):     ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED
                          or CANCELLED, if every passenger cancels before the start

Request (each passenger): REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED
                          or CANCELLED, any time before STARTED
```

**Why two:** a pool is one trip with several passengers. Rafiq can cancel without cancelling Nusrat's trip, and a request can wait (`REQUESTED`) before any trip exists. After matching, each request follows its ride.

- Only the moves listed in `backend/src/domain/lifecycle.ts` are allowed. The services turn that map into the SQL condition (`UPDATE ... WHERE status IN (...)`), so a skipped or repeated step changes no row and gets a 409.
- A ride and its requests change in the same transaction, and every change adds a row to `ride_events`.
- Joining a ride where Jashim has already arrived moves the new request `REQUESTED → MATCHED → DRIVER_ARRIVED` in one transaction.

## Architecture

```mermaid
flowchart LR
  B["Browser<br/>(passenger / driver)"]
  subgraph compose["docker compose"]
    F["frontend<br/>Next.js 16<br/>pages + /api/* rewrite"]
    A["backend<br/>Express 5 REST API<br/>auth · validation · business rules<br/>road graph (Floyd–Warshall, in memory)"]
    D[("db<br/>PostgreSQL 18")]
  end
  B -- "HTTPS, one origin<br/>(httpOnly JWT cookie)" --> F
  F -- "/api/* forwarded" --> A
  A -- "SQL (Drizzle + pg)<br/>transactions, constraints" --> D
```

- **One origin for the browser.** The browser only talks to Next.js, which forwards `/api/*` to Express. The login cookie is first-party and no CORS is needed.
- **All business rules live in the API:** matching, fares, seat capacity and status changes. The frontend only shows and submits.
- **The database is the last line of defence.** CHECK constraints, foreign keys and unique indexes reject bad data even if the code has a bug.
- **Backend layout:** each feature module has routes (HTTP only: validate, call the service, map the result to a status code) and a service (rules, transactions, SQL). Pure functions in `domain/` (graph, matching, fare, lifecycle) have no database or HTTP and are unit tested directly.
- **No Redis, queues or microservices.** Nothing in this MVP needs them (PRD Section 9).
- **Deployed** as the same three parts on three free hosts: Vercel → Render → Neon ([Deployment](#deployment)).

More detail: [docs/architecture.md](docs/architecture.md).

## Database (ERD)

```mermaid
erDiagram
  users ||--o| vehicles : "drives"
  users ||--o{ ride_requests : "books"
  users ||--o{ ride_events : "acts in"
  vehicles ||--o{ rides : "runs"
  areas ||--o{ roads : "area_a / area_b"
  areas ||--o{ rides : "pickup"
  areas ||--o{ ride_requests : "pickup / dropoff"
  rides |o--o{ ride_requests : "pools"
  rides |o--o{ ride_events : "history"
  ride_requests |o--o{ ride_events : "history"
```

| Table | Holds |
|---|---|
| `users` | Passengers and drivers; `role` decides what each can do |
| `vehicles` | Each driver's Tesla, its capacity and the online switch |
| `areas`, `roads` | The Dhaka map: 12 areas, 22 measured roads |
| `rides` | One trip of one Tesla = one pool, with the seat counter |
| `ride_requests` | One passenger's booking: pickup, drop-off, seats, fare, status; pool membership = `ride_id` |
| `ride_events` | Append-only history of every status change |

Rules Postgres enforces itself:

- `CHECK (seats_taken BETWEEN 0 AND capacity)` on `rides`.
- One active ride per car and one active request per passenger (partial unique indexes), so a double click can't book twice.
- A matched request must belong to a ride; a waiting one must not.
- Each road is stored once (`area_a_id < area_b_id`).
- IDs are UUID v7 (built into Postgres 18). Money is integer paisa and distance is integer meters.

The full ERD with every column, all constraints, and the five deliberate denormalizations with their reasons: [docs/architecture.md](docs/architecture.md).

## Concurrency: the last seat

Bullet has 1 seat left, and Nusrat and Shirin both want it. In this app a seat is taken when a driver **accepts** a request; booking alone takes no seat. So the race is two accepts for the last seat. Two drivers accepting the same passenger, and a passenger cancelling while being accepted, are the same kind of race.

**Now: Postgres decides, in one statement.**

```sql
UPDATE rides SET seats_taken = seats_taken + $seats
WHERE id = $rideId AND seats_taken + $seats <= capacity;
-- 1 row changed: the seat is yours.
-- 0 rows changed: full. The API answers 409 "Not enough free seats" and the whole accept rolls back.
```

- Postgres locks the row during the first update. The second update waits, re-checks against the new value and changes no row. There is no gap between "read the free seats" and "write".
- The backstop: `CHECK (seats_taken BETWEEN 0 AND capacity)`. Even a bug can't store 4 passengers in 3 seats.
- The request is claimed the same way: `... WHERE status = 'REQUESTED'`. If Kamal took Nusrat first, Jashim's accept changes no row.
- Every transaction takes its row locks in the same order (car → ride → request), so two of them can never wait for each other forever. A test runs Nusrat's cancel and Jashim's Start at the same moment; flipping the lock order on purpose made Postgres report a real `deadlock detected`.
- Tested for real: 6 tests fire requests at the same moment with `Promise.all` against Postgres (the last seat, two drivers on one request, cancel vs accept, cancel vs start, a double-click booking, two identical sign-ups).

**At larger scale:**

- The one-statement claim keeps working: contention is per car (3 seats), not global.
- In busy areas many drivers would race for the same requests, and most would get a 409. A dispatcher that assigns each request once (for example one queue per area) would replace the race.
- Mobile retries need idempotency keys on booking and accepting, so a retry can't double-book. Today the unique index already stops a second active booking.
- Split the data by city or zone, so a ride's rows live together and locks stay local.
- Keep Postgres as the source of truth for seats. Add distributed locks (for example in Redis) only if measured contention demands it.

## Tech choices

For each choice the PRD leaves open (Section 7): the alternatives, why it fits this MVP, and when I would switch.

| Area | Picked | Alternatives | Why it fits | Would switch when |
|---|---|---|---|---|
| Frontend | Next.js 16 (App Router), React 19 | React + Vite | Recommended by the PRD. Its rewrite forwards `/api/*` to Express, so the browser sees one site: a first-party cookie, no CORS, no nginx. | The app could ship as static files only; then Vite plus a reverse proxy. |
| Backend | Express 5 | NestJS, Fastify | 17 endpoints. Express 5 passes errors from async handlers to the error middleware by itself. Structure comes from feature modules. | A bigger team wants enforced modules and dependency injection (NestJS), or throughput becomes the bottleneck (Fastify). |
| API style | REST + JSON | GraphQL, tRPC | Few resources and clear actions (accept, cancel, arrive, start, complete). Status codes carry the meaning: 409 = full car or lost race. Easy to test with supertest. | Many clients need different shapes of the same data (GraphQL). |
| Database | PostgreSQL 18 | MySQL, SQLite, MongoDB | The hard rules are relational: a CHECK for capacity, partial unique indexes, row locks and transactions for the seat race. `uuidv7()` is built in. SQLite allows one writer at a time, so the race couldn't be tested for real. | Not the engine. At scale: read replicas, partitioning, PostGIS for real geography. |
| ORM + migrations | Drizzle 0.45 + drizzle-kit | Prisma, raw `pg` | Stays close to SQL: the atomic seat claim, CHECKs and row locks are plain code. Migrations are plain SQL files, applied by the app at startup. | Drizzle 1.0 becomes stable (upgrade). |
| Validation | Zod 4 | Joi, express-validator | One schema checks and types the input. Unknown fields, like a fare sent by the browser, are dropped. A 400 lists every wrong field. | Moving to NestJS and its validation pipes. |
| Auth | JWT (`jose`, HS256) in an httpOnly cookie; passwords hashed with Node's `scrypt` | Server-side sessions, Auth.js, bcrypt | No session store for one backend. Page scripts can't read the cookie, and SameSite=Lax stops other sites from sending it. `scrypt` needs no dependency. | Stolen tokens must be revocable ("log out everywhere"): server-side sessions, or short tokens plus refresh tokens. |
| Styling | Tailwind CSS 4 | CSS modules, MUI, shadcn/ui | Colour tokens in one place (`@theme`) and no component library to ship. Enough for 4 screens. | Many more screens and forms: a component library. |
| Tests | Vitest + supertest on a real Postgres | Jest, a mocked database, Testcontainers | The integrity rules live in Postgres, so the tests must hit Postgres. Races run with `Promise.all`. The test database is rebuilt on every run. | Running in CI: Testcontainers. Frontend flows: Playwright. |
| Hosting | Vercel + Render + Neon, all free | Azure, Render's Postgres | See [docs/deployment.md](docs/deployment.md#why-these-hosts). | Cold starts start to hurt real users. |

## Project structure

```
backend/
  src/
    app.ts            the Express app (routes + error handler); tests import it
    server.ts         migrate → load the Dhaka map → listen
    domain/           pure rules, no DB or HTTP: graph (Floyd–Warshall), matching, fare, lifecycle
    modules/          one folder per feature: auth, areas, requests (passenger), driver
                      <feature>.routes.ts = HTTP only · <feature>.service.ts = rules, transactions, SQL
    middleware/       auth (cookie → user + role check), errors (400 / 4xx / 500)
    lib/              password (scrypt), token (JWT), HttpError
    db/               schema.ts (tables, CHECKs, indexes), index.ts (connection pool), seed.ts (demo cast)
  drizzle/            SQL migrations: 0000_init, 0001_dhaka_map
  test/               global setup (fresh tesla_pool_test database) + helpers
frontend/
  app/                page.tsx picks passenger.tsx or driver.tsx by role; login/, signup/; parts.tsx
  lib/                api.ts (fetch wrapper), format.ts (Tk, status words), ui.ts (shared styles)
  next.config.ts      the /api/* rewrite to the backend
docs/                 architecture.md, deployment.md, ai-usage.md, PRD.md, screenshots/
docker-compose.yml    db → backend (migrates) → seed (once) → frontend
```

## Run it

### Prerequisites

- **Docker Desktop** (Docker Compose v2). That's all you need to run everything.
- For development without Docker, also **Node.js 24** and **pnpm 12.4.2** (`corepack enable`, or `npm i -g pnpm@12.4.2`). `backend/` and `frontend/` are two separate pnpm projects.

### Environment variables

Copy `.env.example` to `.env`. It holds no real secrets.

| Variable | Used by | Example | Notes |
|---|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | the `db` container | `tesla`, `change-me`, `tesla_pool` | Compose refuses to start without them. |
| `DATABASE_URL` | backend outside Docker (`pnpm dev`, `pnpm db:seed`) | `postgresql://tesla:change-me@localhost:5432/tesla_pool` | Compose builds its own, with host `db`. |
| `JWT_SECRET` | backend | 64 random hex characters | At least 32 characters, or the backend refuses to start. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BACKEND_URL` | frontend build | `http://localhost:4000` (the default) | Read at **build** time by the `/api` rewrite. Compose passes `http://backend:4000`. |
| `PORT` | backend | `4000` (the default) | Hosts like Render set it. |
| `NODE_ENV` | backend | `production` in the Docker image | Turns on the cookie's `Secure` flag. |
| `COOKIE_SECURE` | backend | `false` in `docker-compose.yml` only | Turns the `Secure` flag off again for local Docker, which serves plain http: Safari drops Secure cookies on `http://localhost`. Never set it on a real host. |

### With Docker (one command)

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and JWT_SECRET
docker compose up --build
```

Open http://localhost:3000. Compose starts `db`, then `backend` (which applies the migrations, including the Dhaka map), then a one-shot `seed` that adds the demo cast and exits, then `frontend`. All ports bind to `127.0.0.1`. Health check: http://localhost:4000/health.

### Without Docker (development)

```bash
docker compose up -d db                  # Postgres only

cd backend
pnpm install
pnpm dev                                 # API on :4000; migrates on start; reads ../.env
pnpm db:seed                             # once: adds the demo cast (safe to run again)

cd ../frontend
pnpm install
pnpm dev                                 # http://localhost:3000
```

### Migrations and seed

- **Migrations run automatically** when the backend starts, all pending ones in one transaction. If they fail, the backend exits.
- The Dhaka map (areas and roads) is a migration, because the app can't quote or match without it. The demo users and cars are seed data, because they must never appear in a real deployment by accident. The app never seeds itself.
- New migration: `pnpm db:generate --name <name>` in `backend/` writes SQL from `src/db/schema.ts`. Read the SQL before committing it.

### Run the tests

```bash
docker compose up -d db
cd backend && pnpm test                  # Vitest: 64 tests, about 30 s
cd frontend && pnpm lint                 # ESLint
```

The tests use their own database, `tesla_pool_test`, dropped and rebuilt before every run. The setup refuses to touch any database whose name doesn't end in `_test`.

## Demo logins

Every password is `bullet123`. The login page has a one-tap button for each.

| Who | Email | Role |
|---|---|---|
| Nusrat | `nusrat@teslapool.test` | passenger |
| Rafiq | `rafiq@teslapool.test` | passenger |
| Shirin | `shirin@teslapool.test` | passenger |
| Jashim | `jashim@teslapool.test` | driver of Bullet, 3 seats |
| Kamal | `kamal@teslapool.test` | driver of Toofan, 3 seats |

To see a pool: book as Nusrat (Banani → Mohakhali), log out, book as Rafiq (Banani → Gulshan 1), then log in as Jashim, switch online and accept both. A second browser, or a private window, shows a passenger and the driver side by side.

## API overview

All routes are under `/api` and exchange JSON. The login cookie travels by itself.

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/api/auth/signup` | anyone | Create a passenger account and log in |
| POST | `/api/auth/login` | anyone | Log in (sets the httpOnly cookie) |
| POST | `/api/auth/logout` | anyone | Log out |
| GET | `/api/auth/me` | logged in | The current user |
| GET | `/api/areas` | logged in | The 12 areas |
| GET | `/api/requests/quote?pickupAreaId&dropoffAreaId&seats` | passenger | Distance and fare breakdown; saves nothing |
| POST | `/api/requests` | passenger | Book; the server computes the fare |
| GET | `/api/requests/current` | passenger | Own active request, plus a count of co-passengers |
| GET | `/api/requests/history` | passenger | Own completed and cancelled trips, newest 50 |
| POST | `/api/requests/:id/cancel` | passenger | Cancel own request before the start |
| GET | `/api/driver/me` | driver | Own car and active ride, stops in drop-off order |
| POST | `/api/driver/online` | driver | `{ "online": true \| false }` |
| GET | `/api/driver/requests` | driver | Waiting requests that fit |
| POST | `/api/driver/requests/:id/accept` | driver | Accept into a new or open ride |
| POST | `/api/driver/ride/:step` | driver | `arrive`, `start` or `complete` the own active ride |
| GET | `/api/driver/history` | driver | Past rides with passengers and cash, newest 50 |
| GET | `/` | anyone | 200 `{"status":"ok"}` without touching the database (for the keep-warm ping) |
| GET | `/health` | anyone | Database check: 200 `{"db":"up"}` or 503 |

Errors: **400** lists every invalid field. **401** means not logged in. **403** means the wrong role. **404** means not found, or not yours: someone else's request looks exactly like a missing one. **409** means the wrong state, a full car, or a lost race. Drivers never send a ride id: every driver action works on their own car's active ride.

## What the tests cover

64 backend tests: 20 unit tests for the pure rules and the login tokens, and 44 integration tests that call the real Express app against a real Postgres. The PRD's list (Section 12):

| The PRD asks that… | Tested in |
|---|---|
| Bullet's capacity can never be exceeded | `driver.test.ts`: "last seat: Bullet has 1 seat left and two requests are accepted at once; only one gets it" |
| Invalid state transitions are rejected | `lifecycle.test.ts` (6 tests); `driver.test.ts`: "steps can't be skipped: no start before arrival, no complete before start" |
| Nusrat's and Rafiq's pooled fares are correct | `fare.test.ts` (50.88 and 51.84 Tk); `requests.test.ts`: quotes on the real map; `driver.test.ts`: the pooled trip start to finish, 102.72 Tk cash |
| Users can't modify another user's ride | `requests.test.ts`: "Rafiq can't cancel Nusrat's ride: to him it doesn't exist", "each passenger sees only their own request"; role checks both ways; `token.test.ts`: "Nusrat can't edit her token to become a driver" |
| Cancellation rules hold | `requests.test.ts`: 6 cancel tests (while waiting, twice, leaving a pool, the last passenger, after the start, someone else's); `lifecycle.test.ts` |
| Concurrent requests can't corrupt capacity | 6 race tests with `Promise.all` (see [Concurrency](#concurrency-the-last-seat)) |

To check that the tests really guard the risky rules, we broke the code on purpose (removed the owner check, the seat release, and the seat and status conditions in the SQL) and watched a test fail each time.

## Deployment

| | |
|---|---|
| App | https://dhaka-tesla-pool-beta.vercel.app |
| API health | https://dhaka-tesla-pool-api-pdi0.onrender.com/health |

Free plans only: Vercel (Next.js) → Render (Express in Docker, Singapore) → Neon (PostgreSQL 18, Singapore). The browser only talks to Vercel, as it does locally. The live site follows the release branch; each push redeploys by itself. A free outside ping (cron-job.org) calls `GET /` every 10 minutes, so the API doesn't sleep; `/` never touches the database, so Neon still can. A 16-point smoke test on the live site passed: booking, pooling, fares, the full lifecycle and the cookie flags.

Settings, why these hosts, the free-plan limits and how to operate it: [docs/deployment.md](docs/deployment.md).

## Assumptions

Where the brief leaves room (Section 17), these are my choices:

1. **Geography:** a fixed list of 12 Dhaka areas and 22 roads with measured driving distances. No map API, no GPS.
2. **One pickup area per ride.** Jashim picks everyone up in the same area; passengers from different areas don't share.
3. **"Going the same way"** means every passenger's detour is at most 3.5 km ([Matching](#matching-rule-prd-section-4)).
4. **The driver decides.** A request waits until a driver accepts it; nothing is assigned automatically. The backend re-checks the match on every accept.
5. **Joining ends at Start.** New passengers can join until Jashim taps Start, because the car is still at the pickup area. Free cancelling ends at the same moment.
6. **A request is 1–3 seats in one car**, all or nothing.
7. **Every ride is shareable**, so every fare gets the 20% pool discount, even if nobody joins.
8. **Fares are fixed at booking** and paid in cash to the driver.
9. **Drivers don't sign up.** A driver needs a vehicle, so drivers and their cars come from the seed. Sign-up creates passengers only.
10. **One active request per passenger, one active ride per car.**
11. **The destination can't change** after booking: cancel (free before the start) and book again.
12. **Going offline mid-trip is allowed.** The current ride goes on; the driver just stops seeing new requests.
13. **Drivers can't cancel** an accepted ride. It isn't in the PRD's driver list (see [Known limitations](#known-limitations)).

## Decisions and trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| The driver accepts (no auto-join) | The PRD's driver list says "accept a ride/pool", and a human gatekeeper suits a three-seat rickshaw. | A request waits until a driver acts. |
| A real road graph, shortest paths computed once at startup | Straight lines ignore roads, so fares and matches would be wrong. No map API cost or delay. | The areas are fixed; adding one means a migration. |
| A detour limit instead of "same destination" | Pooling asks "same direction?". A trip the other way always causes a big detour, so direction needs no extra rule. | One number to tune (3.5 km). |
| Two status machines (ride + request) | One passenger can cancel without ending the others' trip. | Two statuses to keep in step (always in the same transaction). |
| Integer paisa, fare fixed at booking | Exact money and a fare anyone can check by hand. | Rate changes don't touch old bookings (on purpose). |
| Rules enforced in SQL and constraints, not in app memory | Correct under concurrency, and still correct with several API instances. | Some rules live in SQL conditions, kept in the service next to the code that uses them. |
| One origin through the Next.js rewrite | A first-party httpOnly cookie and no CORS. | Every API call makes one extra hop. |
| Polling every 5 seconds | Simple, and fine on free hosting; the state lives in Postgres. | Up to 5 seconds of delay, and more requests than push updates. |
| Migrations at startup, seed only on request | The app can't work without its tables; demo users must never reach a real database by accident. | No lock between instances while migrating (fine for one backend). |
| Feature modules + pure domain, no repository layer | Rules are plain, unit-tested functions, and the seat-claim SQL stays visible. | Services talk to Drizzle directly. |

## Known limitations

- Drivers can't cancel an accepted ride.
- Waiting requests never expire.
- One pickup area per ride.
- Updates arrive by polling every 5 seconds, not by push.
- No refresh tokens or token revocation: a stolen cookie works until it expires (1 day).
- No rate limiting, for example on login.
- Lists show the newest 50 entries, without paging.
- Migrations take no lock between instances (fine for one backend).
- No frontend tests (lint only), and no CI pipeline: the tests run locally.
- Free hosting: the API stays awake only thanks to an outside ping; if the ping stops, it sleeps after 15 quiet minutes (about a minute to wake up). Login takes about 2.5 s on the free CPU because password hashing is slow on purpose.

## Next improvements

1. **Driver cancel:** the ride becomes `CANCELLED`, each passenger goes back to `REQUESTED` with the same fare so another driver can take them, and a cancellation counter per driver.
2. **Push updates** (WebSockets or Server-Sent Events) instead of polling.
3. **Refresh tokens with revocation**, and rate limiting on login and booking.
4. **Request expiry**, for example after 10 minutes without a driver.
5. **Several pickup areas per ride**, routing through the pickups with the same detour rule.
6. **CI:** GitHub Actions runs the backend tests on every PR, and Render deploys only after they pass.
7. **End-to-end tests** for the passenger and driver flows (Playwright).
8. **Cursor paging** for the history lists.

## If it goes viral

The PRD bonus: 1 million passengers and 100,000 drivers. My reasoning, with a diagram and ten changes: [docs/scaling.md](docs/scaling.md). In short:

- **The first problem is all the asking.** The screens ask for news every 5 seconds: about 38,000 questions per second at the busiest hour, against about 28 bookings per second. So the server should tell the phones about changes instead (WebSockets).
- **More copies of the server** behind a load balancer, and read-only database copies for past rides. Seats and bookings always use the main database.
- **The seat claim stays as it is:** it locks one car's row, so cars never wait for each other.

## Git workflow

```
feature/* ──PR──▶ master ──▶ pre-release ──▶ release/v1.0.0 (deployed, shown in the video)
                    ▲            │ docs, deployment checks
                    └────────────┘ merged back after the release
```

- Seven feature branches, each merged into `master` through a pull request with a merge commit: `feature/project-setup`, `feature/database-schema`, `feature/tesla-pooling`, `feature/review-fixes`, `feature/passenger-auth`, `feature/passenger-booking`, `feature/driver-flow` (PRs #1–#7).
- `pre-release` holds the integration work: this README, the docs and the deployment checks.
- Commits follow `<type>(<scope>): <description>`, one logical change each.

## AI usage

AI was used openly, as the brief allows (Section 8).

**Tools:**

- **Claude Code:** pair programmer in the terminal. It explained options, wrote code in small reviewed steps, and ran builds and tests.
- **Context7:** current library docs inside Claude Code, so syntax came from the docs instead of memory.
- **Ponytail** (a Claude Code plugin): pushes for the simplest solution that works. Code comments starting with `ponytail:` mark a deliberate shortcut and its limit.
- **ChatGPT:** a second opinion on design choices.
- **Claude Cowork:** a browser agent that collected the 22 road distances from Google Maps and TomTom. I compared the two lists and chose which value to trust.

**How:** one small step at a time: discuss, build, test, review, commit. Working rules are in [CLAUDE.md](CLAUDE.md).

**One accepted suggestion:** a design review by a second Claude session found that a fresh `docker compose up` would build an empty road map. Compose seeded the data only after the backend was healthy, but the backend built the map at startup. We moved the map into a migration (`0001_dhaka_map.sql`) and tested it on a fresh stack and on an already seeded one.

**One rejected suggestion:** Claude said Uber closes a pool once the driver reaches the pickup, and suggested the same rule. Uber's own driver guides say riders can be added before, during and after the first pickup. Since our rides have one pickup area, passengers can join until Jashim taps Start.

The full log of accepted and rejected suggestions: [docs/ai-usage.md](docs/ai-usage.md).
