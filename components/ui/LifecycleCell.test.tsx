import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GOVERNORS } from "@/config/governors";

import { LifecycleCell } from "./LifecycleCell";

const mocks = vi.hoisted(() => ({
  useProposalLifecycleStatus: vi.fn(),
}));

vi.mock("@/hooks/use-proposal-lifecycle-status", () => ({
  useProposalLifecycleStatus: mocks.useProposalLifecycleStatus,
}));

const PROPOSAL_ID = "9950";
const UNREGISTERED_L1_GOVERNOR = "0x4444444444444444444444444444444444444444";

const proposal = {
  id: PROPOSAL_ID,
  state: "Queued",
  contractAddress: GOVERNORS.core.address,
  creationTxHash: "0x1f70",
} as Parameters<typeof LifecycleCell>[0]["proposal"];

/** Whatever the hook reports, the cell should stay a link to the stages tab */
function status(overrides: Record<string, unknown>) {
  return {
    display: "Queued",
    state: "Queued",
    isInProgress: false,
    phaseLabel: null,
    currentStage: null,
    totalStages: 7,
    isResolving: false,
    isTracked: true,
    isQueued: false,
    queuePosition: null,
    isLoading: false,
    isComplete: false,
    error: null,
    stages: [],
    currentStageIndex: -1,
    isBackgroundRefreshing: false,
    ...overrides,
  };
}

describe("LifecycleCell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Every other state in the column opens the stages tab. A row that happens to
  // be waiting for one of the two tracking slots must not be the one dead spot.
  it("links to the stages tab while tracking is queued", () => {
    mocks.useProposalLifecycleStatus.mockReturnValue(
      status({ isResolving: true, isQueued: true, queuePosition: 2 })
    );

    const html = renderToStaticMarkup(<LifecycleCell proposal={proposal} />);

    expect(html).toContain(`/proposal/`);
    expect(html).toContain("tab=stages");
    // The queue position moved into the hover card, which Radix renders only
    // once opened. What must not happen is it standing in for a status.
    expect(html).not.toContain("Queue #2");
  });

  // Cycling through "Queued", "Executed" and then "Executing" as each source
  // answers reads as three verdicts rather than one being refined.
  it("shows a placeholder instead of a status while one is still being read", () => {
    mocks.useProposalLifecycleStatus.mockReturnValue(
      status({ isResolving: true, isLoading: true, display: "Executing" })
    );

    const html = renderToStaticMarkup(<LifecycleCell proposal={proposal} />);

    expect(html).toContain("animate-[shimmer_2s_ease-in-out_infinite]");
    expect(html).not.toContain(">Executing<");
    expect(html).not.toContain(">Queued<");
  });

  it("shows a placeholder while the indexed state is unverified", () => {
    mocks.useProposalLifecycleStatus.mockReturnValue(status({}));

    const html = renderToStaticMarkup(
      <LifecycleCell proposal={{ ...proposal, isStateUnverified: true }} />
    );

    expect(html).toContain("animate-[shimmer_2s_ease-in-out_infinite]");
    expect(html).not.toContain(">Queued<");
  });

  // The registry only learns an L1 voting governor once the proposal list has
  // loaded, so the link has to take the chain from the row itself.
  it("links an L1 voting row to its own chain before the registry knows it", () => {
    mocks.useProposalLifecycleStatus.mockReturnValue(status({}));
    const l1Row = {
      ...proposal,
      contractAddress: UNREGISTERED_L1_GOVERNOR,
      networkId: "1",
      governorType: "L1_VOTING",
    } as typeof proposal;

    const html = renderToStaticMarkup(<LifecycleCell proposal={l1Row} />);

    expect(html).toContain(`govId=eip155:1:${UNREGISTERED_L1_GOVERNOR}`);
    expect(mocks.useProposalLifecycleStatus).toHaveBeenCalledWith(
      expect.objectContaining({ networkId: "1", governorType: "L1_VOTING" })
    );
  });

  it("links to the stages tab for a resolved status", () => {
    mocks.useProposalLifecycleStatus.mockReturnValue(status({}));

    const html = renderToStaticMarkup(<LifecycleCell proposal={proposal} />);

    expect(html).toContain("Queued");
    expect(html).toContain("tab=stages");
  });
});
