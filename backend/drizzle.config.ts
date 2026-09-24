import { defineConfig } from "drizzle-kit";

// Only used by `drizzle-kit generate` to write SQL migration files.
// The backend applies them itself at startup, so no DB credentials here.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
