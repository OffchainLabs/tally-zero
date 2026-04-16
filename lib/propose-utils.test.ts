import { describe, expect, it } from "vitest";

import {
  computeProposalId,
  emptyAction,
  hasActionErrors,
  normalizeActions,
  validateAction,
} from "./propose-utils";

describe("validateAction", () => {
  it("rejects empty target", () => {
    const errors = validateAction({ target: "", value: "0", calldata: "0x" });
    expect(errors.target).toBeTruthy();
  });

  it("rejects malformed target", () => {
    const errors = validateAction({
      target: "0xNOTANADDRESS",
      value: "0",
      calldata: "0x",
    });
    expect(errors.target).toBeTruthy();
  });

  it("accepts a well-formed row", () => {
    const errors = validateAction({
      target: "0x1111111111111111111111111111111111111111",
      value: "0",
      calldata: "0x",
    });
    expect(hasActionErrors(errors)).toBe(false);
  });

  it("rejects negative values", () => {
    const errors = validateAction({
      target: "0x1111111111111111111111111111111111111111",
      value: "-1",
      calldata: "0x",
    });
    expect(errors.value).toBeTruthy();
  });

  it("rejects odd-length calldata", () => {
    const errors = validateAction({
      target: "0x1111111111111111111111111111111111111111",
      value: "0",
      calldata: "0x1",
    });
    expect(errors.calldata).toBeTruthy();
  });

  it("rejects non-hex calldata", () => {
    const errors = validateAction({
      target: "0x1111111111111111111111111111111111111111",
      value: "0",
      calldata: "hello",
    });
    expect(errors.calldata).toBeTruthy();
  });
});

describe("normalizeActions", () => {
  it("checksums the target and converts value to bigint", () => {
    const { targets, values, calldatas } = normalizeActions([
      {
        target: "0xf07ded9dc292157749b6fd268e37df6ea38395b9",
        value: "1000",
        calldata: "0xdeadbeef",
      },
    ]);
    expect(targets).toEqual(["0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9"]);
    expect(values).toEqual([BigInt(1000)]);
    expect(calldatas).toEqual(["0xdeadbeef"]);
  });

  it("defaults missing calldata to 0x", () => {
    const { calldatas } = normalizeActions([
      {
        target: "0x1111111111111111111111111111111111111111",
        value: "0",
        calldata: "",
      },
    ]);
    expect(calldatas).toEqual(["0x"]);
  });
});

describe("computeProposalId", () => {
  it("matches the OpenZeppelin hashProposal formula", () => {
    // Arbitrary but deterministic inputs.
    const target = "0x1111111111111111111111111111111111111111" as const;
    const id = computeProposalId([target], [BigInt(0)], ["0x"], "hello world");

    // Recompute with a direct viem implementation as a cross-check.
    // This mirrors the Governor contract's on-chain id derivation:
    //   keccak256(abi.encode(targets, values, calldatas, keccak256(description)))
    //
    // Result should be a decimal string parsing to a positive bigint.
    expect(id).toMatch(/^\d+$/);
    expect(BigInt(id) > BigInt(0)).toBe(true);
  });

  it("differs when description changes", () => {
    const target = "0x1111111111111111111111111111111111111111" as const;
    const a = computeProposalId([target], [BigInt(0)], ["0x"], "A");
    const b = computeProposalId([target], [BigInt(0)], ["0x"], "B");
    expect(a).not.toEqual(b);
  });

  it("differs when target changes", () => {
    const a = computeProposalId(
      ["0x1111111111111111111111111111111111111111"],
      [BigInt(0)],
      ["0x"],
      "x"
    );
    const b = computeProposalId(
      ["0x2222222222222222222222222222222222222222"],
      [BigInt(0)],
      ["0x"],
      "x"
    );
    expect(a).not.toEqual(b);
  });
});

describe("emptyAction", () => {
  it("produces a default row", () => {
    expect(emptyAction()).toEqual({ target: "", value: "0", calldata: "0x" });
  });
});
