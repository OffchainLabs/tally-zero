import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_GOVERNORS } from "@/config/arbitrum-governance";
import { getProposalIndexEntry } from "@/lib/delegate-cache";
import type { TallyProposalIndexEntry } from "@/lib/tally-data/types";

import {
  fetchProposalFromGovernor,
  resolveProposalMetadataFallback,
} from "./use-proposal-by-id";

// Mock ethers so the governor reads resolve without a real contract. Every stub
// below drives the no-creation-event path: queryFilter returns no events, so
// fetchProposalFromGovernor has to fall back to indexer metadata.
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
        filters: { ProposalCreated: vi.fn().mockReturnValue({}) },
        queryFilter: vi.fn().mockResolvedValue([]),
      };
    },
  },
}));

vi.mock("@/lib/delegate-cache", () => ({
  getProposalIndexEntry: vi.fn(),
}));

vi.mock("@/lib/bundled-cache-loader", () => ({
  getBundledProposalCreationTxHash: vi.fn().mockResolvedValue(null),
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
