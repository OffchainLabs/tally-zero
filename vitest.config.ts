import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/opensrc/**", "**/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@lib": path.resolve(__dirname, "./lib"),
      "@config": path.resolve(__dirname, "./config"),
      "@data": path.resolve(__dirname, "./data"),
      "@types": path.resolve(__dirname, "./types"),
    },
  },
});
