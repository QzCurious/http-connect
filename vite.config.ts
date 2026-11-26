import { dts } from "rolldown-plugin-dts";
import { defineConfig } from "vite";

export default defineConfig({
  oxc: { exclude: [/\.js$/, /\.d\.[cm]?ts$/] },
  build: {
    rolldownOptions: {
      plugins: [dts({ generator: "tsgo" })],
      external: ["@standard-schema/spec"],
    },
    lib: {
      entry: { public: "src/public.ts" },
      formats: ["es"],
    },
    outDir: "dist",
    sourcemap: true,
  },
});
