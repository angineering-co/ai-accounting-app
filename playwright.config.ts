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
    // Inject the test environment so Playwright runs are deterministic
    // regardless of the developer's .env.local (or its absence in CI).
    env: {
      // Cloudflare's always-pass test keys for Turnstile auto-completion.
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      // Dummy GA id so <GoogleAnalytics> mounts in app/layout.tsx. Without
      // it, sendGAEvent in @next/third-parties bails early because its
      // module-level currDataLayerName is never initialized — and the
      // apply-form tests' dataLayer assertions never see the event.
      NEXT_PUBLIC_GA_ID: "G-TESTXXXXXX",
    },
  },
});
