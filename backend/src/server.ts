import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { app } from "./app.js";
import { db } from "./db/index.js";

// backend/drizzle, resolved from this file so it works from src/ (tsx) and dist/ (node)
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

// Apply pending migrations before serving. If this fails, the process exits instead of
// serving requests against the wrong schema.
// ponytail: no lock between instances; fine for one backend. With several replicas,
// run migrations as a separate deploy step before rollout.
await migrate(db, { migrationsFolder });
console.log("Database migrations applied");

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
