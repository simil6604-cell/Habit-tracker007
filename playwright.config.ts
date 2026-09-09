import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 3100;
const testDbPath = path.join(__dirname, "prisma", "test.db");

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false, // shared SQLite file — keep tests sequential
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use the environment's pre-installed Chromium instead of downloading one.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],

  webServer: {
    // A dev server compiles each route on first visit and can force a full
    // page reload mid-navigation while doing so (Fast Refresh), racing with
    // whatever the test just clicked or filled. Testing against a production
    // build sidesteps that entirely — no on-demand compilation, no HMR.
    command: "npm run build && npm run start -- --port 3100",
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: `file:${testDbPath}`,
      // Auth redirects are built from this — must match the test server's
      // own port or they'll bounce to whatever NEXTAUTH_URL is in .env.
      NEXTAUTH_URL: `http://localhost:${PORT}`,
      AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
