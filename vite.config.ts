/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any sub-path (e.g. GitHub Pages).
  base: "./",
  // public/assets holds the game art; keep Vite's bundles out of that folder.
  build: { assetsDir: "static" },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
