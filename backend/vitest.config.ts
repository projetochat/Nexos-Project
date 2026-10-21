import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.ts", "src/**/*.spec.ts", "scripts/**/*.spec.mjs"],
    pool: "threads",
    maxWorkers: 1,
    minWorkers: 1,
  },
});
