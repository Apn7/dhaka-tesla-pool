import { defineConfig } from "vitest/config";

// Tests use their own database next to the dev one (same server, name tesla_pool_test),
// rebuilt on every run by test/global-setup.ts. The server address comes from the root
// .env like `pnpm dev`; CI can set DATABASE_URL directly instead.
if (!process.env.DATABASE_URL) process.loadEnvFile("../.env");
const testDb = new URL(process.env.DATABASE_URL!);
testDb.pathname = "/tesla_pool_test";
process.env.DATABASE_URL = testDb.href; // seen by global setup and by every test worker

export default defineConfig({
  test: {
    // Test-only value, never used outside tests
    env: { JWT_SECRET: "test-only-jwt-secret-at-least-32-characters" },
    globalSetup: "./test/global-setup.ts",
  },
});
