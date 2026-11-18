import { describe, expect, it } from "vitest";

import {
  nextDelegatorsOffset,
  uniqueByAddress,
} from "@/hooks/use-delegate-delegators";

const page = (rows: number, totalCount: number) => ({
  totalCount,
  delegators: Array.from({ length: rows }, (_, i) => ({ i })),
});

describe("nextDelegatorsOffset", () => {
  it("continues from the number of rows loaded so far", () => {
    expect(nextDelegatorsOffset([page(25, 60)])).toBe(25);
    expect(nextDelegatorsOffset([page(25, 60), page(25, 60)])).toBe(50);
  });

  it("stops once every row is loaded", () => {
    expect(nextDelegatorsOffset([page(25, 50), page(25, 50)])).toBeUndefined();
    expect(nextDelegatorsOffset([page(0, 0)])).toBeUndefined();
  });

  it("stops on an empty page even if the total says more remain", () => {
    // The list shrank between fetches; asking again would loop on empty pages.
    expect(nextDelegatorsOffset([page(25, 60), page(0, 60)])).toBeUndefined();
  });
});

describe("uniqueByAddress", () => {
  it("keeps the first row per address, case-insensitively", () => {
    const rows = [
      { address: "0xAA", n: 1 },
      { address: "0xbb", n: 2 },
      { address: "0xaa", n: 3 },
    ];
    expect(uniqueByAddress(rows).map((row) => row.n)).toEqual([1, 2]);
  });
});
