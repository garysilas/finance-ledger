import { defineConfig, devices } from "@playwright/test";

// Development suite for the /design style reference: runs `pnpm dev` since
// the page does not exist in a production build.
export default defineConfig({
  testDir: "./e2e/design",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
