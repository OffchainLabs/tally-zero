import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  globalIgnores([
    "opensrc/**",
    "e2e/**",
    "test-results/**",
    ".next/**",
    "out/**",
  ]),
  {
    extends: [...nextCoreWebVitals],

    rules: {
      "no-process-env": "error",
    },
  },
  {
    files: ["scripts/**/*.ts"],

    rules: {
      "no-process-env": "off",
    },
  },
  {
    files: ["next.config.mjs"],

    rules: {
      "no-process-env": "off",
    },
  },
]);
