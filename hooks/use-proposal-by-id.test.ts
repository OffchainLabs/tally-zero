import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_GOVERNORS } from "@/config/arbitrum-governance";
import { getProposalIndexEntry } from "@/lib/delegate-cache";
import { getL2BlockRangeForL1Blocks } from "@/lib/l2-block-range";
import type { TallyProposalIndexEntry } from "@/lib/tally-data/types";

import {
  fetchProposalFromGovernor,
  resolveProposalMetadataFallback,
} from "./use-proposal-by-id";

// Governor reads the mocked contract answers. Mutable so a test can put a
// ProposalCreated event in front of the log query, or change the voting delay.
const governorStub = vi.hoisted(() => ({
  votingDelay: 21600,
  events: [] as unknown[],
}));

// Mock ethers so the governor reads resolve without a real contract. By default
// every stub drives the no-creation-event path: queryFilter returns no events,
// so fetchProposalFromGovernor has to fall back to indexer metadata.
vi.mock("ethers", () => ({
  ethers: {
    Contract: function MockContract() {
      return {
        state: vi.fn().mockResolvedValue(7),
        proposalVotes: vi.fn().mockResolvedValue({
          forVotes: { toString: () => "1000" },
          againstVotes: { toString: () => "500" },
          abstainVotes: { toString: () => "200" },
        }),
        proposalSnapshot: vi
          .fn()
          .mockResolvedValue({ toNumber: () => 25547165 }),
        proposalDeadline: vi
          .fn()
          .mockResolvedValue({ toString: () => "25566425" }),
        quorum: vi.fn().mockResolvedValue({ toString: () => "5000" }),
        votingDelay: vi.fn().mockImplementation(async () => ({
          toNumber: () => governorStub.votingDelay,
        })),
        filters: { ProposalCreated: vi.fn().mockReturnValue({}) },
        queryFilter: vi
          .fn()
          .mockImplementation(async () => governorStub.events),
      };
    },
    BigNumber: {
      from: (value: unknown) => ({
        toString: () => String(value),
        toNumber: () => Number(value),
      }),
    },
  },
}));

vi.mock("@/lib/delegate-cache", () => ({
  getProposalIndexEntry: vi.fn(),
}));

vi.mock("@/lib/bundled-cache-loader", () => ({
  getBundledProposalCreationTxHash: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/l2-block-range", () => ({
  getL2BlockRangeForL1Blocks: vi.fn().mockResolvedValue(null),
}));

const PROPOSAL_ID =
  "7191014407719621170610709569285477750369874509305441081488686529382763374426";

const indexEntry: TallyProposalIndexEntry = {
  proposalId: PROPOSAL_ID,
  governorAddress: "0xf07ded9dc292157749b6fd268e37df6ea38395b9",
  snapshotBlock: 25547165,
  state: "EXECUTED",
  proposer: "0xb4c064f466931b8d0f637654c916e3f203c46f13",
  description: "# Constitutional AIP: ArbOS61 Elara Upgrade",
};

describe("resolveProposalMetadataFallback", () => {
  it("uses the indexer proposer and description when present", () => {
    expect(
      resolveProposalMetadataFallback({ proposalId: PROPOSAL_ID, indexEntry })
    ).toEqual({
      proposer: "0xb4c064f466931b8d0f637654c916e3f203c46f13",
      description: "# Constitutional AIP: ArbOS61 Elara Upgrade",
    });
  });

  it("falls back to placeholders when there is no index entry", () => {
    expect(
      resolveProposalMetadataFallback({
        proposalId: PROPOSAL_ID,
        indexEntry: null,
      })
    ).toEqual({
      proposer: "Unknown",
      description: `Proposal ${PROPOSAL_ID}`,
    });
  });

  it("falls back per field when the index entry has nulls", () => {
    expect(
      resolveProposalMetadataFallback({
        proposalId: PROPOSAL_ID,
        indexEntry: { ...indexEntry, proposer: null },
      })
    ).toEqual({
      proposer: "Unknown",
      description: "# Constitutional AIP: ArbOS61 Elara Upgrade",
    });

    expect(
      resolveProposalMetadataFallback({
        proposalId: PROPOSAL_ID,
        indexEntry: { ...indexEntry, description: null },
      })
    ).toEqual({
      proposer: "0xb4c064f466931b8d0f637654c916e3f203c46f13",
      description: `Proposal ${PROPOSAL_ID}`,
    });
  });

  it("treats empty strings as missing", () => {
    expect(
      resolveProposalMetadataFallback({
        proposalId: PROPOSAL_ID,
        indexEntry: { ...indexEntry, proposer: "", description: "" },
      })
    ).toEqual({
      proposer: "Unknown",
      description: `Proposal ${PROPOSAL_ID}`,
    });
  });
});

describe("fetchProposalFromGovernor without a ProposalCreated event", () => {
  // Deliberately not in PROPOSAL_CREATION_TX_HASHES_BY_CHAIN_ID, so the lookup
  // falls through to the log scan and finds nothing.
  const UNMAPPED_PROPOSAL_ID = "42";
  const governor = ARBITRUM_GOVERNORS[0];
  const provider = {
    getBlockNumber: vi.fn().mockResolvedValue(494_546_338),
  } as never;

  beforeEach(() => {
    vi.mocked(getProposalIndexEntry).mockReset();
    vi.mocked(getL2BlockRangeForL1Blocks).mockReset().mockResolvedValue(null);
    governorStub.events = [];
    governorStub.votingDelay = 21600;
  });

  it("reads the proposer and description from the indexer", async () => {
    vi.mocked(getProposalIndexEntry).mockResolvedValue({
      ...indexEntry,
      proposalId: UNMAPPED_PROPOSAL_ID,
    });

    const proposal = await fetchProposalFromGovernor({
      provider,
      governor,
      proposalId: UNMAPPED_PROPOSAL_ID,
    });

    expect(getProposalIndexEntry).toHaveBeenCalledWith(
      UNMAPPED_PROPOSAL_ID,
      governor.address
    );
    expect(proposal.proposer).toBe(
      "0xb4c064f466931b8d0f637654c916e3f203c46f13"
    );
    expect(proposal.description).toBe(
      "# Constitutional AIP: ArbOS61 Elara Upgrade"
    );
    // The payload still only exists in the event, so it stays empty.
    expect(proposal.targets).toEqual([]);
  });

  it("falls back to placeholders when the indexer has no row", async () => {
    vi.mocked(getProposalIndexEntry).mockResolvedValue(null);

    const proposal = await fetchProposalFromGovernor({
      provider,
      governor,
      proposalId: UNMAPPED_PROPOSAL_ID,
    });

    expect(proposal.proposer).toBe("Unknown");
    expect(proposal.description).toBe(`Proposal ${UNMAPPED_PROPOSAL_ID}`);
  });

  it("degrades to placeholders instead of failing when the indexer errors", async () => {
    vi.mocked(getProposalIndexEntry).mockRejectedValue(
      new Error("Governance indexer request failed: 503")
    );

    const proposal = await fetchProposalFromGovernor({
      provider,
      governor,
      proposalId: UNMAPPED_PROPOSAL_ID,
    });

    expect(proposal.proposer).toBe("Unknown");
    expect(proposal.description).toBe(`Proposal ${UNMAPPED_PROPOSAL_ID}`);
    expect(proposal.id).toBe(UNMAPPED_PROPOSAL_ID);
  });
});

describe("fetchProposalFromGovernor with the snapshot anchor", () => {
  // Not in PROPOSAL_CREATION_TX_HASHES_BY_CHAIN_ID and not in the bundled
  // cache, so the anchor is the only thing that can find its payload. Modelled
  // on a Core proposal created past the recent-window scan.
  const ANCHORED_PROPOSAL_ID = "99505320587245662570748490045867467578602";
  const governor = ARBITRUM_GOVERNORS[0];
  // Only the recent-window scan reads the head block, so this is the tell for
  // which lookup ran.
  const getBlockNumber = vi.fn().mockResolvedValue(498_330_716);
  const provider = { getBlockNumber } as never;

  const creationEvent = {
    args: {
      proposalId: ANCHORED_PROPOSAL_ID,
      proposer: "0xb4c064f466931b8d0f637654c916e3f203c46f13",
      targets: ["0xa723c008e76e379c55599d2e4d93879beafda79c"],
      3: ["0"],
      signatures: [""],
      calldatas: ["0xdeadbeef"],
      startBlock: 25547165,
      endBlock: 25566425,
      description: "# [Constitutional] AIP: Security Council Election Process",
    },
    blockNumber: 488_298_708,
    transactionHash:
      "0x1f709032574f9c3986dbda8767f3bb9ff4f9c48cb67529f390dd9fa9b3bf853d",
  };

  beforeEach(() => {
    vi.mocked(getProposalIndexEntry).mockReset().mockResolvedValue(null);
    vi.mocked(getL2BlockRangeForL1Blocks).mockReset();
    getBlockNumber.mockClear();
    governorStub.events = [];
    governorStub.votingDelay = 21600;
  });

  it("derives the creation block from the snapshot and reads the payload there", async () => {
    vi.mocked(getL2BlockRangeForL1Blocks).mockResolvedValue({
      fromBlock: 488_298_441,
      toBlock: 488_298_978,
    });
    governorStub.events = [creationEvent];

    const proposal = await fetchProposalFromGovernor({
      provider,
      governor,
      proposalId: ANCHORED_PROPOSAL_ID,
    });

    // snapshot 25547165 - votingDelay 21600, widened by the drift margin.
    expect(getL2BlockRangeForL1Blocks).toHaveBeenCalledWith({
      provider,
      fromL1Block: 25_525_560,
      toL1Block: 25_525_570,
    });
    expect(proposal.targets).toEqual([
      "0xa723c008e76e379c55599d2e4d93879beafda79c",
    ]);
    expect(proposal.calldatas).toEqual(["0xdeadbeef"]);
    expect(proposal.proposer).toBe(
      "0xb4c064f466931b8d0f637654c916e3f203c46f13"
    );
    // The lifecycle tab needs this hash; without it the stages never render.
    expect(proposal.creationTxHash).toBe(creationEvent.transactionHash);
    // No scan from head was needed to get any of it.
    expect(getBlockNumber).not.toHaveBeenCalled();
  });

  it("falls back to the recent-window scan when the anchor is unavailable", async () => {
    // Stands in for an RPC that does not serve NodeInterface.
    vi.mocked(getL2BlockRangeForL1Blocks).mockResolvedValue(null);
    governorStub.events = [creationEvent];

    const proposal = await fetchProposalFromGovernor({
      provider,
      governor,
      proposalId: ANCHORED_PROPOSAL_ID,
    });

    expect(getBlockNumber).toHaveBeenCalled();
    expect(proposal.creationTxHash).toBe(creationEvent.transactionHash);
  });
});
