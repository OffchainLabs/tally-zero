import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
    domains: ["placehold.co", "www.tally.xyz", "raw.githubusercontent.com"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      async_hooks: path.resolve(__dirname, "lib/async-hooks-mock.js"),
      fs: path.resolve(__dirname, "lib/empty-module.js"),
      net: path.resolve(__dirname, "lib/empty-module.js"),
      tls: path.resolve(__dirname, "lib/empty-module.js"),
      dns: path.resolve(__dirname, "lib/empty-module.js"),
      child_process: path.resolve(__dirname, "lib/empty-module.js"),
      "pino-pretty": path.resolve(__dirname, "lib/empty-module.js"),
      lokijs: path.resolve(__dirname, "lib/empty-module.js"),
      encoding: path.resolve(__dirname, "lib/empty-module.js"),
    };
    return config;
  },
};

import withBundleAnalyzer from "@next/bundle-analyzer";

export default process.env.ANALYZE === "true"
  ? withBundleAnalyzer(nextConfig)
  : nextConfig;
