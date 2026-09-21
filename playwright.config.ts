import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const PORT = 3100;
const testDbPath = path.join(__dirname, "prisma", "test.db");
// Outside the repo on purpose: the deployment check warns about anything a
// deploy would wipe, and the suite asserts it fires for the test database
// (which does live in the repo) and stays quiet for this. One safe path and
// one unsafe path in the same run tests both halves of that check.
const testUploadDir = path.join(os.tmpdir(), "momentum-e2e-uploads");

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
      // No AI key on purpose. The suite then exercises the path every user
      // hits when the AI is unreachable — the honest fallbacks and the status
      // banner — instead of depending on a network service, spending credit,
      // and varying run to run with whatever the model happened to reply.
      ANTHROPIC_API_KEY: "",
      UPLOAD_DIR: testUploadDir,
      // Auth redirects are built from this — must match the test server's
      // own port or they'll bounce to whatever NEXTAUTH_URL is in .env.
      NEXTAUTH_URL: `http://localhost:${PORT}`,
      AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
