import { beforeEach, describe, expect, it, vi } from "vitest";

import { getL2BlockRangeForL1Blocks } from "./l2-block-range";

const l2BlockRangeForL1 = vi.fn();

vi.mock("ethers", () => ({
  ethers: {
    Contract: function MockContract() {
      return { l2BlockRangeForL1 };
    },
    BigNumber: {
      // Mirrors the real one: a BigNumber passes through unchanged.
      from: (value: unknown) =>
        value && typeof value === "object" && "toNumber" in value
          ? value
          : { toNumber: () => Number(value) },
    },
  },
}));

const provider = {} as never;

/** Real shape of the NodeInterface answer: a tuple of two BigNumbers */
function range(first: number, last: number) {
  return [{ toNumber: () => first }, { toNumber: () => last }];
}

describe("getL2BlockRangeForL1Blocks", () => {
  beforeEach(() => {
    l2BlockRangeForL1.mockReset();
  });

  it("spans from the first L2 block of the low bound to the last of the high bound", async () => {
    l2BlockRangeForL1.mockImplementation(async (l1Block: number) =>
      l1Block === 25_625_043
        ? range(488_298_441, 488_298_500)
        : range(488_298_919, 488_298_978)
    );

    expect(
      await getL2BlockRangeForL1Blocks({
        provider,
        fromL1Block: 25_625_043,
        toL1Block: 25_625_053,
      })
    ).toEqual({ fromBlock: 488_298_441, toBlock: 488_298_978 });
  });

  it("walks outwards when an L1 block produced no L2 blocks", async () => {
    // The requested bounds revert; the blocks just outside them answer, which
    // is the direction that keeps the result covering the request.
    l2BlockRangeForL1.mockImplementation(async (l1Block: number) => {
      if (l1Block === 99) return range(1_000, 1_059);
      if (l1Block === 111) return range(1_600, 1_659);
      throw new Error("no L2 blocks for this L1 block");
    });

    expect(
      await getL2BlockRangeForL1Blocks({
        provider,
        fromL1Block: 100,
        toL1Block: 110,
      })
    ).toEqual({ fromBlock: 1_000, toBlock: 1_659 });
  });

  it("gives up rather than walking forever when nothing answers", async () => {
    l2BlockRangeForL1.mockRejectedValue(new Error("method not supported"));

    expect(
      await getL2BlockRangeForL1Blocks({
        provider,
        fromL1Block: 100,
        toL1Block: 110,
      })
    ).toBeNull();
    // Bounded probes, both directions, and no retry past the cap.
    expect(l2BlockRangeForL1).toHaveBeenCalledTimes(12);
  });

  it("rejects a range that is not a range", async () => {
    for (const bounds of [
      { fromL1Block: 110, toL1Block: 100 },
      { fromL1Block: -1, toL1Block: 100 },
      { fromL1Block: 1.5, toL1Block: 100 },
      { fromL1Block: 100, toL1Block: Number.NaN },
    ]) {
      expect(
        await getL2BlockRangeForL1Blocks({ provider, ...bounds })
      ).toBeNull();
    }
    expect(l2BlockRangeForL1).not.toHaveBeenCalled();
  });
});
