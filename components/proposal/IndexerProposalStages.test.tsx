import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mapIndexerStages } from "@/lib/indexer-stages";
import type { IndexerProposalStages } from "@/lib/tally-data/types";

import ProposalStages from "./ProposalStages";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  useIndexerProposalStages: vi.fn(),
  useProposalStages: vi.fn(),
  ExecuteTimelockButton: vi.fn(),
}));

vi.mock("./stages/ExecuteTimelockButton", () => ({
  ExecuteTimelockButton: (props: unknown) => {
    mocks.ExecuteTimelockButton(props);
    return <button data-testid="execute-timelock-mock" />;
  },
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
    // Stage roots carry the endpoint's type and status for e2e
    expect(html).toContain(
      'data-stage-type="PROPOSAL_QUEUED" data-stage-status="COMPLETED"'
    );
    expect(html).toContain(
      'data-stage-type="L1_TIMELOCK" data-stage-status="PENDING"'
    );
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

  function withStages(stages: IndexerProposalStages["stages"], extra = {}) {
    const response = { ...RESPONSE, ...extra, stages };
    mocks.useIndexerProposalStages.mockReturnValue({
      data: response,
      stages: mapIndexerStages(response),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  }

  const SALT = `0x${"22".repeat(32)}`;
  const OPERATION_ID = `0x${"11".repeat(32)}`;
  const TIMELOCK = "0x0000000000000000000000000000000000000Ae1";
  const readyTimelock = {
    ...RESPONSE.stages[2],
    etaAt: 1_700_000_000,
    detail: {
      operationId: OPERATION_ID,
      calls: 1,
      salt: SALT,
      predecessor: null,
      timelockAddress: TIMELOCK,
      chainId: 1,
      operations: [
        {
          target: "0x0000000000000000000000000000000000000001",
          value: "0",
          data: "0x",
        },
      ],
    },
  };

  it("offers execution of a timelock past its ETA with a known salt", () => {
    withStages([RESPONSE.stages[0], RESPONSE.stages[1], readyTimelock]);

    const html = render();

    expect(html).toContain('data-testid="execute-timelock-mock"');
    expect(mocks.ExecuteTimelockButton).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: expect.objectContaining({
          operationId: OPERATION_ID,
          timelockAddress: TIMELOCK,
          chainId: 1,
          salt: SALT,
        }),
      })
    );
  });

  it("offers no execution before the ETA or without a salt", () => {
    withStages([{ ...readyTimelock, etaAt: 4_000_000_000 }]);
    expect(render()).not.toContain("execute-timelock-mock");

    withStages([
      { ...readyTimelock, detail: { ...readyTimelock.detail, salt: null } },
    ]);
    expect(render()).not.toContain("execute-timelock-mock");
  });

  it("draws an L1 voting proposal's tallies on the voting stage", () => {
    withStages([
      {
        type: "VOTING_ACTIVE",
        status: "COMPLETED",
        chain: "ethereum",
        startedAt: null,
        completedAt: null,
        etaAt: null,
        txHash: null,
        detail: {
          result: "SUCCEEDED",
          forVotes: "3000000000000000000",
          againstVotes: "1000000000000000000",
          abstainVotes: "0",
          quorum: "2000000000000000000",
        },
      },
    ]);

    const html = render();

    expect(html).toContain("Votes");
    expect(html).toContain("Quorum Reached");
    expect(html).toContain("100%");
  });

  it("renders an election proposal's election stages", () => {
    mocks.env.NEXT_PUBLIC_STAGES_SOURCE = "indexer";
    const electionStage = (type: string, status: string) => ({
      type,
      status,
      chain: "arb1",
      startedAt: 1_700_000_000,
      completedAt: null,
      etaAt: null,
      txHash: null,
      detail: { cohort: 1 },
    });
    withStages(
      [
        electionStage("CREATE_ELECTION", "COMPLETED"),
        electionStage("NOMINEE_ELECTION", "COMPLETED"),
        electionStage("NOMINEE_VETTING", "PENDING"),
        electionStage("MEMBER_ELECTION", "NOT_STARTED"),
      ] as IndexerProposalStages["stages"],
      { proposalType: "election", governorType: "NOMINEE_ELECTION" }
    );

    const html = render({
      governorAddress: "0x8a1cDA8dee421cD06023470608605934c16A05a0",
      indexerGovernorType: undefined,
      networkId: "42161",
    });

    for (const type of [
      "CREATE_ELECTION",
      "NOMINEE_ELECTION",
      "NOMINEE_VETTING",
      "MEMBER_ELECTION",
    ]) {
      expect(html).toContain(`data-stage-type="${type}"`);
    }
    expect(html).toContain("Security Council election");
    expect(html).toContain("Cohort 1");
  });
});
