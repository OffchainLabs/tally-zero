import { describe, expect, it } from "vitest";

import type { TallyProposalIndexEntry } from "@/lib/tally-data/types";

import { resolveProposalMetadataFallback } from "./use-proposal-by-id";

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
