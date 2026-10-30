/**
 * The Core Governor's execution route, in both directions.
 *
 * A constitutional proposal does not run its actions from the L2 Core Timelock.
 * The governor proposal holds exactly one action, a call to ArbSys that sends
 * a message to the L1 timelock; the message schedules one L1 timelock operation
 * per action. An operation either executes on Ethereum as given, or targets
 * the timelock's RETRYABLE_TICKET_MAGIC address with a payload the timelock
 * turns into a retryable ticket for Arbitrum One or Nova.
 *
 * The shape here matches OffchainLabs/governance `proposalCreator.ts` and was
 * checked against live proposals (the Glamsterdam L1-pricing AIP, the ArbOS 61
 * Elara upgrade):
 *
 *   propose([ArbSys], [0], [sendTxToL1(L1_TIMELOCK, scheduleBatch(
 *     targets, values, payloads, predecessor = 0, salt, delay = minDelay))])
 *
 *   Ethereum action      -> (target, value, calldata)
 *   Arbitrum One / Nova  -> (RETRYABLE_TICKET_MAGIC, 0,
 *                            abi.encode(inbox, target, value, 0, 0, calldata))
 *
 * `lib/payload-actions.ts` decodes the same route for display, accepting any
 * batch and unwrapping UpgradeExecutor calls. The decoder here accepts only
 * what the encoder writes, so that decode -> encode reproduces the bytes a
 * draft was saved with.
 */

import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  stringToBytes,
  toHex,
  zeroHash,
} from "viem";

import { L1_TIMELOCK } from "@/config/arbitrum-governance";
import { addressesEqual } from "@/lib/address-utils";
import {
  normalizeActions,
  type ActionChain,
  type ProposalAction,
} from "@/lib/propose-utils";
import { ADDRESSES, decodeRetryableTicket } from "@gzeoneth/gov-tracker";

export const arbSysAbi = parseAbi([
  "function sendTxToL1(address destination, bytes data) payable returns (uint256)",
]);

export const l1TimelockAbi = parseAbi([
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
]);

const retryableTicketParams = [
  { type: "address", name: "inbox" },
  { type: "address", name: "l2Target" },
  { type: "uint256", name: "l2Value" },
  { type: "uint256", name: "gasLimit" },
  { type: "uint256", name: "maxFeePerGas" },
  { type: "bytes", name: "l2Calldata" },
] as const;

/** L1 delayed inbox for each L2 the timelock can forward to. */
const INBOX_BY_CHAIN: Record<Exclude<ActionChain, "ethereum">, string> = {
  arb1: ADDRESSES.ARB1_DELAYED_INBOX,
  nova: ADDRESSES.NOVA_DELAYED_INBOX,
};

/**
 * Ticket gas parameters in the scheduled payload. Zero means the retryable is
 * created without an auto-redeem attempt and someone redeems it by hand, which
 * is how every DAO proposal to date has been submitted. The L1 executor pays
 * the submission fee from `msg.value` either way.
 */
const RETRYABLE_GAS_LIMIT = BigInt(0);
const RETRYABLE_MAX_FEE_PER_GAS = BigInt(0);

export const L1_TIMELOCK_MIN_DELAY_SECONDS = BigInt(
  L1_TIMELOCK.minDelaySeconds
);

/** The one action a Core Governor proposal is submitted with. */
export interface EncodedCoreGovernorAction {
  target: `0x${string}`;
  value: bigint;
  calldata: `0x${string}`;
}

/**
 * Salt for the L1 timelock operation, so repeated submissions of the same
 * calls do not collide on the operation id. Same convention as the official
 * proposal creator.
 */
export function coreGovernorSalt(description: string): `0x${string}` {
  return keccak256(toHex(stringToBytes(description)));
}

/**
 * Wrap per-chain rows into the single ArbSys action the Core Governor expects.
 * Throws on an invalid row; validate first with `validateAction`.
 *
 * @param delay - Seconds the L1 timelock holds the operations. Must be at
 *   least the timelock's `getMinDelay()` or the L1 schedule reverts after the
 *   vote has already passed.
 * @param salt - L1 operation salt. Defaults to `coreGovernorSalt(description)`;
 *   only tests that reproduce a live proposal byte for byte pass their own.
 */
export function encodeCoreGovernorPayload({
  actions,
  description,
  delay = L1_TIMELOCK_MIN_DELAY_SECONDS,
  salt = coreGovernorSalt(description),
}: {
  actions: ProposalAction[];
  description: string;
  delay?: bigint;
  salt?: `0x${string}`;
}): EncodedCoreGovernorAction {
  if (actions.length === 0) {
    throw new Error("A Core Governor proposal needs at least one action");
  }
  const { targets, values, calldatas } = normalizeActions(actions);

  const l1Targets: `0x${string}`[] = [];
  const l1Values: bigint[] = [];
  const l1Payloads: `0x${string}`[] = [];

  actions.forEach((action, index) => {
    if (action.chain === "ethereum") {
      l1Targets.push(targets[index]);
      l1Values.push(values[index]);
      l1Payloads.push(calldatas[index]);
      return;
    }

    l1Targets.push(getAddress(ADDRESSES.RETRYABLE_TICKET_MAGIC));
    // L1ArbitrumTimelock ignores the operation value for retryables; the L2
    // call value travels inside the payload and is funded at execution.
    l1Values.push(BigInt(0));
    l1Payloads.push(
      encodeAbiParameters(retryableTicketParams, [
        getAddress(INBOX_BY_CHAIN[action.chain]),
        targets[index],
        values[index],
        RETRYABLE_GAS_LIMIT,
        RETRYABLE_MAX_FEE_PER_GAS,
        calldatas[index],
      ])
    );
  });

  const scheduleCalldata = encodeFunctionData({
    abi: l1TimelockAbi,
    functionName: "scheduleBatch",
    args: [l1Targets, l1Values, l1Payloads, zeroHash, salt, delay],
  });

  return {
    target: getAddress(ADDRESSES.ARB_SYS),
    value: BigInt(0),
    calldata: encodeFunctionData({
      abi: arbSysAbi,
      functionName: "sendTxToL1",
      args: [getAddress(L1_TIMELOCK.address), scheduleCalldata],
    }),
  };
}

export interface ScheduledOperation {
  target: string;
  value: bigint;
  payload: `0x${string}`;
}

/** One L1 timelock `schedule` or `scheduleBatch` call, as decoded. */
export interface ScheduledBatch {
  operations: ScheduledOperation[];
  predecessor: `0x${string}`;
  salt: `0x${string}`;
  delay: bigint;
}

/**
 * The operations an L1 timelock call schedules, or null when the bytes are
 * not a `schedule`/`scheduleBatch` call or the batch is empty or ragged.
 * Shared with `lib/payload-actions.ts`, which displays any batch; the checks
 * that make a batch canonical live in `decodeCoreGovernorPayload`.
 */
export function decodeScheduledOperations(
  calldata: string
): ScheduledBatch | null {
  try {
    const decoded = decodeFunctionData({
      abi: l1TimelockAbi,
      data: calldata as `0x${string}`,
    });

    if (decoded.functionName === "schedule") {
      const [target, value, payload, predecessor, salt, delay] = decoded.args;
      return {
        operations: [{ target, value, payload }],
        predecessor,
        salt,
        delay,
      };
    }

    const [targets, values, payloads, predecessor, salt, delay] = decoded.args;
    if (
      targets.length === 0 ||
      targets.length !== values.length ||
      targets.length !== payloads.length
    ) {
      return null;
    }
    return {
      operations: targets.map((target, index) => ({
        target,
        value: values[index],
        payload: payloads[index],
      })),
      predecessor,
      salt,
      delay,
    };
  } catch {
    return null;
  }
}

function decodeScheduledOperation(
  operation: ScheduledOperation
): ProposalAction | null {
  if (!addressesEqual(operation.target, ADDRESSES.RETRYABLE_TICKET_MAGIC)) {
    return {
      chain: "ethereum",
      target: getAddress(operation.target),
      value: operation.value.toString(),
      calldata: operation.payload,
    };
  }

  const retryable = decodeRetryableTicket(operation.payload);
  if (!retryable || retryable.chain === "unknown") return null;
  if (
    BigInt(retryable.gasLimit) !== RETRYABLE_GAS_LIMIT ||
    BigInt(retryable.maxFeePerGas) !== RETRYABLE_MAX_FEE_PER_GAS
  ) {
    return null;
  }

  return {
    chain: retryable.chain,
    target: getAddress(retryable.l2Target),
    value: retryable.l2Value,
    calldata: retryable.l2Calldata as `0x${string}`,
  };
}

/**
 * The per-chain rows behind one ArbSys action, or null when the action is not
 * the route `encodeCoreGovernorPayload` writes: another target, a non-zero
 * outer value, a message to something other than the L1 timelock, a non-zero
 * predecessor, a delay other than the timelock minimum, non-zero retryable
 * gas parameters, an inbox we do not know, or bytes that do not decode.
 *
 * Rejecting those is what keeps the round trip exact: a decoded action
 * re-encodes to the same bytes, because every field the rows do not carry is
 * known to hold the value the encoder writes. The salt is the one exception,
 * since live proposals use their own; re-encoding one needs the salt passed in.
 */
export function decodeCoreGovernorPayload(action: {
  target: string;
  value: string | bigint;
  calldata: string;
}): ProposalAction[] | null {
  if (!addressesEqual(action.target, ADDRESSES.ARB_SYS)) return null;

  try {
    if (BigInt(action.value) !== BigInt(0)) return null;

    const { args } = decodeFunctionData({
      abi: arbSysAbi,
      data: action.calldata as `0x${string}`,
    });
    const [destination, scheduleCalldata] = args;
    if (!addressesEqual(destination, L1_TIMELOCK.address)) return null;

    const scheduled = decodeScheduledOperations(scheduleCalldata);
    if (!scheduled) return null;
    if (
      scheduled.predecessor !== zeroHash ||
      scheduled.delay !== L1_TIMELOCK_MIN_DELAY_SECONDS
    ) {
      return null;
    }

    const rows = scheduled.operations.map(decodeScheduledOperation);
    if (rows.some((row) => row === null)) return null;
    return rows as ProposalAction[];
  } catch {
    return null;
  }
}

/**
 * Rows behind a stored Core Governor draft. A draft saved by this app holds
 * one encoded action, or none; anything else (an older draft saved with raw
 * rows, or a hand-written action) is unrecognised, and the caller decides how
 * to present it. Nothing is guessed, because a guessed row would be routed
 * through the L1 timelock on the next save and no longer match the draft.
 */
export type CoreGovernorStoredRows =
  | { kind: "rows"; rows: ProposalAction[] }
  | { kind: "unrecognised" };

export function coreGovernorRowsFromStoredActions(
  actions: { target: string; value: string; calldata: string }[]
): CoreGovernorStoredRows {
  if (actions.length === 0) return { kind: "rows", rows: [] };
  const rows =
    actions.length === 1 ? decodeCoreGovernorPayload(actions[0]) : null;
  return rows ? { kind: "rows", rows } : { kind: "unrecognised" };
}
