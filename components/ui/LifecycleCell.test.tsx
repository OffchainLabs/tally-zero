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
      status({ isQueued: true, queuePosition: 2 })
    );

    const html = renderToStaticMarkup(<LifecycleCell proposal={proposal} />);

    expect(html).toContain("Queue #2");
    expect(html).toContain(`/proposal/`);
    expect(html).toContain("tab=stages");
  });

  it("links to the stages tab for a resolved status", () => {
    mocks.useProposalLifecycleStatus.mockReturnValue(status({}));

    const html = renderToStaticMarkup(<LifecycleCell proposal={proposal} />);

    expect(html).toContain("Queued");
    expect(html).toContain("tab=stages");
  });
});
