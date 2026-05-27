import { describe, expect, it } from "vitest";

import { GOVERNORS } from "@/config/governors";

import { getProposalCancelVisibility } from "./proposal-cancel-visibility";

const PROPOSER = "0x1111111111111111111111111111111111111111";
const OTHER_ACCOUNT = "0x2222222222222222222222222222222222222222";

describe("getProposalCancelVisibility", () => {
  it("derives visibility from state, proposer, governor, and wallet", () => {
    expect(
      getProposalCancelVisibility({
        accountAddress: undefined,
        governorAddress: GOVERNORS.treasury.address,
        isConnected: false,
        proposer: PROPOSER,
        state: "Pending",
      })
    ).toBe("hidden");
    expect(
      getProposalCancelVisibility({
        accountAddress: PROPOSER,
        governorAddress: GOVERNORS.treasury.address,
        isConnected: true,
        proposer: PROPOSER,
        state: "Pending",
      })
    ).toBe("cancel");
    expect(
      getProposalCancelVisibility({
        accountAddress: OTHER_ACCOUNT,
        governorAddress: GOVERNORS.treasury.address,
        isConnected: true,
        proposer: PROPOSER,
        state: "Pending",
      })
    ).toBe("hidden");
  });
});
