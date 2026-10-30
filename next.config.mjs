import { realpathSync } from "node:fs";
import path from "node:path";

// The L1 voting library is linked from the indexer repo until it is published. Turbopack only
// resolves files under its root, so when the link points outside this app, the root becomes the
// directory both share. Installed from a registry it sits in node_modules and nothing changes.
const appDir = import.meta.dirname;
function turbopackRoot() {
  let lib;
  try {
    lib = realpathSync(
      path.join(appDir, "node_modules/@offchainlabs/l1-voting-proving")
    );
  } catch {
    return undefined;
  }
  if (!path.relative(appDir, lib).startsWith("..")) return undefined;
  let root = appDir;
  while (path.relative(root, lib).startsWith("..")) root = path.dirname(root);
  return root;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      // User-uploaded avatars hosted on Vercel Blob.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  // The elections page moved under the Security Council section; keep old
  // links and bookmarks working.
  async redirects() {
    return [
      {
        source: "/elections",
        destination: "/security-council",
        permanent: true,
      },
      {
        source: "/elections/contender/:address",
        destination: "/security-council/contender/:address",
        permanent: true,
      },
    ];
  },
  turbopack: {
    root: turbopackRoot(),
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
