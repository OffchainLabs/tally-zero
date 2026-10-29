import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  parseAbiParameters,
  zeroHash,
} from "viem";
import { describe, expect, it } from "vitest";

import { ADDRESSES } from "@gzeoneth/gov-tracker";

import {
  arbSysAbi,
  coreGovernorRowsFromStoredActions,
  coreGovernorSalt,
  decodeCoreGovernorPayload,
  encodeCoreGovernorPayload,
  l1TimelockAbi,
} from "./core-governor-payload";
import { GLAMSTERDAM_PROPOSAL } from "./core-governor-payload.fixtures";
import { computeProposalId, type ProposalAction } from "./propose-utils";

const L1_UPGRADE_EXECUTOR = "0x3ffFbAdAF827559da092217e474760E2b2c3CeDd";
const ARB1_UPGRADE_EXECUTOR = "0xCF57572261c7c2BCF21ffD220ea7d1a27D40A827";
const NOVA_UPGRADE_EXECUTOR = "0x86a02dD71363c440b21F4c0E5B2Ad01Ffe1A7482";

/** `sendTxToL1(L1 timelock, scheduleBatch(...))` with the given batch fields. */
function timelockBatch(
  overrides: Partial<{
    targets: `0x${string}`[];
    payloads: `0x${string}`[];
    predecessor: `0x${string}`;
    delay: bigint;
  }> = {}
) {
  const targets = overrides.targets ?? [L1_UPGRADE_EXECUTOR];
  const schedule = encodeFunctionData({
    abi: l1TimelockAbi,
    functionName: "scheduleBatch",
    args: [
      targets,
      targets.map(() => BigInt(0)),
      overrides.payloads ?? ["0x1cff79cd"],
      overrides.predecessor ?? zeroHash,
      coreGovernorSalt("d"),
      overrides.delay ?? BigInt(259200),
    ],
  });
  return {
    target: ADDRESSES.ARB_SYS,
    value: "0",
    calldata: encodeFunctionData({
      abi: arbSysAbi,
      functionName: "sendTxToL1",
      args: [ADDRESSES.L1_TIMELOCK, schedule],
    }),
  };
}

function retryablePayload(gasLimit: bigint, maxFeePerGas: bigint) {
  return encodeAbiParameters(
    parseAbiParameters(
      "address inbox, address l2Target, uint256 l2Value, uint256 gasLimit, uint256 maxFeePerGas, bytes l2Calldata"
    ),
    [
      getAddress(ADDRESSES.ARB1_DELAYED_INBOX),
      ARB1_UPGRADE_EXECUTOR,
      BigInt(0),
      gasLimit,
      maxFeePerGas,
      "0xabcdef",
    ]
  );
}

const rows: ProposalAction[] = [
  {
    chain: "ethereum",
    target: L1_UPGRADE_EXECUTOR,
    value: "0",
    calldata: "0x1cff79cd",
  },
  {
    chain: "arb1",
    target: ARB1_UPGRADE_EXECUTOR,
    value: "12",
    calldata: "0xabcdef",
  },
  {
    chain: "nova",
    target: NOVA_UPGRADE_EXECUTOR,
    value: "0",
    calldata: "0x",
  },
];

describe("decodeCoreGovernorPayload", () => {
  it("reads one row per chain out of the live Glamsterdam proposal", () => {
    const decoded = decodeCoreGovernorPayload(GLAMSTERDAM_PROPOSAL);

    expect(decoded).not.toBeNull();
    expect(decoded!.map((row) => row.chain)).toEqual([
      "ethereum",
      "arb1",
      "nova",
    ]);
    expect(decoded!.map((row) => row.target)).toEqual([
      L1_UPGRADE_EXECUTOR,
      ARB1_UPGRADE_EXECUTOR,
      NOVA_UPGRADE_EXECUTOR,
    ]);
    expect(decoded!.every((row) => row.value === "0")).toBe(true);
    // UpgradeExecutor.execute(address,bytes) on every chain, kept wrapped.
    expect(decoded!.every((row) => row.calldata.startsWith("0x1cff79cd"))).toBe(
      true
    );
  });

  it("accepts the single-operation schedule() form", () => {
    const schedule = encodeFunctionData({
      abi: l1TimelockAbi,
      functionName: "schedule",
      args: [
        L1_UPGRADE_EXECUTOR,
        BigInt(7),
        "0x1234",
        zeroHash,
        coreGovernorSalt("x"),
        BigInt(259200),
      ],
    });
    const calldata = encodeFunctionData({
      abi: arbSysAbi,
      functionName: "sendTxToL1",
      args: [ADDRESSES.L1_TIMELOCK, schedule],
    });

    expect(
      decodeCoreGovernorPayload({
        target: ADDRESSES.ARB_SYS,
        value: "0",
        calldata,
      })
    ).toEqual([
      {
        chain: "ethereum",
        target: L1_UPGRADE_EXECUTOR,
        value: "7",
        calldata: "0x1234",
      },
    ]);
  });

  it("returns null for anything but the canonical route", () => {
    const routed = encodeCoreGovernorPayload({
      actions: rows,
      description: "d",
    });
    const asStored = {
      target: routed.target,
      value: routed.value.toString(),
      calldata: routed.calldata,
    };

    // A direct call, as the Treasury Governor would carry it.
    expect(
      decodeCoreGovernorPayload({
        target: L1_UPGRADE_EXECUTOR,
        value: "0",
        calldata: "0x1cff79cd",
      })
    ).toBeNull();
    // ArbSys forwards value to L1, but schedule is nonpayable.
    expect(decodeCoreGovernorPayload({ ...asStored, value: "1" })).toBeNull();
    // Not an ArbSys.sendTxToL1 call at all.
    expect(
      decodeCoreGovernorPayload({
        ...asStored,
        calldata: `0xdeadbeef${asStored.calldata.slice(10)}`,
      })
    ).toBeNull();
    // A message to something other than the L1 timelock.
    const elsewhere = encodeFunctionData({
      abi: arbSysAbi,
      functionName: "sendTxToL1",
      args: [L1_UPGRADE_EXECUTOR, "0x"],
    });
    expect(
      decodeCoreGovernorPayload({ ...asStored, calldata: elsewhere })
    ).toBeNull();
  });

  // Rows carry none of these fields, so a decoded action would re-encode to
  // different bytes and a load-then-save would silently rewrite the draft.
  it("returns null when the batch sets fields the encoder never writes", () => {
    expect(decodeCoreGovernorPayload(timelockBatch())).not.toBeNull();
    expect(
      decodeCoreGovernorPayload(
        timelockBatch({ predecessor: `0x${"11".repeat(32)}` })
      )
    ).toBeNull();
    expect(
      decodeCoreGovernorPayload(timelockBatch({ delay: BigInt(345600) }))
    ).toBeNull();

    const retryable = (gasLimit: bigint, maxFeePerGas: bigint) =>
      timelockBatch({
        targets: [getAddress(ADDRESSES.RETRYABLE_TICKET_MAGIC)],
        payloads: [retryablePayload(gasLimit, maxFeePerGas)],
      });
    expect(decodeCoreGovernorPayload(retryable(BigInt(0), BigInt(0)))).toEqual([
      {
        chain: "arb1",
        target: ARB1_UPGRADE_EXECUTOR,
        value: "0",
        calldata: "0xabcdef",
      },
    ]);
    expect(
      decodeCoreGovernorPayload(retryable(BigInt(1_000_000), BigInt(0)))
    ).toBeNull();
    expect(
      decodeCoreGovernorPayload(retryable(BigInt(0), BigInt(100_000_000)))
    ).toBeNull();
  });
});

describe("encodeCoreGovernorPayload", () => {
  it("reproduces the live Glamsterdam action byte for byte", () => {
    const decoded = decodeCoreGovernorPayload(GLAMSTERDAM_PROPOSAL)!;
    const encoded = encodeCoreGovernorPayload({
      actions: decoded,
      description: GLAMSTERDAM_PROPOSAL.description,
      salt: GLAMSTERDAM_PROPOSAL.salt,
      delay: BigInt(GLAMSTERDAM_PROPOSAL.delaySeconds),
    });

    expect(encoded.target).toBe(getAddress(GLAMSTERDAM_PROPOSAL.target));
    expect(encoded.value).toBe(BigInt(0));
    expect(encoded.calldata).toBe(GLAMSTERDAM_PROPOSAL.calldata);
    // And therefore the governor's own proposal id.
    expect(
      computeProposalId(
        [encoded.target],
        [encoded.value],
        [encoded.calldata],
        GLAMSTERDAM_PROPOSAL.description
      )
    ).toBe(GLAMSTERDAM_PROPOSAL.proposalId);
  });

  it("round-trips rows on every chain, carrying L2 value inside the ticket", () => {
    const encoded = encodeCoreGovernorPayload({
      actions: rows,
      description: "# Round trip",
    });

    expect(encoded.target).toBe(getAddress(ADDRESSES.ARB_SYS));
    expect(decodeCoreGovernorPayload(encoded)).toEqual(rows);
  });

  it("uses the default min delay and a description-derived salt", () => {
    const a = encodeCoreGovernorPayload({ actions: rows, description: "one" });
    const b = encodeCoreGovernorPayload({ actions: rows, description: "two" });
    const c = encodeCoreGovernorPayload({
      actions: rows,
      description: "one",
      salt: coreGovernorSalt("one"),
      delay: BigInt(259200),
    });

    expect(a.calldata).not.toBe(b.calldata);
    expect(a.calldata).toBe(c.calldata);
  });

  it("refuses an empty proposal and an invalid row", () => {
    expect(() =>
      encodeCoreGovernorPayload({ actions: [], description: "d" })
    ).toThrow(/at least one action/);
    expect(() =>
      encodeCoreGovernorPayload({
        actions: [{ ...rows[0], target: "nope" }],
        description: "d",
      })
    ).toThrow(/Invalid target/);
  });
});

describe("coreGovernorRowsFromStoredActions", () => {
  it("unpacks a draft this app stored", () => {
    const routed = encodeCoreGovernorPayload({
      actions: rows,
      description: "d",
    });

    expect(
      coreGovernorRowsFromStoredActions([
        {
          target: routed.target,
          value: routed.value.toString(),
          calldata: routed.calldata,
        },
      ])
    ).toEqual({ kind: "rows", rows });
  });

  it("restores an actionless draft as no rows", () => {
    expect(coreGovernorRowsFromStoredActions([])).toEqual({
      kind: "rows",
      rows: [],
    });
  });

  // Guessing a chain for these would route them through the L1 timelock on
  // the next save, so the stored bytes would no longer be what gets submitted.
  it("does not guess at rows it did not write", () => {
    const elsewhere = encodeFunctionData({
      abi: arbSysAbi,
      functionName: "sendTxToL1",
      args: [L1_UPGRADE_EXECUTOR, "0x1cff79cd"],
    });
    expect(
      coreGovernorRowsFromStoredActions([
        { target: ADDRESSES.ARB_SYS, value: "0", calldata: elsewhere },
      ])
    ).toEqual({ kind: "unrecognised" });

    expect(
      coreGovernorRowsFromStoredActions([
        { target: L1_UPGRADE_EXECUTOR, value: "1", calldata: "0x" },
        { target: ARB1_UPGRADE_EXECUTOR, value: "2", calldata: "0x" },
      ])
    ).toEqual({ kind: "unrecognised" });
  });
});
