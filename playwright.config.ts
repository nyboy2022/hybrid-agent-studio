import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3480",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm start",
    url: "http://127.0.0.1:3480/api/health",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: "3480",
      HYBRID_API_PORT: "4480",
      HYBRID_DATA_DIR: ".data-e2e",
    },
  },
});
