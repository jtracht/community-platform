import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "node --import tsx apps/server/src/main.ts",
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: false,
    env: {
      PORT: "3100",
      HOST: "127.0.0.1",
      SITE_URL: "http://127.0.0.1:3100",
      NODE_ENV: "development",
    },
  },
  reporter: "list",
});
