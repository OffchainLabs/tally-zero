import { describe, expect, it } from "vitest";

import {
  buildLookupMap,
  buildShuffleMap,
  compareBigInt,
  compareBigIntDesc,
  sortByOrderMap,
  sumBigInt,
} from "./collection-utils";

describe("collection-utils", () => {
  describe("buildLookupMap", () => {
    it("creates a Map with correct key-value pairs", () => {
      const users = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" },
      ];

      const map = buildLookupMap(users, (u) => u.id);

      expect(map.get(1)).toEqual({ id: 1, name: "Alice" });
      expect(map.get(2)).toEqual({ id: 2, name: "Bob" });
      expect(map.get(3)).toEqual({ id: 3, name: "Charlie" });
    });

    it("returns undefined for missing keys", () => {
      const users = [{ id: 1, name: "Alice" }];
      const map = buildLookupMap(users, (u) => u.id);

      expect(map.get(999)).toBeUndefined();
    });

    it("handles empty arrays", () => {
      const map = buildLookupMap([], (item: { id: number }) => item.id);

      expect(map.size).toBe(0);
    });

    it("works with string keys", () => {
      const items = [
        { address: "0xABC", value: 100 },
        { address: "0xDEF", value: 200 },
      ];

      const map = buildLookupMap(items, (i) => i.address.toLowerCase());

      expect(map.get("0xabc")).toEqual({ address: "0xABC", value: 100 });
      expect(map.get("0xdef")).toEqual({ address: "0xDEF", value: 200 });
    });

    it("handles duplicate keys by keeping the last one", () => {
      const items = [
        { id: 1, version: "v1" },
        { id: 1, version: "v2" },
      ];

      const map = buildLookupMap(items, (i) => i.id);

      expect(map.get(1)).toEqual({ id: 1, version: "v2" });
      expect(map.size).toBe(1);
    });

    it("preserves readonly array semantics", () => {
      const items: readonly { id: number }[] = Object.freeze([
        { id: 1 },
        { id: 2 },
      ]);

      const map = buildLookupMap(items, (i) => i.id);

      expect(map.size).toBe(2);
    });
  });

  describe("compareBigInt", () => {
    it("returns positive when first value is greater", () => {
      expect(compareBigInt("100", "50")).toBe(1);
      expect(compareBigInt("1000000000000000000", "999999999999999999")).toBe(
        1
      );
    });

    it("returns negative when first value is smaller", () => {
      expect(compareBigInt("50", "100")).toBe(-1);
      expect(compareBigInt("999999999999999999", "1000000000000000000")).toBe(
        -1
      );
    });

    it("returns zero when values are equal", () => {
      expect(compareBigInt("100", "100")).toBe(0);
      expect(compareBigInt("0", "0")).toBe(0);
      expect(compareBigInt("1000000000000000000", "1000000000000000000")).toBe(
        0
      );
    });

    it("handles very large numbers", () => {
      const largeA =
        "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      const largeB =
        "115792089237316195423570985008687907853269984665640564039457584007913129639934";

      expect(compareBigInt(largeA, largeB)).toBe(1);
      expect(compareBigInt(largeB, largeA)).toBe(-1);
    });

    it("works correctly for sorting in ascending order", () => {
      const values = ["300", "100", "200"];
      const sorted = [...values].sort((a, b) => compareBigInt(a, b));

      expect(sorted).toEqual(["100", "200", "300"]);
    });

    it("handles zero values", () => {
      expect(compareBigInt("0", "1")).toBe(-1);
      expect(compareBigInt("1", "0")).toBe(1);
      expect(compareBigInt("0", "0")).toBe(0);
    });
  });

  describe("buildShuffleMap", () => {
    it("assigns each key a unique randomized index", () => {
      const keys = ["0xabc", "0xdef", "0x123"];

      const orderMap = buildShuffleMap(keys);

      expect([...orderMap.keys()].sort()).toEqual([...keys].sort());
      expect([...orderMap.values()].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    });

    it("does not mutate the input array", () => {
      const keys = ["0xabc", "0xdef"];
      const original = [...keys];

      buildShuffleMap(keys);

      expect(keys).toEqual(original);
    });
  });

  describe("sortByOrderMap", () => {
    it("sorts items by their mapped order", () => {
      const delegates = [
        { address: "0xbbb" },
        { address: "0xccc" },
        { address: "0xaaa" },
      ];
      const orderMap = new Map([
        ["0xaaa", 0],
        ["0xbbb", 1],
        ["0xccc", 2],
      ]);

      const sorted = sortByOrderMap(
        delegates,
        (delegate) => delegate.address,
        orderMap
      );

      expect(sorted.map((delegate) => delegate.address)).toEqual([
        "0xaaa",
        "0xbbb",
        "0xccc",
      ]);
    });

    it("places items missing from the order map at the end", () => {
      const delegates = [{ address: "0xbbb" }, { address: "0xaaa" }];
      const orderMap = new Map([["0xaaa", 0]]);

      const sorted = sortByOrderMap(
        delegates,
        (delegate) => delegate.address,
        orderMap
      );

      expect(sorted.map((delegate) => delegate.address)).toEqual([
        "0xaaa",
        "0xbbb",
      ]);
    });

    it("does not mutate the original array", () => {
      const delegates = [{ address: "0xbbb" }, { address: "0xaaa" }];
      const original = [...delegates];
      const orderMap = new Map([
        ["0xaaa", 0],
        ["0xbbb", 1],
      ]);

      sortByOrderMap(delegates, (delegate) => delegate.address, orderMap);

      expect(delegates).toEqual(original);
    });
  });

  describe("compareBigIntDesc", () => {
    it("returns negative when first value is greater (descending)", () => {
      expect(compareBigIntDesc("100", "50")).toBe(-1);
    });

    it("returns positive when first value is smaller (descending)", () => {
      expect(compareBigIntDesc("50", "100")).toBe(1);
    });

    it("returns zero when values are equal", () => {
      expect(compareBigIntDesc("100", "100")).toBe(0);
    });

    it("works correctly for sorting in descending order", () => {
      const values = ["300", "100", "200"];
      const sorted = [...values].sort((a, b) => compareBigIntDesc(a, b));

      expect(sorted).toEqual(["300", "200", "100"]);
    });

    it("sorts objects by BigInt field in descending order", () => {
      const delegates = [
        { address: "0x1", votingPower: "100" },
        { address: "0x2", votingPower: "300" },
        { address: "0x3", votingPower: "200" },
      ];

      const sorted = [...delegates].sort((a, b) =>
        compareBigIntDesc(a.votingPower, b.votingPower)
      );

      expect(sorted[0].votingPower).toBe("300");
      expect(sorted[1].votingPower).toBe("200");
      expect(sorted[2].votingPower).toBe("100");
    });
  });

  describe("sumBigInt", () => {
    it("sums values correctly", () => {
      const items = [{ value: "100" }, { value: "200" }, { value: "300" }];

      const total = sumBigInt(items, (i) => i.value);

      expect(total).toBe("600");
    });

    it("returns 0 for empty array", () => {
      const total = sumBigInt([], (i: { value: string }) => i.value);

      expect(total).toBe("0");
    });

    it("handles single item", () => {
      const items = [{ value: "42" }];

      const total = sumBigInt(items, (i) => i.value);

      expect(total).toBe("42");
    });

    it("handles very large numbers without precision loss", () => {
      const items = [
        { power: "1000000000000000000" }, // 1e18
        { power: "2000000000000000000" }, // 2e18
        { power: "3000000000000000000" }, // 3e18
      ];

      const total = sumBigInt(items, (i) => i.power);

      expect(total).toBe("6000000000000000000");
    });

    it("handles zero values in array", () => {
      const items = [{ value: "100" }, { value: "0" }, { value: "200" }];

      const total = sumBigInt(items, (i) => i.value);

      expect(total).toBe("300");
    });

    it("works with delegate-like objects", () => {
      const delegates = [
        { address: "0x1", votingPower: "1000000000000000000000" },
        { address: "0x2", votingPower: "500000000000000000000" },
        { address: "0x3", votingPower: "250000000000000000000" },
      ];

      const totalVotingPower = sumBigInt(delegates, (d) => d.votingPower);

      expect(totalVotingPower).toBe("1750000000000000000000");
    });

    it("preserves readonly array semantics", () => {
      const items: readonly { value: string }[] = Object.freeze([
        { value: "10" },
        { value: "20" },
      ]);

      const total = sumBigInt(items, (i) => i.value);

      expect(total).toBe("30");
    });
  });
});
