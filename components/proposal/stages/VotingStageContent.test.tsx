import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { mapIndexerStage } from "@/lib/indexer-stages";

import { VotingStageContent } from "./VotingStageContent";

vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/components/proposal/TopDelegatesNotVoted", () => ({
  TopDelegatesNotVoted: () => null,
}));

const range = {
  votingStartDate: new Date(1_700_000_000_000),
  votingEndMinDate: new Date(1_700_600_000_000),
  votingEndMaxDate: new Date(1_700_800_000_000),
  startBlock: 100,
  endBlock: 200,
};

function renderVoting(wasExtended: boolean) {
  const stage = mapIndexerStage(
    {
      type: "VOTING_ACTIVE",
      status: "COMPLETED",
      chain: "arb1",
      startedAt: null,
      completedAt: null,
      etaAt: null,
      txHash: null,
      detail: { forVotes: "10", quorum: "5", wasExtended },
    },
    1_800_000_000
  );
  return renderToStaticMarkup(
    <VotingStageContent
      stage={stage}
      votingTimeRange={range}
      stageType="VOTING_ACTIVE"
      proposalId="1"
      governorAddress="0x0000000000000000000000000000000000000001"
    />
  );
}

describe("VotingStageContent from the indexer", () => {
  it("shows the Extended badge when the indexer says voting was extended", () => {
    expect(renderVoting(true)).toContain(">Extended<");
    expect(renderVoting(false)).not.toContain(">Extended<");
  });
});
