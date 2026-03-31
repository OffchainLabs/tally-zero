import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
    domains: ["placehold.co", "www.tally.xyz", "raw.githubusercontent.com"],
  },
  turbopack: {
    resolveAlias: {
      async_hooks: "./lib/async-hooks-mock.js",
      fs: "./lib/empty-module.js",
      net: "./lib/empty-module.js",
      tls: "./lib/empty-module.js",
      dns: "./lib/empty-module.js",
      child_process: "./lib/empty-module.js",
    },
  },
  webpack: (config, { isServer, webpack }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");

    // Polyfill/fallback for Node.js modules used by @gzeoneth/gov-tracker
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        async_hooks: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      };

      // Add webpack plugin to replace async_hooks with a mock
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /async_hooks/,
          path.resolve(__dirname, "lib/async-hooks-mock.js")
        )
      );
    }

    return config;
  },
};

import withBundleAnalyzer from "@next/bundle-analyzer";

export default process.env.ANALYZE === "true"
  ? withBundleAnalyzer(nextConfig)
  : nextConfig;
