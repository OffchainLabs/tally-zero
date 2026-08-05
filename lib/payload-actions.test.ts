import { ADDRESSES } from "@gzeoneth/gov-tracker";
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";

import {
  canFlattenGovernancePayload,
  normalizePayloadActions,
} from "./payload-actions";

const arbSysAbi = parseAbi([
  "function sendTxToL1(address destination, bytes data) payable returns (uint256)",
]);
const timelockAbi = parseAbi([
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
]);
const executorAbi = parseAbi([
  "function execute(address target, bytes data) payable",
  "function executeCall(address target, bytes data) payable",
]);
const actionAbi = parseAbi(["function perform(uint256 newValue)"]);

const ZERO_HASH = `0x${"00".repeat(32)}` as Hex;
const L1_EXECUTOR = "0x3ffFbAdAF827559da092217e474760E2b2c3CeDd" as Address;
const ARB1_EXECUTOR = "0xCF57572261c7c2BCF21ffD220ea7d1a27D40A827" as Address;
const NOVA_EXECUTOR = "0x86a02dD71363c440b21F4c0E5B2Ad01Ffe1A7482" as Address;
const L1_ACTION = "0x4444444444444444444444444444444444444444" as Address;
const ARB1_ACTION = "0x5555555555555555555555555555555555555555" as Address;
const NOVA_ACTION = "0x6666666666666666666666666666666666666666" as Address;

function executorCall(
  target: Address,
  newValue: bigint,
  functionName: "execute" | "executeCall" = "execute"
): Hex {
  return encodeFunctionData({
    abi: executorAbi,
    functionName,
    args: [
      target,
      encodeFunctionData({
        abi: actionAbi,
        functionName: "perform",
        args: [newValue],
      }),
    ],
  });
}

function retryableCall(
  inbox: Address,
  executor: Address,
  calldata: Hex,
  value = BigInt(0)
): Hex {
  return encodeAbiParameters(
    parseAbiParameters(
      "address inbox, address l2Target, uint256 l2Value, uint256 gasLimit, uint256 maxFeePerGas, bytes l2Calldata"
    ),
    [inbox, executor, value, BigInt(0), BigInt(0), calldata]
  );
}

function arbSysCall(l1TimelockCalldata: Hex): Hex {
  return encodeFunctionData({
    abi: arbSysAbi,
    functionName: "sendTxToL1",
    args: [ADDRESSES.L1_TIMELOCK, l1TimelockCalldata],
  });
}

describe("normalizePayloadActions", () => {
  it("flattens a mixed L1, Arbitrum One, and Nova timelock batch", () => {
    const l1ExecutorCall = executorCall(L1_ACTION, BigInt(1), "executeCall");
    const arb1ExecutorCall = executorCall(ARB1_ACTION, BigInt(2));
    const novaExecutorCall = executorCall(
      NOVA_ACTION,
      BigInt(3),
      "executeCall"
    );
    const scheduleBatch = encodeFunctionData({
      abi: timelockAbi,
      functionName: "scheduleBatch",
      args: [
        [
          L1_EXECUTOR,
          ADDRESSES.RETRYABLE_TICKET_MAGIC,
          ADDRESSES.RETRYABLE_TICKET_MAGIC,
        ],
        [BigInt(7), BigInt(0), BigInt(0)],
        [
          l1ExecutorCall,
          retryableCall(
            ADDRESSES.ARB1_DELAYED_INBOX,
            ARB1_EXECUTOR,
            arb1ExecutorCall,
            BigInt(8)
          ),
          retryableCall(
            ADDRESSES.NOVA_DELAYED_INBOX,
            NOVA_EXECUTOR,
            novaExecutorCall,
            BigInt(9)
          ),
        ],
        ZERO_HASH,
        ZERO_HASH,
        BigInt(259_200),
      ],
    });

    const [group] = normalizePayloadActions({
      targets: [ADDRESSES.ARB_SYS],
      values: ["0"],
      calldatas: [arbSysCall(scheduleBatch)],
    });

    expect(group.isCanonicalRoute).toBe(true);
    expect(group.routeChains).toEqual(["ethereum", "arb1", "nova"]);
    expect(group.actions).toMatchObject([
      {
        target: L1_ACTION,
        actionType: "call",
        value: "7",
        chain: "ethereum",
      },
      {
        target: ARB1_ACTION,
        actionType: "delegatecall",
        value: "8",
        chain: "arb1",
      },
      {
        target: NOVA_ACTION,
        actionType: "call",
        value: "9",
        chain: "nova",
      },
    ]);
    expect(group.actions.map((action) => action.calldata)).toEqual(
      [BigInt(1), BigInt(2), BigInt(3)].map((newValue) =>
        encodeFunctionData({
          abi: actionAbi,
          functionName: "perform",
          args: [newValue],
        })
      )
    );
    expect(group.actions.map((action) => action.simulation.type)).toEqual([
      "call",
      "retryable",
      "retryable",
    ]);
    expect(group.actions[0].simulation).toMatchObject({
      type: "call",
      calldata: l1ExecutorCall,
    });
    expect(group.actions[2].simulation).toMatchObject({
      type: "retryable",
      l2Calldata: novaExecutorCall,
    });
  });

  it("flattens a single schedule and stops safely before a non-executor call", () => {
    const directCalldata = encodeFunctionData({
      abi: actionAbi,
      functionName: "perform",
      args: [BigInt(42)],
    });
    const schedule = encodeFunctionData({
      abi: timelockAbi,
      functionName: "schedule",
      args: [
        L1_ACTION,
        BigInt(5),
        directCalldata,
        ZERO_HASH,
        ZERO_HASH,
        BigInt(259_200),
      ],
    });

    const [group] = normalizePayloadActions({
      targets: [ADDRESSES.ARB_SYS],
      values: ["0"],
      calldatas: [arbSysCall(schedule)],
    });

    expect(group.actions).toMatchObject([
      {
        target: L1_ACTION,
        actionType: "call",
        value: "5",
        calldata: directCalldata,
        chain: "ethereum",
      },
    ]);
  });

  it("keeps noncanonical and malformed routes unchanged", () => {
    const groups = normalizePayloadActions({
      targets: [L1_ACTION, ADDRESSES.ARB_SYS],
      values: ["1", "0"],
      calldatas: ["0x12345678", "0x928c169a"],
    });

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => !group.isCanonicalRoute)).toBe(true);
    expect(groups.every((group) => group.actions.length === 0)).toBe(true);
  });

  it("rejects a canonical-looking route with nonzero outer call value", () => {
    const directCalldata = executorCall(L1_ACTION, BigInt(42));
    const schedule = encodeFunctionData({
      abi: timelockAbi,
      functionName: "schedule",
      args: [
        L1_EXECUTOR,
        BigInt(0),
        directCalldata,
        ZERO_HASH,
        ZERO_HASH,
        BigInt(259_200),
      ],
    });

    const [group] = normalizePayloadActions({
      targets: [ADDRESSES.ARB_SYS],
      values: ["1"],
      calldatas: [arbSysCall(schedule)],
    });

    expect(group.isCanonicalRoute).toBe(false);
  });

  it("can disable canonical normalization for non-Core proposal origins", () => {
    const directCalldata = executorCall(L1_ACTION, BigInt(42));
    const schedule = encodeFunctionData({
      abi: timelockAbi,
      functionName: "schedule",
      args: [
        L1_EXECUTOR,
        BigInt(0),
        directCalldata,
        ZERO_HASH,
        ZERO_HASH,
        BigInt(259_200),
      ],
    });

    const [group] = normalizePayloadActions({
      targets: [ADDRESSES.ARB_SYS],
      values: ["0"],
      calldatas: [arbSysCall(schedule)],
      allowCanonicalRoutes: false,
    });

    expect(group.isCanonicalRoute).toBe(false);
  });

  it("only enables flattening for the Core Governor", () => {
    expect(canFlattenGovernancePayload(ADDRESSES.CONSTITUTIONAL_GOVERNOR)).toBe(
      true
    );
    expect(
      canFlattenGovernancePayload(ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR)
    ).toBe(false);
    expect(
      canFlattenGovernancePayload("0x1111111111111111111111111111111111111111")
    ).toBe(false);
    expect(canFlattenGovernancePayload(undefined)).toBe(false);
  });
});
