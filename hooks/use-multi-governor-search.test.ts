import { describe, expect, it } from "vitest";

import { getStateName } from "@/lib/state-utils";
import type { ParsedProposal } from "@/types/proposal";

import {
  applyGapScan,
  applyStateRefresh,
  type ProposalSearchData,
} from "./use-multi-governor-search";

const CORE_GOVERNOR = "0xf07ded9dc292157749b6fd268e37df6ea38395b9";

function makeProposal(
  overrides: Partial<ParsedProposal> & Pick<ParsedProposal, "id">
): ParsedProposal {
  return {
    contractAddress: CORE_GOVERNOR as ParsedProposal["contractAddress"],
    proposer: "0xb4c064f466931b8d0f637654c916e3f203c46f13",
    targets: [],
    values: [],
    signatures: [],
    calldatas: [],
    startBlock: "25547165",
    endBlock: "0",
    description: "Constitutional AIP: ArbOS61 Elara Upgrade",
    networkId: "42161",
    state: "Defeated",
    governorName: "Core Governor",
    ...overrides,
  };
}

function makeSearchData(proposals: ParsedProposal[]): ProposalSearchData {
  return {
    proposals,
    sourceInfo: {
      indexerAvailable: true,
      indexedCount: proposals.length,
      rpcFreshCount: 0,
      watermarkBlock: 489_000_000,
      statesRefreshed: false,
      reconciled: false,
    },
  };
}

describe("applyStateRefresh", () => {
  // The indexer computes the deadline from the ProposalCreated event's
  // scheduled endBlock, so a proposal whose voting period was extended from 7
  // to 9 days by a late-quorum extension is reported DEFEATED while the
  // governor still answers Active. The chain has to win.
  it("corrects an indexed Defeated proposal that is still Active on-chain", () => {
    const indexed = makeProposal({ id: "7191", state: "Defeated" });
    const prev = makeSearchData([indexed]);

    // getStateName lowercases, exactly as refreshProposalStates delivers it
    const refreshed = makeProposal({
      id: "7191",
      state: getStateName(1),
      votes: {
        forVotes: "195229232998992116209066298",
        againstVotes: "3999545379240031141",
        abstainVotes: "8142170794210779271978751",
        quorum: "187371057739679268298914583",
      },
    });

    const next = applyStateRefresh(prev, [refreshed]);

    expect(next.proposals[0].state).toBe("Active");
    // The scan half of the pass has not landed, and does not need to for a
    // status to be shown: statesRefreshed is what un-withholds these rows.
    expect(next.sourceInfo.statesRefreshed).toBe(true);
    expect(next.sourceInfo.reconciled).toBe(false);
  });

  it("sorts a corrected proposal ahead of settled ones", () => {
    const prev = makeSearchData([
      makeProposal({
        id: "executed",
        state: "Executed",
        startBlock: "25999999",
      }),
      makeProposal({ id: "7191", state: "Defeated", startBlock: "25547165" }),
    ]);

    const next = applyStateRefresh(prev, [
      makeProposal({ id: "7191", state: getStateName(1) }),
    ]);

    // sortProposals compares against the capitalized "Active", so a lowercase
    // state from the RPC path would leave this row buried below Executed rows.
    expect(next.proposals.map((proposal) => proposal.id)).toEqual([
      "7191",
      "executed",
    ]);
  });

  it("keeps the indexed state when the governor confirms Defeated", () => {
    const prev = makeSearchData([
      makeProposal({ id: "7191", state: "Defeated" }),
    ]);

    const next = applyStateRefresh(prev, [
      makeProposal({ id: "7191", state: getStateName(3) }),
    ]);

    expect(next.proposals[0].state).toBe("Defeated");
  });

  it("leaves the indexed state alone when the refresh could not read the chain", () => {
    // refreshProposalStates returns the cached proposal untouched on RPC error
    const indexed = makeProposal({ id: "7191", state: "Defeated" });
    const prev = makeSearchData([indexed]);

    const next = applyStateRefresh(prev, [indexed]);

    expect(next.proposals[0].state).toBe("Defeated");
  });

  it("returns the previous data unchanged once nothing differs", () => {
    const indexed = makeProposal({ id: "7191", state: "Defeated" });
    const prev: ProposalSearchData = {
      ...makeSearchData([indexed]),
      sourceInfo: {
        ...makeSearchData([indexed]).sourceInfo,
        statesRefreshed: true,
      },
    };

    const next = applyStateRefresh(prev, [indexed]);

    // Referential equality matters: a new object would re-run the effect that
    // wrote it, and each re-run costs another round of governor calls.
    expect(next).toBe(prev);
  });
});

describe("applyGapScan", () => {
  it("counts gap-scanned proposals as fresh and canonicalizes their state", () => {
    const prev = makeSearchData([
      makeProposal({ id: "7191", state: "Defeated" }),
    ]);

    const next = applyGapScan(prev, {
      gapProposals: [
        makeProposal({
          id: "brand-new",
          state: getStateName(0),
          description: "A proposal the indexer has not seen yet",
        }),
      ],
      scanStartBlock: 489_000_001,
      currentBlock: 489_679_793,
      watermarkBlock: 489_000_000,
    });

    expect(next.sourceInfo.rpcFreshCount).toBe(1);
    expect(next.proposals.find((p) => p.id === "brand-new")?.state).toBe(
      "Pending"
    );
    expect(next.sourceInfo.rangeInfo).toContain("RPC scan");
    expect(next.sourceInfo.reconciled).toBe(true);
  });

  // The scan is what supplies creation transaction hashes, so a Core proposal
  // waiting to be traced stays withheld until this half lands, even though the
  // governor answered earlier.
  it("carries the creation transaction hash onto an existing row", () => {
    const prev = makeSearchData([
      makeProposal({ id: "9950", state: "Executed" }),
    ]);

    const next = applyGapScan(prev, {
      gapProposals: [
        makeProposal({
          id: "9950",
          state: getStateName(7),
          creationTxHash: "0x1f70",
        }),
      ],
      scanStartBlock: 472_314_630,
      currentBlock: 498_234_630,
      watermarkBlock: 489_000_000,
    });

    expect(next.proposals[0].creationTxHash).toBe("0x1f70");
    // Already known to the indexer, so not a new proposal
    expect(next.sourceInfo.rpcFreshCount).toBe(0);
  });
});
