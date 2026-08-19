/**
 * Replay the captured testnode L2 history onto the browser (wasm) Nitro engine.
 *
 * Run `capture-l2-history.mjs` first, and point this at a running
 * `browser-nitro-host.mjs`. Replaying the signed transactions in their original
 * order reproduces the same CREATE/CREATE2 addresses, so the existing
 * `.testnode/config/governance.json` manifest stays valid, and — unlike
 * injecting state — it produces the real event history that Ponder indexes.
 *
 *   node e2e/support/replay-l2-history.mjs [rpcUrl]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RPC =
  process.argv[2] ?? process.env.REPLAY_RPC ?? "http://127.0.0.1:8547";
const HISTORY = resolve(
  process.cwd(),
  process.env.REPLAY_HISTORY ?? "e2e/fixtures/l2-history.json"
);
const MANIFEST =
  process.env.GOVERNANCE_ADDRESSES_FILE ??
  "/Users/dlance/Developer/arbitrum-governance-indexer/.testnode/config/governance.json";

let id = 0;
async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const json = await response.json();
  return json;
}

async function must(method, params = []) {
  const json = await rpc(method, params);
  if (json.error) {
    throw new Error(`${method} failed: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

const pad = (hex, bytes) =>
  (hex ?? "0x0").replace(/^0x/, "").padStart(bytes * 2, "0");

/**
 * An EthDeposit delayed message (L1MessageType_EthDeposit = 12).
 *
 * Payload is `20-byte to || 32-byte balance`, per arbos/parse_l2.go
 * parseEthDepositMessage. Used for the funding-only cross-chain entries: their
 * effect on the L2 is purely a balance credit, and without them the testnode's
 * deployer accounts have no gas here (genesis only prefunds the anvil keys,
 * and prefunding an arbitrary address is impossible without its key).
 */
function ethDepositMessage(to, value, index, blockNumber, timestamp) {
  return {
    header: {
      kind: 12,
      sender: "0x00000000000000000000000000000000000a4b05", // L1 address alias of the bridge; any poster works for a deposit
      blockNumber,
      timestamp,
      requestId: `0x${pad(`0x${index.toString(16)}`, 32)}`,
      // Go unmarshals *big.Int from a JSON number, not a hex string.
      baseFeeL1: 0,
    },
    // Go marshals []byte as base64, so the payload goes over the wire that way
    // rather than as the 0x-hex the rest of the JSON-RPC surface uses.
    l2Msg: Buffer.from(`${pad(to, 20)}${pad(value, 32)}`, "hex").toString(
      "base64"
    ),
  };
}

const history = JSON.parse(readFileSync(HISTORY, "utf-8"));
const chainId = await must("eth_chainId");
const clientVersion = await must("web3_clientVersion");

if (BigInt(chainId) !== BigInt(history.chainId)) {
  throw new Error(
    `chain id mismatch: history was captured on ${history.chainId}, target is ${chainId}`
  );
}
console.log(`replaying ${history.entries.length} entries onto ${RPC}`);
console.log(`  target: ${clientVersion} chainId=${chainId}`);
if (!/nitro-browser-node/.test(clientVersion)) {
  console.warn(
    `  WARNING: target does not look like the browser engine (${clientVersion})`
  );
}

const startBlock = Number(await must("eth_blockNumber"));
let funded = 0;
let sent = 0;
const skippedCrossChain = [];
const failures = [];

for (const [i, entry] of history.entries.entries()) {
  if (entry.kind === "signed") {
    const json = await rpc("eth_sendRawTransaction", [entry.raw]);
    if (json.error) {
      failures.push({
        block: entry.block,
        hash: entry.hash,
        from: entry.from,
        nonce: entry.nonce,
        error: json.error.message,
      });
      // Keep going: one failure downstream is far less informative than the
      // full list, and nonce gaps make every later tx from that sender fail too.
    } else {
      sent += 1;
    }
  } else if (entry.kind === "deposit" || entry.kind === "submitRetryable") {
    const value = entry.retryValue ?? entry.value ?? "0x0";
    const to = entry.retryTo ?? entry.to;
    const dataLength = ((entry.retryData ?? "0x").length - 2) / 2;

    if (dataLength === 0 && to && BigInt(value) > 0n) {
      // Funding-only: replay as a deposit so the deployer accounts have gas.
      //
      // Two steps, because enqueueDelayedMessages only *queues*: the message has
      // to be consumed by an ingest whose delayedMessagesRead advances by one,
      // which is what MEL does on a real parent chain. Queuing alone leaves the
      // account unfunded and every later tx from it fails "rejected by ArbOS".
      const status = await must("nitro_inboxStatus");
      const seen = Number(
        status.delayedMessagesSeen ?? status.delayedMessagesRead ?? 0
      );
      const message = ethDepositMessage(
        to,
        value,
        seen,
        entry.block,
        Math.floor(Date.now() / 1000)
      );
      await must("nitro_enqueueDelayedMessages", [[message]]);
      await must("nitro_ingestMessage", [
        { message, delayedMessagesRead: seen + 1 },
      ]);
      funded += 1;
    } else {
      // Token-bridge deploys and gateway calls. Verified that no contract in the
      // indexer's manifest depends on these, and no spec exercises the token
      // bridge — but record them rather than dropping them silently.
      skippedCrossChain.push({
        block: entry.block,
        kind: entry.kind,
        to,
        dataLength,
      });
    }
  }
  if ((i + 1) % 50 === 0) {
    console.log(
      `  ${i + 1}/${history.entries.length} (sent=${sent} funded=${funded})`
    );
  }
}

const endBlock = Number(await must("eth_blockNumber"));
console.log(`\nreplay done: ${startBlock} -> ${endBlock}`);
console.log(`  signed sent: ${sent}/${history.counts.signed}`);
console.log(`  funding deposits: ${funded}`);
console.log(
  `  cross-chain skipped (token bridge): ${skippedCrossChain.length}`
);
for (const s of skippedCrossChain) {
  console.log(`    blk${s.block} ${s.kind} to=${s.to} dataLen=${s.dataLength}`);
}

if (failures.length) {
  console.log(`\n${failures.length} transactions failed:`);
  for (const f of failures.slice(0, 15)) {
    console.log(
      `    blk${f.block} from=${f.from} nonce=${f.nonce}: ${f.error}`
    );
  }
  if (failures.length > 15)
    console.log(`    ... and ${failures.length - 15} more`);
}

// The point of the exercise: the governance contracts the indexer reads must
// exist at the same addresses they had on the testnode.
const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8"));
console.log(`\ngovernance contracts at their testnode addresses:`);
let missing = 0;
// Entries that live on the parent chain and are therefore correctly absent from
// an L2-only replay. The indexer's LocalManifest only reads L2 addresses.
const L1_ONLY = new Set(["l1Timelock"]);

for (const [name, address] of Object.entries(manifest.contracts)) {
  if (typeof address !== "string" || !address.startsWith("0x")) continue;
  if (L1_ONLY.has(name)) {
    console.log(`  skip ${name} ${address} (parent-chain contract)`);
    continue;
  }
  const code = await must("eth_getCode", [address, "latest"]);
  const ok = code && code !== "0x";
  if (!ok) missing += 1;
  console.log(
    `  ${ok ? "OK  " : "MISS"} ${name} ${address} (${(code.length - 2) / 2} bytes)`
  );
}

console.log(
  `\n${missing === 0 ? "all manifest contracts present" : `${missing} manifest contracts MISSING`}`
);
process.exit(failures.length || missing ? 1 : 0);
