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
      SMTP_HOST: "test.invalid",
      SMTP_FROM: "test@example.invalid",
      OPERATOR_NAME: "Browser-Testbetreiber",
      LEGAL_IMPRINT_FILE: "docs/legal/impressum.txt",
      LEGAL_PRIVACY_FILE: "docs/legal/datenschutz.txt",
      LEGAL_CONTRIBUTION_FILE: "docs/legal/beitraege.txt",
      LEGAL_REVIEWED: "false",
    },
  },
  reporter: "list",
});
