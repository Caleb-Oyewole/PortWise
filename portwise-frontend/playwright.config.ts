import { defineConfig, devices } from "@playwright/test";

// Runs against a local preview build in demo mode by default.
// For the live site: BASE_URL=https://your-domain npx playwright test
const baseURL = process.env.BASE_URL ?? "http://localhost:4173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run build && npx vite preview --port 4173 --strictPort",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
        env: { VITE_USE_MOCKS: "true" },
      },
});
