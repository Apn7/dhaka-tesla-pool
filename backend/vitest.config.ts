import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test-only value, never used outside tests
    env: { JWT_SECRET: "test-only-jwt-secret-at-least-32-characters" },
  },
});
