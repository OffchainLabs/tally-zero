/**
 * Copy the L1 voting contract ABIs from the governance indexer repo.
 *
 * The indexer pins the contracts these ABIs come from, so re-pinning here is
 * this one command rather than a hand copy:
 *
 *   pnpm abis:sync:l1-voting [path/to/agi-l1-voting]
 *
 * The path defaults to the sibling checkout `../oc/agi-l1-voting`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ABIS = [
  "L1ArbitrumGovernorAbi",
  "DelegateMappingAbi",
  "L2StateMirrorAbi",
];

const repoRoot = path.resolve(__dirname, "..");
const sourceRepo = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "..", "oc", "agi-l1-voting")
);
const sourceDir = path.join(sourceRepo, "packages/contracts/src/abis");
const targetDir = path.join(repoRoot, "data/abis");

function sourceRevision(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: sourceRepo,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`No ABIs at ${sourceDir}; pass the indexer repo path`);
  }

  const revision = sourceRevision();
  fs.mkdirSync(targetDir, { recursive: true });
  const written: string[] = [];

  for (const name of ABIS) {
    const source = fs.readFileSync(path.join(sourceDir, `${name}.ts`), "utf8");
    const header =
      `// Synced from agi-l1-voting@${revision} ` +
      `(packages/contracts/src/abis/${name}.ts) by scripts/sync-l1-voting-abis.ts.\n` +
      "// Do not edit; re-run the script to re-pin.\n";
    const target = path.join(targetDir, `${name}.ts`);
    fs.writeFileSync(target, header + source);
    written.push(target);
    console.log(`synced ${name}`);
  }

  // Format as the pre-commit hook would, so a re-sync with no upstream change
  // leaves no diff.
  execFileSync("pnpm", ["exec", "prettier", "--write", ...written], {
    cwd: repoRoot,
    stdio: "ignore",
  });
}

main();
