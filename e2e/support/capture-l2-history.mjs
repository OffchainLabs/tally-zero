/**
 * Capture the testnode L2's transaction history so it can be replayed onto the
 * browser (wasm) Nitro engine.
 *
 * The wasm engine boots an empty chain. The indexer-backed specs need more than
 * state — Ponder derives delegates, proposals and elections from *logs* — so the
 * history has to be re-executed, not injected. Replaying the same signed
 * transactions in the same order from the same senders reproduces the same
 * CREATE/CREATE2 addresses, which is what lets the existing
 * `.testnode/config/governance.json` manifest keep working unchanged.
 *
 * What is captured, and what is not:
 *   - 0x0 / 0x2  user-signed  -> raw bytes, replayed via eth_sendRawTransaction
 *   - 0x68 / 0x64 submitRetryable / deposit -> fields, rebuilt as L1IncomingMessages
 *   - 0x69 retry  -> skipped; ArbOS schedules its own retries
 *   - 0x6a internal -> skipped; ArbOS emits one per block on its own
 *
 * Run once, with the Docker testnode up:
 *   node e2e/support/capture-l2-history.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const L2_RPC = process.env.CAPTURE_L2_RPC ?? "http://127.0.0.1:8547";
const OUT = resolve(
  process.cwd(),
  process.env.CAPTURE_OUT ?? "e2e/fixtures/l2-history.json"
);

/** Transaction types that are user-signed and therefore replayable verbatim. */
const SIGNED = new Set(["0x0", "0x1", "0x2", "0x3"]);
/** ArbOS-generated types we deliberately do not replay. */
const RETRY = "0x69";
const INTERNAL = "0x6a";
const SUBMIT_RETRYABLE = "0x68";
const DEPOSIT = "0x64";

let id = 0;
async function rpc(method, params = []) {
  const response = await fetch(L2_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const json = await response.json();
  if (json.error) {
    throw new Error(`${method} failed: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

const chainId = await rpc("eth_chainId");
const head = Number(await rpc("eth_blockNumber"));
console.log(`capturing ${L2_RPC} chainId=${chainId} head=${head}`);

/**
 * One flat, ordered list. Order is the whole point: nonces and CREATE addresses
 * both depend on it, so replay walks this array start to finish.
 */
const entries = [];
const counts = { signed: 0, submitRetryable: 0, deposit: 0, skipped: 0 };

for (let n = 1; n <= head; n += 1) {
  const block = await rpc("eth_getBlockByNumber", [
    `0x${n.toString(16)}`,
    true,
  ]);
  for (const tx of block.transactions ?? []) {
    if (SIGNED.has(tx.type)) {
      entries.push({
        kind: "signed",
        block: n,
        hash: tx.hash,
        from: tx.from,
        nonce: tx.nonce,
        raw: await rpc("debug_getRawTransaction", [tx.hash]),
      });
      counts.signed += 1;
    } else if (tx.type === SUBMIT_RETRYABLE) {
      // Fields mirror arbos/parse_l2.go parseSubmitRetryableMessage, so the
      // replayer can re-serialize an L1MessageType_SubmitRetryable payload.
      entries.push({
        kind: "submitRetryable",
        block: n,
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        gas: tx.gas,
        input: tx.input,
        requestId: tx.requestId ?? null,
        // Present on ArbitrumSubmitRetryableTx; names follow the RPC marshaling.
        depositValue: tx.depositValue ?? null,
        maxSubmissionFee: tx.maxSubmissionFee ?? null,
        maxFeePerGas: tx.maxFeePerGas ?? tx.gasPrice ?? null,
        refundTo: tx.refundTo ?? null,
        beneficiary: tx.beneficiary ?? null,
        retryTo: tx.retryTo ?? tx.to ?? null,
        retryValue: tx.retryValue ?? tx.value ?? null,
        retryData: tx.retryData ?? tx.input ?? null,
      });
      counts.submitRetryable += 1;
    } else if (tx.type === DEPOSIT) {
      entries.push({
        kind: "deposit",
        block: n,
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        requestId: tx.requestId ?? null,
      });
      counts.deposit += 1;
    } else if (tx.type === RETRY || tx.type === INTERNAL) {
      counts.skipped += 1;
    } else {
      throw new Error(
        `unhandled tx type ${tx.type} at block ${n} (${tx.hash}); teach the capture about it rather than dropping it`
      );
    }
  }
  if (n % 100 === 0) console.log(`  block ${n}/${head}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify({ chainId, head, capturedAtBlock: head, counts, entries }, null, 2)}\n`
);
console.log(`wrote ${OUT}`);
console.log(counts);
