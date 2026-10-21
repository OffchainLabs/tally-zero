import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedProposal } from "@/types/proposal";

import { MobileProposalCard } from "./MobileProposalCard";

const mocks = vi.hoisted(() => ({
  useProposalLifecycleStatus: vi.fn(),
  useReadContract: vi.fn(),
}));

vi.mock("@/hooks/use-proposal-lifecycle-status", () => ({
  useProposalLifecycleStatus: mocks.useProposalLifecycleStatus,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useReadContract: mocks.useReadContract,
}));

const L1_GOVERNOR = "0x00000000000000000000000000000000003c3c3c";

const l1Proposal: ParsedProposal = {
  id: "77",
  contractAddress: L1_GOVERNOR,
  proposer: "0xb4c064f466931b8d0f637654c916e3f203c46f13",
  targets: [],
  values: [],
  signatures: [],
  calldatas: [],
  startBlock: "120",
  endBlock: "0",
  description: "# Recover the DAO\n\nBody",
  networkId: "1337",
  state: "Executed",
  governorName: "L1 Voting Governor",
  governorType: "L1_VOTING",
  snapshotLocked: true,
  executionPhase: "L2_RETRYABLE_PENDING",
  executionCancelled: false,
};

describe("MobileProposalCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProposalLifecycleStatus.mockReturnValue({
      state: "Executed",
      isResolving: false,
    });
    mocks.useReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it("renders an L1 voting proposal with its badge, chain and status", () => {
    const html = renderToStaticMarkup(
      <MobileProposalCard proposal={l1Proposal} />
    );

    expect(html).toContain("Recover the DAO");
    expect(html).toContain(">L1 Voting<");
    expect(html).toContain(`govId=eip155:1337:${L1_GOVERNOR}`);
    // Executed on L1, retryable still pending on Arbitrum.
    expect(html).toContain("Executing");
    expect(mocks.useProposalLifecycleStatus).toHaveBeenCalledWith(l1Proposal, {
      enabled: false,
    });
    // No Arbitrum One hasVoted read for an L1 voting proposal.
    expect(mocks.useReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ enabled: false }),
      })
    );
  });
});
