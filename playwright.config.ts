import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium-admin-flows",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/admin-user.json",
      },
      testIgnore: [/.*\.portal\.spec\.ts/, /.*\.public\.spec\.ts/],
      dependencies: ["setup"],
    },
    {
      name: "chromium-client-flows",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/client-user.json",
      },
      testMatch: /.*\.portal\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      // Public marketing routes — no auth, no DB seeding.
      name: "chromium-public-flows",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /.*\.public\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Cloudflare's always-pass test keys so Turnstile auto-completes in headless
    // browsers. Overrides whatever real key the developer has in .env.local —
    // tests must be deterministic regardless of local environment.
    env: {
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    },
  },
});
