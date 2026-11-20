import { describe, expect, it } from "vitest";

import {
  approvalsIfExecutedBy,
  prevalidatedSignatures,
  type SafeTxState,
} from "./safe";

const A = "0x00000000000000000000000000000000000000aa" as const;
const B = "0x00000000000000000000000000000000000000bb" as const;

describe("Safe pre-validated signatures", () => {
  it("orders owners ascending and encodes r = owner, s = 0, v = 1", () => {
    const sigs = prevalidatedSignatures([B], A);
    expect(sigs.length).toBe(2 + 2 * 65 * 2);
    expect(sigs.slice(2, 66)).toBe(`${"0".repeat(62)}aa`);
    expect(sigs.slice(130, 132)).toBe("01");
    expect(sigs.slice(132, 196)).toBe(`${"0".repeat(62)}bb`);
  });

  it("counts the executor's own approval only if it is an owner", () => {
    const state = {
      owners: [A, B],
      approvedBy: [B],
      threshold: 2,
    } as unknown as SafeTxState;
    expect(approvalsIfExecutedBy(state, A)).toBe(2);
    expect(
      approvalsIfExecutedBy(state, "0x00000000000000000000000000000000000000cc")
    ).toBe(1);
  });
});
