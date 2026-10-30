// Test settings. Run with: npm test
// The API tests need a PostgreSQL database whose name contains "test" (it is wiped before each run).

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./tests/globalSetup.ts",
    // One file at a time, because the API tests share one database.
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL || "postgresql://portal:portal@localhost:5432/infra_portal_test",
      JWT_SECRET: "test-secret",
      PROVISIONER: "mock",
      CONFIGURATOR: "mock",
      MOCK_STEP_DELAY_MS: "0",
    },
  },
});
