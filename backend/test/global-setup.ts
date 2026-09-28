import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Runs once before all tests: drop and rebuild the test database, so every run starts clean
export default async function setup() {
  const testUrl = new URL(process.env.DATABASE_URL!);
  const name = testUrl.pathname.slice(1);
  if (!name.endsWith("_test")) throw new Error(`Refusing to reset "${name}": not a test database`);

  // CREATE and DROP DATABASE must run while connected to a different database
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect().catch((err: Error) => {
    throw new Error("Tests need Postgres. Start it: docker compose up -d db", { cause: err });
  });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  // Same steps as a real start: migrations (tables + Dhaka map), then the story cast
  const { db } = await import("../src/db/index.js");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  await import("../src/db/seed.js"); // closes its database pool when done
}
