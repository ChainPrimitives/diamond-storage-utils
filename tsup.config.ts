import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  shims: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  esbuildOptions(options) {
    options.platform = "node";
  },
});
