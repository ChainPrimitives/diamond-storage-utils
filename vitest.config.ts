import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // Map .js imports to .ts source files so vitest can resolve them
      {
        find: /^(\.{1,2}\/.*?)\.js$/,
        replacement: "$1",
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    testTimeout: 30_000,
  },
});
