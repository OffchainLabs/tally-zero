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
  // The wallet provider renders on the server (see Web3ModalProvider). Its
  // Base Account connector reaches @coinbase/cdp-sdk through that package's
  // Node entry, and the SDK lazily imports some twenty optional @x402/*
  // modules that are not installed. Bundling it for SSR makes Turbopack
  // resolve every one of them; leaving it external lets Node load the SDK at
  // runtime, where those imports only run if the x402 payment path is called,
  // which this app never does.
  serverExternalPackages: ["@coinbase/cdp-sdk"],
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
