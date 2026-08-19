import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The act-as happy path needs a Safe deployed on chain 412346. The testnode
 * bakes one (`pnpm testnode:safe` in the indexer repo) and records it as
 * `contracts.testSafe` in its `governance.json` config export.
 *
 * CI passes the address through `TEST_SAFE_ADDRESS`, but locally that meant the
 * two happy-path tests silently skipped unless the developer happened to export
 * it by hand. Reading the manifest as a fallback makes them run against any
 * stack that has actually baked a Safe, which is the condition they care about —
 * the env var is a convenience, not the source of truth.
 */
function readSafeFromManifest(): string | undefined {
  // The indexer writes its config export to <indexerRepo>/.testnode/config.
  // Playwright runs with cwd at the repo root, and the indexer is checked out
  // beside it (the same layout e2e/global-setup.ts assumes in its error text).
  const configDir =
    process.env.ARBITRUM_TESTNODE_CONFIG_DIR ??
    resolve(process.cwd(), "../arbitrum-governance-indexer/.testnode/config");

  try {
    const manifest = JSON.parse(
      readFileSync(resolve(configDir, "governance.json"), "utf8")
    ) as { contracts?: { testSafe?: string } };
    return manifest.contracts?.testSafe;
  } catch {
    // No stack checked out, or no Safe baked yet.
    return undefined;
  }
}

/** The baked test Safe, or undefined when the local stack has none. */
export const TEST_SAFE_ADDRESS: string | undefined =
  process.env.TEST_SAFE_ADDRESS ?? readSafeFromManifest();
