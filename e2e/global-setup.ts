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

export default async function globalSetup() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const health = await ping("/api/health");
    const nonce = await ping("/api/auth/nonce", { method: "POST" });
    if (health === 200 && nonce === 201) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Backend not ready at ${INDEXER_URL} (need /api/health 200 + POST /api/auth/nonce 201).\n` +
      "Start it from the indexer repo:\n" +
      "  cd ../arbitrum-governance-indexer && pnpm start:local\n" +
      "(boots the local governance testnode chain + ponder start + Postgres.)"
  );
}
