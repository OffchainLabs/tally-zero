import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UseL1ProposalResult } from "@/hooks/use-l1-proposal";

import { L1ProposalVoters } from "./L1ProposalVoters";
import { ProposalPage } from "./ProposalPage";

const L1_GOVERNOR = "0x00000000000000000000000000000000000E11e1";
const VOTER = "0x1111111111111111111111111111111111111111";
const DELEGATE = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  useL1Proposal: vi.fn(),
  useProposalById: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/hooks/use-l1-proposal", () => ({
  useL1Proposal: mocks.useL1Proposal,
}));
vi.mock("@/hooks/use-proposal-by-id", () => ({
  useProposalById: mocks.useProposalById,
}));
// The Arbitrum One page's tab model; never rendered on this branch
vi.mock("@/components/container/VoteModel", () => ({ default: () => null }));
vi.mock("@/components/proposal/ProposalVoteCard", () => ({
  ProposalVoteCard: () => null,
}));
vi.mock("@/components/l1-voting/L1VotePanel", () => ({
  L1VotePanel: ({ proposalId }: { proposalId: string }) => (
    <div data-testid="l1-vote-panel" data-proposal-id={proposalId} />
  ),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: mocks.useQuery,
}));
vi.mock("@/lib/tally-data/client", () => ({
  getTallyDataClient: vi.fn(),
  useAddressDisplayRecords: () =>
    new Map([[DELEGATE, { label: "Delegate Dee" }]]),
}));

function l1Proposal(
  overrides: Partial<UseL1ProposalResult> = {}
): UseL1ProposalResult {
  return {
    entry: {
      proposalId: "42",
      governorAddress: L1_GOVERNOR.toLowerCase(),
      governorType: "L1_VOTING",
      chainId: 1337,
      snapshotLocked: true,
      executionPhase: null,
      executionCancelled: false,
      quorum: "1000000000000000000000",
      snapshotBlock: 120,
      state: "Active",
      proposer: VOTER,
      description: "# Recover the bridge\n\nMove funds back.",
    },
    voteSummary: {
      for: { voterCount: 2, weight: "3000000000000000000000" },
      against: { voterCount: 1, weight: "1000000000000000000000" },
      abstain: { voterCount: 0, weight: "0" },
      totalCount: 3,
    },
    onChain: {
      state: 1,
      snapshotBlock: 150,
      deadlineBlock: 400,
      snapshotLocked: true,
    },
    currentBlock: 300,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function renderPage(govId: string) {
  mocks.searchParams = new URLSearchParams({ govId });
  return renderToStaticMarkup(<ProposalPage proposalId="42" />);
}

describe("ProposalPage for an L1 voting proposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useL1Proposal.mockReturnValue(l1Proposal());
  });

  it("loads from the indexer and the L1 chain, never the L2 path", () => {
    const html = renderPage(`eip155:1337:${L1_GOVERNOR}`);

    expect(html).toContain('data-testid="l1-proposal-page"');
    expect(mocks.useProposalById).not.toHaveBeenCalled();
    expect(mocks.useL1Proposal).toHaveBeenCalledWith({
      proposalId: "42",
      governorAddress: L1_GOVERNOR,
      chainId: 1337,
    });
  });

  it("shows the governor, state, title and description", () => {
    const html = renderPage(`eip155:1337:${L1_GOVERNOR}`);

    expect(html).toContain("L1 Voting");
    expect(html).toMatch(
      /data-testid="l1-proposal-state"[^>]*data-state="ACTIVE"|data-state="ACTIVE"[^>]*data-testid="l1-proposal-state"/
    );
    expect(html).toContain("Recover the bridge");
    expect(html).toContain("Move funds back.");
  });

  it("states the locked snapshot block and what it means", () => {
    const html = renderPage(`eip155:1337:${L1_GOVERNOR}`);

    // The governor's read wins over the indexed block
    expect(html).toContain("Snapshot locked at L1 block");
    expect(html).toContain("150");
    expect(html).toContain("confirmed assertion at the lock");
    // No explorer for the local chain
    expect(html).not.toContain("etherscan.io/block");
  });

  it("says when the snapshot is not locked yet", () => {
    mocks.useL1Proposal.mockReturnValue(
      l1Proposal({
        onChain: { state: 0, snapshotLocked: false, deadlineBlock: 400 },
      })
    );
    const html = renderPage(`eip155:1337:${L1_GOVERNOR}`);
    expect(html).toContain("Snapshot not locked yet");
  });

  it("gives the deadline in L1 blocks with 1s blocks locally", () => {
    const html = renderPage(`eip155:1337:${L1_GOVERNOR}`);
    expect(html).toContain("Voting ends at L1 block");
    expect(html).toContain("400");
    expect(html).toContain("100 blocks to go");
  });

  it("links mainnet blocks to Etherscan", () => {
    const html = renderPage(`eip155:1:${L1_GOVERNOR}`);
    expect(html).toContain("https://etherscan.io/block/150");
    expect(html).toContain("https://etherscan.io/block/400");
  });

  it("shows tallies and mounts the vote panel", () => {
    const html = renderPage(`eip155:1337:${L1_GOVERNOR}`);
    expect(html).toContain('data-testid="l1-tallies"');
    expect(html).toContain("2 voters");
    expect(html).toContain('data-testid="l1-vote-panel"');
  });

  it("reports a missing proposal", () => {
    mocks.useL1Proposal.mockReturnValue(l1Proposal({ entry: null }));
    expect(renderPage(`eip155:1:${L1_GOVERNOR}`)).toContain(
      "Proposal not found"
    );
  });
});

describe("L1ProposalVoters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the L2 delegate each L1 voter cast for", () => {
    mocks.useQuery.mockReturnValue({
      data: [
        {
          proposalId: "42",
          governorAddress: L1_GOVERNOR,
          support: 1,
          weight: "3000000000000000000000",
          blockNumber: 310,
          voter: VOTER,
          delegate: DELEGATE,
          display: {
            address: VOTER,
            label: null,
            title: null,
            picture: null,
            profileUrl: null,
            source: "address",
          },
        },
      ],
      isPending: false,
      error: null,
    });

    const html = renderToStaticMarkup(
      <L1ProposalVoters proposalId="42" governorAddress={L1_GOVERNOR} />
    );

    expect(html).toContain(`title="${VOTER}"`);
    expect(html).toContain("for Delegate Dee");
    expect(html).toContain(`title="${DELEGATE}"`);
    expect(html).toContain("For");
  });
});
