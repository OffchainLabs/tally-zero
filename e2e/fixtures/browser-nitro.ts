import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Serve the app's JSON-RPC from Nitro running in the browser as WebAssembly,
 * instead of from the Docker testnode.
 *
 * The engine is `@offchainlabs/nitro-browser-node`: the Go Nitro node compiled
 * to js/wasm and hosted in a Web Worker. It cannot be reached over HTTP — it
 * lives inside a page — so a normal RPC URL cannot point at it.
 *
 * The bridge here is Playwright-native and needs no Service Worker: boot the
 * engine in a second page, then intercept the app's RPC requests and answer
 * them by evaluating against that page's EIP-1193 provider. The request really
 * is executed by Nitro in a browser; only the transport is synthetic.
 *
 * Requires the engine's dev server:
 *   cd ../nitro/browser-node && npx vite --config test/vite.config.ts \
 *     --host 127.0.0.1 --port 4173
 */
const ENGINE_URL = "http://127.0.0.1:4173/test/govhost.html";

/** The chains the app is configured to call, both answered by the same engine. */
const RPC_HOSTS = new Set(["localhost:8545", "localhost:8547"]);

export interface BrowserNitro {
  /** The page hosting the wasm engine; keep it open for the run. */
  page: Page;
  chainId: string;
  close: () => Promise<void>;
}

/** Boot the wasm engine in its own page and wait for it to be ready. */
export async function startBrowserNitro(
  browser: Browser
): Promise<BrowserNitro> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(ENGINE_URL);
  // Booting compiles ~34MB of wasm, so this is deliberately generous.
  await page.evaluate(
    () => (window as unknown as { nitroReady: Promise<void> }).nitroReady
  );

  const chainId = (await page.evaluate(async () => {
    const provider = (
      window as unknown as {
        nitroProvider: { request: (a: unknown) => Promise<unknown> };
      }
    ).nitroProvider;
    return provider.request({ method: "eth_chainId" });
  })) as string;

  return { page, chainId, close: () => context.close() };
}

/**
 * Point `target`'s JSON-RPC at the wasm engine.
 *
 * Anything else leaving the machine is still refused, so a test cannot silently
 * fall back to a public endpoint if the engine fails to answer.
 */
export async function useBrowserNitro(
  target: BrowserContext | Page,
  nitro: BrowserNitro
): Promise<void> {
  await target.route(/^https?:\/\//i, async (route) => {
    const url = new URL(route.request().url());

    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      if (!RPC_HOSTS.has(url.host)) return route.continue();

      // An RPC call: hand the body to Nitro in the engine page.
      const body = route.request().postData();
      if (!body) return route.continue();

      try {
        const result = await nitro.page.evaluate(async (raw) => {
          const provider = (
            window as unknown as {
              nitroProvider: {
                request: (a: {
                  method: string;
                  params?: unknown[];
                }) => Promise<unknown>;
              };
            }
          ).nitroProvider;

          const handle = async (req: {
            id?: unknown;
            method: string;
            params?: unknown[];
          }) => {
            try {
              const value = await provider.request({
                method: req.method,
                params: req.params ?? [],
              });
              return { jsonrpc: "2.0", id: req.id ?? null, result: value };
            } catch (error) {
              return {
                jsonrpc: "2.0",
                id: req.id ?? null,
                error: {
                  code: (error as { code?: number }).code ?? -32000,
                  message: (error as Error).message ?? "browser nitro error",
                },
              };
            }
          };

          const parsed = JSON.parse(raw) as
            | { id?: unknown; method: string; params?: unknown[] }
            | { id?: unknown; method: string; params?: unknown[] }[];
          // viem and ethers both batch, so handle either shape.
          return Array.isArray(parsed)
            ? await Promise.all(parsed.map(handle))
            : await handle(parsed);
        }, body);

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(result),
        });
      } catch (error) {
        // The engine page died or the call threw outside the provider.
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32000,
              message: `browser nitro bridge: ${String(error)}`,
            },
          }),
        });
      }
    }

    // Everything genuinely remote stays refused.
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

  await target.addInitScript(() => {
    window.localStorage.setItem(
      "tally-zero-l1-rpc",
      JSON.stringify("http://localhost:8545")
    );
    window.localStorage.setItem(
      "tally-zero-l2-rpc",
      JSON.stringify("http://localhost:8547")
    );
  });
}
