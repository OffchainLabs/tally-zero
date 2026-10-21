// A Safe's own multi-owner path for one call: build the Safe transaction, collect owner approvals
// on chain (approveHash), and execute once the threshold is met with pre-validated signatures.
// Works with any owner wallet and no off-chain service.

import {
  type Address,
  concatHex,
  type Hex,
  pad,
  parseAbi,
  type PublicClient,
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

/** Approvals counted if `executor` executes now. */
export function approvalsIfExecutedBy(
  state: SafeTxState,
  executor: Address | undefined
): number {
  const set = new Set(state.approvedBy.map((a) => a.toLowerCase()));
  if (
    executor &&
    state.owners.some((o) => o.toLowerCase() === executor.toLowerCase())
  )
    set.add(executor.toLowerCase());
  return set.size;
}
