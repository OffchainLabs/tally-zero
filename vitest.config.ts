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
      // Cross-layer tests run the client and server without Next's compiler.
      "server-only": path.resolve(__dirname, "./lib/empty-module.js"),
      "@": path.resolve(__dirname, "./"),
      "@components": path.resolve(__dirname, "./components"),
      "@context": path.resolve(__dirname, "./context"),
      "@lib": path.resolve(__dirname, "./lib"),
      "@config": path.resolve(__dirname, "./config"),
      "@data": path.resolve(__dirname, "./data"),
      "@hooks": path.resolve(__dirname, "./hooks"),
      "@types": path.resolve(__dirname, "./types"),
    },
  },
});
