/**
 * Expose Nitro-in-the-browser as an ordinary HTTP JSON-RPC endpoint.
 *
 * The wasm engine lives inside a page, so nothing outside the browser can reach
 * it — and the Ponder indexer that the SIWE specs depend on is a Node process.
 * This host closes that gap: it drives a headless page running the engine and
 * forwards JSON-RPC into it, so the indexer (and anything else expecting a URL)
 * can talk to the browser system without knowing it is one.
 *
 * Usage:
 *   node e2e/support/browser-nitro-host.mjs [port]
 *
 * Requires the engine's dev server on :4173, and the port to be free — stop the
 * Docker testnode first, which is the point.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const PORT = Number(process.argv[2] ?? 8547);
/**
 * Which chain this instance serves. 412346 is the Nitro L2 the app reads
 * governance from; 1337 is the parent chain it treats as L1.
 *
 * Caveat worth stating plainly: the engine only builds Arbitrum chain configs
 * (cmd/browser-node/engine.go rejects a non-Arbitrum config and hardcodes
 * arbos.Engine), so the parent role is served by an ArbOS chain, not a
 * plain-EVM one. It answers the standard eth_* surface the app uses for L1
 * (chain id, block number, block lookups), but it is not geth.
 */
const CHAIN_ID = Number(
  process.argv[3] ?? process.env.BROWSER_NITRO_CHAIN_ID ?? 412346
);
const ENGINE_URL = `http://127.0.0.1:4173/test/govhost.html?chainId=${CHAIN_ID}`;

/**
 * A chain baked by `replay-l2-history.mjs` + `nitro_exportState`. Booting from it
 * skips re-executing 200-plus transactions on every start, and — because replay
 * preserves CREATE addresses — the governance contracts land where the testnode's
 * `governance.json` says they are.
 */
const SNAPSHOT =
  process.env.BROWSER_NITRO_SNAPSHOT === "none"
    ? null
    : process.env.BROWSER_NITRO_SNAPSHOT
      ? resolve(process.env.BROWSER_NITRO_SNAPSHOT)
      : CHAIN_ID === 412346
        ? resolve(
            "/Users/dlance/Developer/nitro/browser-node/.cache/l2-baked.snapshot"
          )
        : null; // the parent chain has no baked history

const browser = await chromium.launch();
const page = await browser.newPage();

if (SNAPSHOT && existsSync(SNAPSHOT)) {
  const snapshot = readFileSync(SNAPSHOT, "utf-8").trim();
  // Must be in place before the page's module runs, since govhost.ts reads it
  // in its boot call.
  await page.addInitScript((value) => {
    window.__NITRO_SNAPSHOT__ = value;
  }, snapshot);
  console.log(`booting from baked snapshot (${snapshot.length} chars)`);
} else {
  console.log(`booting a fresh genesis (chainId=${CHAIN_ID})`);
}

await page.goto(ENGINE_URL);
await page.evaluate(() => window.nitroReady);
const chainId = await page.evaluate(() =>
  window.nitroProvider.request({ method: "eth_chainId" })
);
console.log(`browser nitro ready: chainId=${chainId} (requested ${CHAIN_ID})`);

/** Serialize evaluations; the engine is single-threaded behind one worker. */
let queue = Promise.resolve();
const handle = (body) => {
  queue = queue.then(() =>
    page.evaluate(async (raw) => {
      const provider = window.nitroProvider;
      const one = async (req) => {
        try {
          const result = await provider.request({
            method: req.method,
            params: req.params ?? [],
          });
          return { jsonrpc: "2.0", id: req.id ?? null, result };
        } catch (error) {
          return {
            jsonrpc: "2.0",
            id: req.id ?? null,
            error: {
              code: error?.code ?? -32000,
              message: String(error?.message ?? error),
            },
          };
        }
      };
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? await Promise.all(parsed.map(one))
        : await one(parsed);
    }, body)
  );
  return queue;
};

createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const result = await handle(body);
      const payload = JSON.stringify(result);
      res.writeHead(200, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        "access-control-allow-origin": "*",
      });
      res.end(payload);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: String(error) },
        })
      );
    }
  });
}).listen(PORT, "127.0.0.1", () =>
  console.log(`browser nitro HTTP host on http://127.0.0.1:${PORT}`)
);
