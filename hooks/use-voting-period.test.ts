import { describe, expect, it } from "vitest";

import { decodeProposalVotes, encodeUint256Call } from "./use-voting-period";

describe("encodeUint256Call", () => {
  it("appends the argument as a 32-byte word", () => {
    expect(encodeUint256Call("0xc01f9e37", BigInt(21600))).toBe(
      "0xc01f9e37" + "0".repeat(60) + "5460"
    );
  });

  it("encodes large proposal ids", () => {
    const id = BigInt("0x" + "ff".repeat(32));
    expect(encodeUint256Call("0x544ffc9c", id)).toBe(
      "0x544ffc9c" + "ff".repeat(32)
    );
  });
});

describe("decodeProposalVotes", () => {
  it("decodes (against, for, abstain) words", () => {
    const word = (value: number) => value.toString(16).padStart(64, "0");
    const result = `0x${word(11)}${word(22)}${word(33)}`;

    const { forVotes, abstainVotes } = decodeProposalVotes(result);

    expect(forVotes).toBe(BigInt(22));
    expect(abstainVotes).toBe(BigInt(33));
  });
});
