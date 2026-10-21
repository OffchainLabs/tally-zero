import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mapIndexerStages } from "@/lib/indexer-stages";
import type { IndexerProposalStages } from "@/lib/tally-data/types";

import ProposalStages from "./ProposalStages";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  useIndexerProposalStages: vi.fn(),
  useProposalStages: vi.fn(),
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/hooks/use-indexer-proposal-stages", () => ({
  useIndexerProposalStages: mocks.useIndexerProposalStages,
}));
vi.mock("@/hooks/use-proposal-stages", () => ({
  useProposalStages: mocks.useProposalStages,
  getAllStageTypes: () => [],
}));
vi.mock("@/hooks/use-voting-period", () => ({
  useVotingPeriod: () => ({
    votingPeriod: null,
    extensionStillPossible: false,
  }),
}));
vi.mock("@/hooks/use-l1-block-timestamps", () => ({
  useL1BlockTimestamps: () => new Map(),
}));

const L1_GOVERNOR = "0x00000000000000000000000000000000000E11e1";
const CORE_GOVERNOR = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
const QUEUE_TX = `0x${"ab".repeat(32)}`;

const RESPONSE: IndexerProposalStages = {
  proposalId: "42",
  governorAddress: L1_GOVERNOR.toLowerCase(),
  governorType: "L1_VOTING",
  executionPhase: "L1_TIMELOCK_PENDING",
  executionCancelled: false,
  stages: [
    {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "ethereum",
      startedAt: 1_700_000_000,
      completedAt: 1_700_000_000,
      etaAt: null,
      txHash: null,
      detail: null,
    },
    {
      type: "PROPOSAL_QUEUED",
      status: "COMPLETED",
      chain: "ethereum",
      startedAt: 1_700_100_000,
      completedAt: 1_700_100_000,
      etaAt: null,
      txHash: QUEUE_TX,
      detail: null,
    },
    {
      type: "L1_TIMELOCK",
      status: "PENDING",
      chain: "ethereum",
      startedAt: 1_700_100_000,
      completedAt: null,
      etaAt: 4_000_000_000,
      txHash: null,
      detail: { operationId: "0x01" },
    },
  ],
};

function render(props: Partial<Parameters<typeof ProposalStages>[0]> = {}) {
  return renderToStaticMarkup(
    <ProposalStages
      proposalId="42"
      creationTxHash=""
      governorAddress={L1_GOVERNOR}
      indexerGovernorType="L1_VOTING"
      networkId="1"
      {...props}
    />
  );
}

describe("ProposalStages from the indexer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
    mocks.useIndexerProposalStages.mockReturnValue({
      data: RESPONSE,
      stages: mapIndexerStages(RESPONSE),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("renders an L1 voting proposal's stages without gov-tracker", () => {
    const html = render();

    expect(html).toContain('data-testid="indexer-proposal-stages"');
    expect(mocks.useProposalStages).not.toHaveBeenCalled();
    expect(mocks.useIndexerProposalStages).toHaveBeenCalledWith({
      proposalId: "42",
      governorAddress: L1_GOVERNOR,
    });
    // The completing transaction links to Etherscan on mainnet
    expect(html).toContain(`https://etherscan.io/tx/${QUEUE_TX}`);
    // The pending timelock carries its ETA as the estimate
    expect(html).toContain("Est. completion");
    // No Arbiscan governor links for an L1 voting proposal
    expect(html).not.toContain("arbiscan.io/address");
  });

  it("shows local chain hashes without a link", () => {
    mocks.env.NEXT_PUBLIC_LOCAL_CHAINS = "1";
    mocks.useIndexerProposalStages.mockReturnValue({
      data: RESPONSE,
      stages: mapIndexerStages(RESPONSE),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const html = render({ networkId: "1337" });

    expect(html).toContain(`title="${QUEUE_TX}"`);
    expect(html).not.toContain("etherscan.io/tx");
  });

  it("reports an endpoint error with a retry", () => {
    mocks.useIndexerProposalStages.mockReturnValue({
      data: null,
      stages: [],
      isLoading: false,
      error: "Governance indexer request failed: 404",
      refetch: vi.fn(),
    });

    expect(render()).toContain("Governance indexer request failed: 404");
  });

  it("keeps gov-tracker for Arbitrum One proposals by default", () => {
    mocks.useProposalStages.mockReturnValue({
      stages: [],
      currentStageIndex: -1,
      isLoading: true,
      isQueued: false,
      queuePosition: null,
      isComplete: false,
      error: null,
      result: null,
      refetchFromStage: vi.fn(),
      refreshingFromIndex: null,
    });

    render({
      governorAddress: CORE_GOVERNOR,
      indexerGovernorType: "CONSTITUTIONAL",
      networkId: "42161",
      creationTxHash: QUEUE_TX,
    });

    expect(mocks.useProposalStages).toHaveBeenCalled();
    expect(mocks.useIndexerProposalStages).not.toHaveBeenCalled();
  });

  it("uses the indexer for Arbitrum One proposals under the flag", () => {
    mocks.env.NEXT_PUBLIC_STAGES_SOURCE = "indexer";

    const html = render({
      governorAddress: CORE_GOVERNOR,
      indexerGovernorType: "CONSTITUTIONAL",
      networkId: "42161",
    });

    expect(html).toContain('data-testid="indexer-proposal-stages"');
    expect(mocks.useProposalStages).not.toHaveBeenCalled();
  });
});
