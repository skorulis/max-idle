import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // CI runners can be slow; large tournament / leaderboard tests need headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
