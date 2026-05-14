import { describe, expect, it } from "vitest";

import {
  createBlockRanges,
  decodeActiveDelegators,
  decodeDelegatorBalances,
  myDelegatorsQueryKey,
  shouldSplitLogRangeError,
  sortDelegatorRecords,
  type BalanceMulticallResult,
  type DelegatesMulticallResult,
} from "./use-my-delegators";

const DELEGATE_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_DELEGATE = "0x2222222222222222222222222222222222222222";
const DELEGATOR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DELEGATOR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DELEGATOR_C = "0xcccccccccccccccccccccccccccccccccccccccc";

describe("myDelegatorsQueryKey", () => {
  it("normalizes delegate addresses", () => {
    expect(
      myDelegatorsQueryKey("0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa", "rpc")
    ).toEqual([
      "my-delegators",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rpc",
    ]);
  });
});

describe("createBlockRanges", () => {
  it("splits ranges using the normalized maximum chunk size", () => {
    expect(createBlockRanges(1, 25_000_000, 20_000_000)).toEqual([
      { from: 1, to: 10_000_000 },
      { from: 10_000_001, to: 20_000_000 },
      { from: 20_000_001, to: 25_000_000 },
    ]);
  });

  it("returns no ranges when the start is after the end", () => {
    expect(createBlockRanges(20, 10, 1_000_000)).toEqual([]);
  });
});

describe("decodeActiveDelegators", () => {
  it("keeps only successful records still delegated to the target", () => {
    const delegateResults: DelegatesMulticallResult[] = [
      { status: "success", result: DELEGATE_ADDRESS },
      { status: "success", result: OTHER_DELEGATE },
      { status: "failure", error: new Error("call reverted") },
    ];

    const activeDelegators = decodeActiveDelegators({
      delegatorList: [DELEGATOR_A, DELEGATOR_B, DELEGATOR_C],
      delegateResults,
      delegateAddress: DELEGATE_ADDRESS.toUpperCase(),
    });

    expect(activeDelegators).toEqual([DELEGATOR_A]);
  });
});

describe("decodeDelegatorBalances", () => {
  it("decodes successful balances and sorts descending by balance", () => {
    const balanceResults: BalanceMulticallResult[] = [
      { status: "success", result: BigInt(10) },
      { status: "success", result: BigInt(100) },
      { status: "success", result: BigInt(100) },
    ];

    const records = decodeDelegatorBalances({
      activeDelegators: [DELEGATOR_C, DELEGATOR_A, DELEGATOR_B],
      balanceResults,
    });

    expect(records).toEqual([
      { address: DELEGATOR_A, balance: "100" },
      { address: DELEGATOR_B, balance: "100" },
      { address: DELEGATOR_C, balance: "10" },
    ]);
  });
});

describe("sortDelegatorRecords", () => {
  it("does not mutate the input array", () => {
    const records = [
      { address: DELEGATOR_C, balance: "1" },
      { address: DELEGATOR_A, balance: "2" },
    ];

    expect(sortDelegatorRecords(records)).toEqual([
      { address: DELEGATOR_A, balance: "2" },
      { address: DELEGATOR_C, balance: "1" },
    ]);
    expect(records).toEqual([
      { address: DELEGATOR_C, balance: "1" },
      { address: DELEGATOR_A, balance: "2" },
    ]);
  });
});

describe("shouldSplitLogRangeError", () => {
  it("treats public RPC internal server getLogs failures as splittable", () => {
    expect(
      shouldSplitLogRangeError(
        new Error(
          'processing response error (body="{\\"error\\":{\\"code\\":-32000,\\"message\\":\\"internal server errror\\"}}", code=SERVER_ERROR)'
        )
      )
    ).toBe(true);
  });

  it("treats JSON-RPC -32000 server errors as splittable", () => {
    expect(shouldSplitLogRangeError({ code: -32000 })).toBe(true);
    expect(shouldSplitLogRangeError({ error: { code: -32000 } })).toBe(true);
  });

  it("does not split unrelated errors", () => {
    expect(shouldSplitLogRangeError(new Error("invalid address"))).toBe(false);
  });
});
