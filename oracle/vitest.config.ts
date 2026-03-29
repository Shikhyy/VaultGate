import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run each test file in isolation so mocks don't bleed between suites
    pool: "forks",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
