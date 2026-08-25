import { describe, expect, it } from "vitest";

import { GOVERNORS } from "@/config/governors";

import { shouldTrackProposalLifecycle } from "./use-proposal-lifecycle-status";

const CREATION_TX =
  "0x1f709032574f9c3986dbda8767f3bb9ff4f9c48cb67529f390dd9fa9b3bf853d";

function proposal(
  state: string,
  contractAddress: string,
  txHash = CREATION_TX
) {
  return { id: "9950", state, contractAddress, creationTxHash: txHash };
}

describe("shouldTrackProposalLifecycle", () => {
  it("tracks the states that are still moving toward execution", () => {
    for (const state of ["Pending", "active", "Succeeded", "QUEUED"]) {
      expect(
        shouldTrackProposalLifecycle(proposal(state, GOVERNORS.core.address))
      ).toBe(true);
    }
  });

  // The governor answers Executed the moment the L2 timelock operation runs,
  // which is where the L2 -> L1 -> retryable round trip starts.
  it("tracks a Core proposal the governor already calls Executed", () => {
    expect(
      shouldTrackProposalLifecycle(proposal("Executed", GOVERNORS.core.address))
    ).toBe(true);
  });

  it("leaves a Treasury Executed proposal alone: it never left L2", () => {
    expect(
      shouldTrackProposalLifecycle(
        proposal("Executed", GOVERNORS.treasury.address)
      )
    ).toBe(false);
  });

  it("never tracks a settled proposal", () => {
    for (const state of ["Canceled", "Defeated", "Expired"]) {
      expect(
        shouldTrackProposalLifecycle(proposal(state, GOVERNORS.core.address))
      ).toBe(false);
    }
  });

  // Indexer rows carry no creation transaction, which is the tracker's only
  // handle on a proposal; the background RPC scan supplies one for recent rows.
  it("cannot track a proposal with no creation transaction", () => {
    expect(
      shouldTrackProposalLifecycle(
        proposal("Executed", GOVERNORS.core.address, "")
      )
    ).toBe(false);
  });
});
