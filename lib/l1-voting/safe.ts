// A Safe's own multi-owner path for one call: build the Safe transaction, collect owner approvals
// on chain (approveHash), and execute once the threshold is met with pre-validated signatures.
// Works with any owner wallet and no off-chain service. Owners may instead sign off chain (EIP-712)
// and share signatures through the Safe Transaction Service (safe-tx-service.ts); execution then
// merges those signatures with the on-chain approvals.

import {
  type Address,
  concatHex,
  type Hex,
  hexToNumber,
  pad,
  parseAbi,
  type PublicClient,
  size,
  sliceHex,
  toHex,
  zeroAddress,
} from "viem";

export const SAFE_ABI = parseAbi([
  "function nonce() view returns (uint256)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function approvedHashes(address owner, bytes32 hash) view returns (uint256)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
  "function approveHash(bytes32 hashToApprove)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes signatures) payable returns (bool)",
]);

export interface SafeCall {
  to: Address;
  data: Hex;
}

export interface SafeTxState {
  safe: Address;
  call: SafeCall;
  nonce: bigint;
  safeTxHash: Hex;
  threshold: number;
  owners: Address[];
  /** Owners whose approval is recorded on chain. */
  approvedBy: Address[];
}

/** The call as `execTransaction` arguments, minus the signatures (no refunds, plain CALL). */
export function execArgs(call: SafeCall) {
  return [
    call.to,
    BigInt(0),
    call.data,
    0,
    BigInt(0),
    BigInt(0),
    BigInt(0),
    zeroAddress,
    zeroAddress,
  ] as const;
}

export async function readSafeTx(
  client: PublicClient,
  safe: Address,
  call: SafeCall
): Promise<SafeTxState> {
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    client.readContract({
      address: safe,
      abi: SAFE_ABI,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<T>;
  const [nonce, threshold, owners] = await Promise.all([
    read<bigint>("nonce"),
    read<bigint>("getThreshold"),
    read<Address[]>("getOwners"),
  ]);
  const safeTxHash = await read<Hex>("getTransactionHash", [
    ...execArgs(call),
    nonce,
  ]);
  const approvals = await Promise.all(
    owners.map((o) => read<bigint>("approvedHashes", [o, safeTxHash]))
  );
  return {
    safe,
    call,
    nonce,
    safeTxHash,
    threshold: Number(threshold),
    owners,
    approvedBy: owners.filter((_, i) => approvals[i]! > BigInt(0)),
  };
}

/**
 * Pre-validated signatures (v = 1) for the approving owners, plus the executor if it is an owner:
 * Safe counts msg.sender's own v = 1 entry as its approval. Sorted by owner, as Safe requires.
 */
export function prevalidatedSignatures(
  approvers: Address[],
  executor?: Address
): Hex {
  const all = new Map<string, Address>();
  for (const a of approvers) all.set(a.toLowerCase(), a);
  if (executor) all.set(executor.toLowerCase(), executor);
  const sorted = [...all.values()].sort((a, b) =>
    BigInt(a) < BigInt(b) ? -1 : 1
  );
  return concatHex(
    sorted.map((owner) =>
      concatHex([pad(owner, { size: 32 }), pad("0x00", { size: 32 }), "0x01"])
    )
  );
}

/** The SafeTx as EIP-712 typed data (Safe >= 1.3 domain), whose hash is `safeTxHash`. */
export function safeTxTypedData(state: SafeTxState, chainId: number) {
  const [
    to,
    value,
    data,
    operation,
    safeTxGas,
    baseGas,
    gasPrice,
    gasToken,
    refundReceiver,
  ] = execArgs(state.call);
  return {
    domain: { chainId, verifyingContract: state.safe },
    types: {
      SafeTx: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "operation", type: "uint8" },
        { name: "safeTxGas", type: "uint256" },
        { name: "baseGas", type: "uint256" },
        { name: "gasPrice", type: "uint256" },
        { name: "gasToken", type: "address" },
        { name: "refundReceiver", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "SafeTx",
    message: {
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      nonce: state.nonce,
    },
  } as const;
}

/** How an owner's off-chain signature was made, which decides the `v` Safe expects. */
export type OwnerSignatureKind = "EIP712" | "ETH_SIGN";

export interface OwnerSignature {
  owner: Address;
  signature: Hex;
  kind: OwnerSignatureKind;
}

/**
 * A 65-byte ECDSA signature with the `v` Safe's `checkNSignatures` expects: 27/28 for an EIP-712
 * signature over the safeTxHash, and 31/32 (v + 4) for an eth_sign one over the prefixed hash.
 * A wallet that returns v as 0/1 is lifted to 27/28 first.
 */
export function safeEcdsaSignature(
  signature: Hex,
  kind: OwnerSignatureKind
): Hex {
  if (size(signature) !== 65)
    throw new Error("Expected a 65-byte ECDSA signature");
  let v = hexToNumber(sliceHex(signature, 64, 65));
  if (v > 30) v -= 4;
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) throw new Error(`Unexpected signature v ${v}`);
  if (kind === "ETH_SIGN") v += 4;
  return concatHex([sliceHex(signature, 0, 64), toHex(v, { size: 1 })]);
}

/**
 * Execution signatures: pre-validated entries (v = 1) for on-chain approvals and the executor (if
 * an owner), and ECDSA signatures for owners who signed off chain only. One entry per owner,
 * sorted ascending, as Safe requires.
 */
export function mergedSignatures(
  state: Pick<SafeTxState, "owners" | "approvedBy">,
  offchain: OwnerSignature[],
  executor?: Address
): Hex {
  const isOwner = (a: Address) =>
    state.owners.some((o) => o.toLowerCase() === a.toLowerCase());
  const entries = new Map<string, { owner: Address; bytes: Hex }>();
  for (const s of offchain) {
    if (!isOwner(s.owner)) continue;
    entries.set(s.owner.toLowerCase(), {
      owner: s.owner,
      bytes: safeEcdsaSignature(s.signature, s.kind),
    });
  }
  const prevalidated = [...state.approvedBy];
  if (executor && isOwner(executor)) prevalidated.push(executor);
  for (const owner of prevalidated) {
    entries.set(owner.toLowerCase(), {
      owner,
      bytes: concatHex([
        pad(owner, { size: 32 }),
        pad("0x00", { size: 32 }),
        "0x01",
      ]),
    });
  }
  const sorted = [...entries.values()].sort((a, b) =>
    BigInt(a.owner) < BigInt(b.owner) ? -1 : 1
  );
  return concatHex(sorted.map((e) => e.bytes));
}

/** Approvals counted if `executor` executes now. */
export function approvalsIfExecutedBy(
  state: SafeTxState,
  executor: Address | undefined,
  /** Owners who signed off chain, e.g. through the Safe Transaction Service */
  offchainSigners: Address[] = []
): number {
  const set = new Set(state.approvedBy.map((a) => a.toLowerCase()));
  for (const signer of offchainSigners)
    if (state.owners.some((o) => o.toLowerCase() === signer.toLowerCase()))
      set.add(signer.toLowerCase());
  if (
    executor &&
    state.owners.some((o) => o.toLowerCase() === executor.toLowerCase())
  )
    set.add(executor.toLowerCase());
  return set.size;
}
