import { defineConfig } from "vitest/config";

/**
 * Unit tests for the parts of this app that are pure reasoning: league
 * arithmetic, meal planning, spaced repetition, the deployment safety check.
 *
 * These are the places where a wrong answer is confidently wrong — a title
 * race declared over, a day that misses its protein goal, a card scheduled for
 * the wrong day — and none of it is visible to an end-to-end test, which only
 * sees whatever number the page happens to print.
 */
export default defineConfig({
  // Resolves the "@/..." alias from tsconfig, so tests import modules by the
  // same path the app does.
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
