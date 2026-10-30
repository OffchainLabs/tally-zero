/* eslint-disable no-process-env */
// Ensures the local backend stack (chain 412346 + indexer + Postgres) is
// reachable before the e2e run. It does NOT bake/boot the chain itself — that
// is heavy and machine-specific; bring it up from the indexer repo with
// `pnpm start:local` (Stage 4 CI wires that boot around Playwright). We poll the
// indexer's health + SIWE nonce so a green run guarantees the real SIWE mount
// (ponder start + Postgres writable pool) is serving.
const INDEXER_URL =
  process.env.GOVERNANCE_INDEXER_URL ?? "http://localhost:42069";

async function ping(path: string, init?: RequestInit): Promise<number> {
  try {
    const res = await fetch(`${INDEXER_URL}${path}`, init);
    return res.status;
  } catch {
    return 0;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function notReady(detail: string): Error {
  return new Error(
    `Backend not ready at ${INDEXER_URL} (${detail}).\n` +
      "Start it from the indexer repo:\n" +
      "  cd ../arbitrum-governance-indexer && pnpm start:local\n" +
      "(boots the local governance testnode chain + ponder start + Postgres.)"
  );
}

export default async function globalSetup() {
  const deadline = Date.now() + 30_000;

  // Health is free to poll, so wait on it at 1s intervals.
  let health = 0;
  while (Date.now() < deadline) {
    health = await ping("/api/health");
    if (health === 200) break;
    await sleep(1000);
  }
  if (health !== 200) throw notReady("/api/health never returned 200");

  // The nonce probe is what proves the SIWE mount is really serving, but it is
  // rate-limited to 10/min per IP and the suite needs that budget, so polling
  // it once a second would spend, and on a slow boot exhaust, the very thing
  // the run depends on. It is attempted a bounded number of times instead:
  // 1 nonce in the normal case, never more than 3.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const nonce = await ping("/api/auth/nonce", { method: "POST" });
    if (nonce === 201) return;
    if (attempt < 3) await sleep(2000);
  }
  throw notReady(
    "/api/health is 200 but POST /api/auth/nonce never returned 201; " +
      "the SIWE mount (ponder start + writable Postgres pool) is not serving, " +
      "or the 10/min nonce rate limit is still cooling down from a previous run"
  );
}
