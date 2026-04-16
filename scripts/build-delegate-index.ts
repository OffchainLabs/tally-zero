/**
 * Generates data/delegate-index.json from data/delegates.json.
 *
 * The full delegates.json is 200MB+ and cannot be imported client-side.
 * This script extracts only delegates with a name, producing a small
 * lookup (address -> { name }) safe for client bundles.
 *
 * Run: npx tsx scripts/build-delegate-index.ts
 */

import * as fs from "fs";
import * as path from "path";

interface RawDelegate {
  account: {
    address: string;
    name: string;
  };
}

const INPUT_DIR = path.resolve(__dirname, "../data");
const OUTPUT = path.resolve(__dirname, "../data/delegate-index.json");

const raw: RawDelegate[] = [
  ...JSON.parse(
    fs.readFileSync(path.join(INPUT_DIR, "delegates-1.json"), "utf-8")
  ),
  ...JSON.parse(
    fs.readFileSync(path.join(INPUT_DIR, "delegates-2.json"), "utf-8")
  ),
  ...JSON.parse(
    fs.readFileSync(path.join(INPUT_DIR, "delegates-3.json"), "utf-8")
  ),
];

const index: Record<string, { name: string }> = {};

for (const d of raw) {
  const name = d.account.name?.trim();
  if (!name) continue;
  index[d.account.address.toLowerCase()] = {
    name,
  };
}

const count = Object.keys(index).length;
fs.writeFileSync(OUTPUT, `${JSON.stringify(index, null, 2)}\n`, "utf-8");

const sizeKB = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
console.log(`Wrote ${count} entries to delegate-index.json (${sizeKB} KB)`);
