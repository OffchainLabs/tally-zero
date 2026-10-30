/**
 * Executing a ready timelock operation from its scheduled calls: which entry
 * point produced its id (`execute` or `executeBatch`), the calldata, and the
 * ETH the execution needs.
 */

import {
  ADDRESSES,
  hashOperation,
  hashOperationBatch,
  prepareTimelockBatchCalldata,
  prepareTimelockExecuteCalldata,
} from "@gzeoneth/gov-tracker";
import { BigNumber } from "ethers";
import {
  type Address,
  decodeAbiParameters,
  type Hex,
  isAddressEqual,
  parseAbi,
  parseAbiParameters,
  size,
} from "viem";

export interface TimelockCall {
  target: string;
  /** Decimal string */
  value: string;
  data: string;
}

/** One scheduled timelock operation, as the execute button takes it */
export interface TimelockExecution {
  operationId: string;
  timelockAddress: string;
  calls: TimelockCall[];
  predecessor: string;
  /** Known salt; checked against the operation id before it is used */
  salt?: string | null;
  /** The timelock's chain; the wallet is switched to it before sending */
  chainId?: number;
}

export type TimelockEntryPoint = "execute" | "executeBatch";

export const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

function batchParams(execution: TimelockExecution, salt: string) {
  return {
    targets: execution.calls.map((c) => c.target),
    values: execution.calls.map((c) => BigNumber.from(c.value)),
    payloads: execution.calls.map((c) => c.data),
    predecessor: execution.predecessor,
    salt,
  };
}

function singleParams(execution: TimelockExecution, salt: string) {
  const [call] = execution.calls;
  return {
    target: call.target,
    value: BigNumber.from(call.value),
    data: call.data,
    predecessor: execution.predecessor,
    salt,
  };
}

/** The id each entry point would schedule these calls under */
export function computeOperationIds(
  execution: TimelockExecution,
  salt: string
): { execute: string | null; executeBatch: string } {
  return {
    execute:
      execution.calls.length === 1
        ? hashOperation(singleParams(execution, salt))
        : null,
    executeBatch: hashOperationBatch(batchParams(execution, salt)),
  };
}

/**
 * Which entry point these calls and salt hash to the operation id under, or
 * null when the salt is wrong. One call may have been scheduled either way: a
 * governor queues even a single call with `scheduleBatch`.
 */
export function matchEntryPoint(
  execution: TimelockExecution,
  salt: string
): TimelockEntryPoint | null {
  if (execution.calls.length === 0) return null;
  const ids = computeOperationIds(execution, salt);
  const expected = execution.operationId.toLowerCase();
  if (ids.execute?.toLowerCase() === expected) return "execute";
  if (ids.executeBatch.toLowerCase() === expected) return "executeBatch";
  return null;
}

/** The known salt if it matches, else the zero salt most operations use */
export function findKnownSalt(
  execution: TimelockExecution
): { salt: string; entryPoint: TimelockEntryPoint } | null {
  for (const salt of [execution.salt, ZERO_BYTES32]) {
    if (!salt) continue;
    const entryPoint = matchEntryPoint(execution, salt);
    if (entryPoint) return { salt, entryPoint };
  }
  return null;
}

/** The execute transaction's target and calldata */
export function encodeTimelockExecution(
  execution: TimelockExecution,
  salt: string,
  entryPoint: TimelockEntryPoint
): { to: Address; data: Hex } {
  const prepared =
    entryPoint === "execute"
      ? prepareTimelockExecuteCalldata(
          execution.timelockAddress,
          singleParams(execution, salt),
          execution.operationId
        )
      : prepareTimelockBatchCalldata(
          execution.timelockAddress,
          batchParams(execution, salt),
          execution.operationId
        );
  return { to: prepared.to as Address, data: prepared.data as Hex };
}

function isRetryableCall(call: TimelockCall): boolean {
  return isAddressEqual(
    call.target as Address,
    ADDRESSES.RETRYABLE_TICKET_MAGIC as Address
  );
}

/** Whether a call creates a retryable, so its ETH is priced at execution */
export function hasRetryableCalls(execution: TimelockExecution): boolean {
  return execution.calls.some(isRetryableCall);
}

const INBOX_ABI = parseAbi([
  "function calculateRetryableSubmissionFee(uint256 dataLength, uint256 baseFee) view returns (uint256)",
]);

const RETRYABLE_PARAMS = parseAbiParameters(
  "address inbox, address l2Target, uint256 l2Value, uint256 gasLimit, uint256 maxFeePerGas, bytes data"
);

/** The reads `timelockExecutionValue` makes; a viem public client fits */
export interface ExecutionValueClient {
  getGasPrice(): Promise<bigint>;
  readContract(args: {
    address: Address;
    abi: typeof INBOX_ABI;
    functionName: "calculateRetryableSubmissionFee";
    args: readonly [bigint, bigint];
  }): Promise<bigint>;
}

/**
 * The ETH an execution sends. A call to the L1 timelock's retryable magic
 * address pays its ticket from the execution's value: twice the submission fee
 * at today's gas price, the L2 gas, and the L2 call value, as gov-tracker's
 * `calculateRetryableExecutionValue` prices it. Other calls send their
 * scheduled value.
 */
export async function timelockExecutionValue(
  execution: TimelockExecution,
  client: ExecutionValueClient
): Promise<bigint> {
  const sumScheduled = () =>
    execution.calls.reduce((total, c) => total + BigInt(c.value), BigInt(0));
  if (!hasRetryableCalls(execution)) return sumScheduled();

  const gasPrice = await client.getGasPrice();
  const values = await Promise.all(
    execution.calls.map(async (call) => {
      if (!isRetryableCall(call)) return BigInt(call.value);
      const [inbox, , l2Value, gasLimit, maxFeePerGas, data] =
        decodeAbiParameters(RETRYABLE_PARAMS, call.data as Hex);
      const submissionFee = await client.readContract({
        address: inbox,
        abi: INBOX_ABI,
        functionName: "calculateRetryableSubmissionFee",
        args: [BigInt(size(data)), gasPrice],
      });
      return submissionFee * BigInt(2) + gasLimit * maxFeePerGas + l2Value;
    })
  );
  return values.reduce((total, v) => total + v, BigInt(0));
}
