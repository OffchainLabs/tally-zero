import type { BrowserContext, Page } from "@playwright/test";

/**
 * Everything the suite is allowed to reach. The app is on :3000, the indexer on
 * :42069 (normally reached server-side through the same-origin proxy), and the
 * testnode chain on :8545/:8547 — all local, so an allow-list by hostname
 * rather than by port keeps this from needing edits when a port moves.
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Any http(s) URL whose host is not local. Anchored on the scheme so data:,
 * blob: and about: never match — they never leave the browser, and intercepting
 * them would break inline assets.
 */
const REMOTE_URL = /^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/]|\[::1\])/i;

/**
 * Abort every request that leaves the machine.
 *
 * Loading a governance page otherwise makes the browser call public mainnet RPCs
 * (arb1.arbitrum.io, eth.drpc.org, nova.arbitrum.io) plus WalletConnect and
 * analytics endpoints. Those are real network calls from a test runner: they
 * make the suite fail for reasons that have nothing to do with this codebase,
 * they are slow, and they quietly hide the fact that a test might be asserting
 * against live mainnet data rather than the local stack.
 *
 * Blocking them is also a load-bearing assertion in its own right — if a spec
 * starts failing because of this, it was depending on the internet.
 *
 * Non-HTTP schemes (data:, blob:, about:) are left alone; they never leave the
 * browser and aborting them would break inline assets.
 */
/** The testnode's chains, as published by the container. */
const LOCAL_L1_RPC = "http://localhost:8545";
const LOCAL_L2_RPC = "http://localhost:8547";

/**
 * Point the app's RPC at the local testnode and stop anything leaving the box.
 *
 * Blocking alone is not enough. The app has an RPC health/failover layer, so a
 * blocked endpoint makes it cycle providers and retry — measured at 18 requests
 * to arb1.arbitrum.io for a single page load, against 4 unblocked. Giving it a
 * reachable local endpoint means it gets a real answer the first time.
 *
 * The local chain does not host the Arbitrum One governors, so these reads come
 * back empty rather than populated. That is fine for the suite as it stands: no
 * spec asserts on live mainnet governance data, and a spec that started to would
 * be depending on the internet, which is exactly what this prevents.
 */
export async function useLocalStack(
  target: BrowserContext | Page
): Promise<void> {
  await target.addInitScript(
    ([l1, l2]) => {
      // useLocalStorage stores JSON, so the values must be quoted strings.
      window.localStorage.setItem("tally-zero-l1-rpc", JSON.stringify(l1));
      window.localStorage.setItem("tally-zero-l2-rpc", JSON.stringify(l2));
    },
    [LOCAL_L1_RPC, LOCAL_L2_RPC]
  );
  await blockRemote(target);
}

export async function blockRemote(
  target: BrowserContext | Page
): Promise<void> {
  // Match only remote hosts. A "**/*" pattern would route every local dev-server
  // chunk through the handler as well, and in dev that is hundreds of requests
  // per page each paying an IPC round-trip — it cost about a minute across the
  // suite. Non-matching requests never reach the handler.
  await target.route(REMOTE_URL, (route) => {
    const url = new URL(route.request().url());

    if (LOCAL_HOSTNAMES.has(url.hostname)) {
      return route.continue();
    }

    // Answer rather than abort. A transport-level failure reads as "the network
    // blipped", which viem and react-query both retry with backoff — that turned
    // a 35s suite into 2.1 minutes of waiting on retries. A well-formed
    // JSON-RPC error is a definitive answer, so callers give up immediately.
    return route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "blocked: remote host in e2e" },
      }),
    });
  });
}
