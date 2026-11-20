import { describe, expect, it } from "vitest";

import { GOVERNORS, registerL1VotingGovernor } from "@/config/governors";

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

  // Cancelling an L1 voting proposal is a separate flow; the Arbitrum One
  // cancel card must never offer it.
  it("hides cancel for an L1 voting proposal", () => {
    const l1Governor = "0x0000000000000000000000000000000000011111";
    registerL1VotingGovernor(l1Governor, 1);
    expect(
      getProposalCancelVisibility({
        accountAddress: PROPOSER,
        governorAddress: l1Governor,
        isConnected: true,
        proposer: PROPOSER,
        state: "Pending",
      })
    ).toBe("hidden");
  });
});
