import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    setupFiles: ["./src/tests/apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        singleWorker: true,
        isolatedStorage: true,
      },
    },
  },
});
