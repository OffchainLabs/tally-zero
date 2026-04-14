/**
 * Helpers for building `propose()` transactions against OpenZeppelin Governor.
 *
 * Covers:
 * - Row-level validation (address, value, calldata)
 * - Computing the OZ Governor `hashProposal` id off-chain so we can link
 *   to the standalone proposal page after a successful submission
 */

import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  stringToBytes,
  toHex,
} from "viem";

import { ETH_ADDRESS_REGEX } from "@/lib/address-utils";

export interface ProposalAction {
  target: string;
  value: string;
  calldata: string;
}

export interface ProposalActionError {
  target?: string;
  value?: string;
  calldata?: string;
}

export function emptyAction(): ProposalAction {
  return { target: "", value: "0", calldata: "0x" };
}

export function validateAction(action: ProposalAction): ProposalActionError {
  const errors: ProposalActionError = {};

  if (!action.target || !ETH_ADDRESS_REGEX.test(action.target)) {
    errors.target = "Target must be a valid 0x address";
  }

  const rawValue = (action.value ?? "").trim();
  if (rawValue === "") {
    errors.value = "Value is required (use 0 for no ETH)";
  } else {
    try {
      const parsed = BigInt(rawValue);
      if (parsed < BigInt(0)) {
        errors.value = "Value cannot be negative";
      }
    } catch {
      errors.value = "Value must be a non-negative integer (wei)";
    }
  }

  const calldata = (action.calldata ?? "").trim();
  if (calldata === "" || calldata === "0x") {
    // Empty calldata is allowed — represents a plain ETH transfer
  } else if (!isHex(calldata)) {
    errors.calldata = "Calldata must be 0x-prefixed hex";
  } else if (calldata.length % 2 !== 0) {
    errors.calldata = "Calldata must have an even number of hex digits";
  }

  return errors;
}

export function hasActionErrors(errors: ProposalActionError): boolean {
  return Object.values(errors).some((e) => !!e);
}

export interface NormalizedActions {
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
}

/**
 * Convert free-form rows into the types expected by `propose()`.
 * Throws if any row is invalid — call {@link validateAction} first.
 */
export function normalizeActions(actions: ProposalAction[]): NormalizedActions {
  const targets: `0x${string}`[] = [];
  const values: bigint[] = [];
  const calldatas: `0x${string}`[] = [];

  for (const action of actions) {
    if (!isAddress(action.target)) {
      throw new Error(`Invalid target address: ${action.target}`);
    }
    targets.push(getAddress(action.target));

    const rawValue = (action.value ?? "0").trim() || "0";
    values.push(BigInt(rawValue));

    const raw = (action.calldata ?? "").trim();
    const calldata = raw === "" ? "0x" : raw;
    if (!isHex(calldata)) {
      throw new Error(`Invalid calldata: ${calldata}`);
    }
    calldatas.push(calldata as `0x${string}`);
  }

  return { targets, values, calldatas };
}

/**
 * Deterministic proposal id used by OpenZeppelin Governor:
 *   keccak256(abi.encode(targets, values, calldatas, keccak256(description)))
 *
 * Returned as a decimal string to match how the rest of the app represents
 * `proposalId` (storage keys, URLs).
 */
export function computeProposalId(
  targets: readonly `0x${string}`[],
  values: readonly bigint[],
  calldatas: readonly `0x${string}`[],
  description: string
): string {
  const descriptionHash = keccak256(toHex(stringToBytes(description)));
  const encoded = encodeAbiParameters(
    [
      { type: "address[]" },
      { type: "uint256[]" },
      { type: "bytes[]" },
      { type: "bytes32" },
    ],
    [
      targets as `0x${string}`[],
      values as bigint[],
      calldatas as `0x${string}`[],
      descriptionHash,
    ]
  );
  return BigInt(keccak256(encoded)).toString(10);
}
