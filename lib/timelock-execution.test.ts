import {
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type Hex,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  encodeTimelockExecution,
  findKnownSalt,
  matchEntryPoint,
  timelockExecutionValue,
  ZERO_BYTES32,
  type ExecutionValueClient,
  type TimelockExecution,
} from "./timelock-execution";

const TIMELOCK = "0x0000000000000000000000000000000000000Ae1";
const TARGET = getAddress("0x00000000000000000000000000000000000000a1");
const OTHER = getAddress("0x00000000000000000000000000000000000000b2");
const MAGIC = "0xa723C008e76E379c55599D2E4d93879BeaFDa79C";
const INBOX = "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f";
const SALT = `0x${"22".repeat(32)}` as Hex;
const PREDECESSOR = ZERO_BYTES32 as Hex;

const TIMELOCK_ABI = parseAbi([
  "function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt) payable",
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) payable",
]);

// The ids as OpenZeppelin's TimelockController computes them
function singleId(target: string, value: bigint, data: Hex, salt: Hex) {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address, uint256, bytes, bytes32, bytes32"),
      [target as Hex, value, data, PREDECESSOR, salt]
    )
  );
}

function batchId(targets: string[], values: bigint[], datas: Hex[], salt: Hex) {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address[], uint256[], bytes[], bytes32, bytes32"),
      [targets as Hex[], values, datas, PREDECESSOR, salt]
    )
  );
}

function execution(
  overrides: Partial<TimelockExecution> = {}
): TimelockExecution {
  return {
    operationId: singleId(TARGET, BigInt(5), "0x1234", SALT),
    timelockAddress: TIMELOCK,
    calls: [{ target: TARGET, value: "5", data: "0x1234" }],
    predecessor: PREDECESSOR,
    salt: SALT,
    ...overrides,
  };
}

describe("matchEntryPoint", () => {
  it("recognizes a single call scheduled with schedule", () => {
    expect(matchEntryPoint(execution(), SALT)).toBe("execute");
  });

  it("recognizes a single call a governor scheduled as a batch", () => {
    const op = execution({
      operationId: batchId([TARGET], [BigInt(5)], ["0x1234"], SALT),
    });
    expect(matchEntryPoint(op, SALT)).toBe("executeBatch");
  });

  it("recognizes a batch", () => {
    const op = execution({
      operationId: batchId(
        [TARGET, OTHER],
        [BigInt(5), BigInt(0)],
        ["0x1234", "0x"],
        SALT
      ),
      calls: [
        { target: TARGET, value: "5", data: "0x1234" },
        { target: OTHER, value: "0", data: "0x" },
      ],
    });
    expect(matchEntryPoint(op, SALT)).toBe("executeBatch");
  });

  it("rejects the wrong salt", () => {
    expect(matchEntryPoint(execution(), ZERO_BYTES32)).toBeNull();
  });
});

describe("findKnownSalt", () => {
  it("uses the known salt when it matches", () => {
    expect(findKnownSalt(execution())).toEqual({
      salt: SALT,
      entryPoint: "execute",
    });
  });

  it("falls back to the zero salt", () => {
    const op = execution({
      operationId: singleId(TARGET, BigInt(5), "0x1234", ZERO_BYTES32 as Hex),
      salt: SALT,
    });
    expect(findKnownSalt(op)?.salt).toBe(ZERO_BYTES32);
    expect(findKnownSalt({ ...op, salt: null })?.salt).toBe(ZERO_BYTES32);
  });

  it("finds nothing when neither salt matches", () => {
    expect(findKnownSalt(execution({ salt: null }))).toBeNull();
  });
});

describe("encodeTimelockExecution", () => {
  it("encodes execute for a single call", () => {
    const { to, data } = encodeTimelockExecution(execution(), SALT, "execute");
    expect(to.toLowerCase()).toBe(TIMELOCK.toLowerCase());
    const decoded = decodeFunctionData({ abi: TIMELOCK_ABI, data });
    expect(decoded.functionName).toBe("execute");
    expect(decoded.args).toEqual([
      TARGET,
      BigInt(5),
      "0x1234",
      PREDECESSOR,
      SALT,
    ]);
  });

  it("encodes executeBatch for a batch", () => {
    const op = execution({
      calls: [
        { target: TARGET, value: "5", data: "0x1234" },
        { target: OTHER, value: "0", data: "0x" },
      ],
    });
    const { data } = encodeTimelockExecution(op, SALT, "executeBatch");
    const decoded = decodeFunctionData({ abi: TIMELOCK_ABI, data });
    expect(decoded.functionName).toBe("executeBatch");
    expect(decoded.args).toEqual([
      [TARGET, OTHER],
      [BigInt(5), BigInt(0)],
      ["0x1234", "0x"],
      PREDECESSOR,
      SALT,
    ]);
  });
});

describe("timelockExecutionValue", () => {
  function client(fee: bigint): ExecutionValueClient & {
    readContract: ReturnType<typeof vi.fn>;
  } {
    return {
      getGasPrice: vi.fn(async () => BigInt(7)),
      readContract: vi.fn(async () => fee),
    };
  }

  it("sends the scheduled values when no call creates a retryable", async () => {
    const c = client(BigInt(0));
    const op = execution({
      calls: [
        { target: TARGET, value: "5", data: "0x" },
        { target: OTHER, value: "3", data: "0x" },
      ],
    });
    expect(await timelockExecutionValue(op, c)).toBe(BigInt(8));
    expect(c.readContract).not.toHaveBeenCalled();
  });

  it("prices a retryable call at twice the submission fee plus L2 gas and value", async () => {
    const innerData = "0xdeadbeef" as Hex;
    const retryable = encodeAbiParameters(
      parseAbiParameters("address, address, uint256, uint256, uint256, bytes"),
      [INBOX, TARGET, BigInt(11), BigInt(100), BigInt(3), innerData]
    );
    const c = client(BigInt(1000));
    const op = execution({
      calls: [
        { target: MAGIC, value: "0", data: retryable },
        { target: OTHER, value: "4", data: "0x" },
      ],
    });

    // 2 * 1000 + 100 * 3 + 11, plus the plain call's 4
    expect(await timelockExecutionValue(op, c)).toBe(BigInt(2315));
    expect(c.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: INBOX,
        functionName: "calculateRetryableSubmissionFee",
        args: [BigInt(4), BigInt(7)],
      })
    );
  });
});
