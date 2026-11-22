import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.toml", environment: "dev" },
      miniflare: {
        bindings: {
          BOT_TOKEN: "123456:TEST_TOKEN",
          GEMINI_API_KEY: "test-gemini-key",
          WEBHOOK_SECRET: "test_secret_123",
          OWNER_ID: "1",
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
