import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // pg waits forever by default; fail fast so /health can report 503
  connectionTimeoutMillis: 5000,
});

// Idle connections error when Postgres restarts. Without a listener, Node crashes.
// The pool already drops the broken connection, so logging is enough.
pool.on("error", (err) => {
  console.error("Postgres pool error (idle connection dropped)", err.message);
});
export const db = drizzle({ client: pool });
