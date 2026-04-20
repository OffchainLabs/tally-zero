/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  images: {
    unoptimized: true,
    domains: ["placehold.co", "raw.githubusercontent.com"],
  },
  turbopack: {
    resolveAlias: {
      async_hooks: "./lib/async-hooks-mock.js",
      fs: "./lib/empty-module.js",
      net: "./lib/empty-module.js",
      tls: "./lib/empty-module.js",
      dns: "./lib/empty-module.js",
      child_process: "./lib/empty-module.js",
      "pino-pretty": "./lib/empty-module.js",
      lokijs: "./lib/empty-module.js",
      encoding: "./lib/empty-module.js",
    },
  },
};

import withBundleAnalyzer from "@next/bundle-analyzer";

export default process.env.ANALYZE === "true"
  ? withBundleAnalyzer(nextConfig)
  : nextConfig;
