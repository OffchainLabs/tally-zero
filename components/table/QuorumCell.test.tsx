import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Address } from "viem";

import type { ParsedProposal } from "@/types/proposal";

const useQuery = vi.fn(() => ({ data: undefined, isLoading: false }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQuery(...(args as [])),
}));
vi.mock("@/hooks/use-in-view", () => ({
  useInView: () => [{ current: null }, true],
}));
vi.mock("@/hooks/use-rpc-settings", () => ({
  useRpcSettings: () => ({ l2Rpc: "https://arb1.example" }),
}));
vi.mock("@/lib/governor-search", () => ({
  fetchProposalQuorum: vi.fn(),
}));

const { QuorumCell } = await import("./QuorumCell");

// 12.57M ARB of for-votes, in 18-decimal wei
const FOR_VOTES = "12570000000000000000000000";

const makeProposal = (overrides: Partial<ParsedProposal>): ParsedProposal => ({
  id: "9950",
  contractAddress: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9" as Address,
  proposer: "0x0000000000000000000000000000000000000001",
  targets: [],
  values: [],
  signatures: [],
  calldatas: [],
  startBlock: "25547165",
  endBlock: "25647165",
  description: "A proposal",
  networkId: "42161",
  state: "Executed",
  ...overrides,
});

describe("QuorumCell", () => {
  beforeEach(() => {
    useQuery.mockClear();
    useQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  // The live vote-update patch writes quorum: "0" when it has nothing to carry
  // over, and "0" is truthy. Read as a real requirement it renders a 0% bar on
  // a proposal that by definition cleared quorum.
  it('ignores the "0" quorum sentinel on an executed proposal', () => {
    const markup = renderToStaticMarkup(
      <QuorumCell
        proposal={makeProposal({
          votes: {
            forVotes: FOR_VOTES,
            againstVotes: "0",
            abstainVotes: "0",
            quorum: "0",
          },
        })}
      />
    );

    expect(markup).toContain("100%");
    expect(markup).not.toContain(" / ");
  });

  it("shows the counts on an executed proposal with a real quorum", () => {
    const markup = renderToStaticMarkup(
      <QuorumCell
        proposal={makeProposal({
          votes: {
            forVotes: FOR_VOTES,
            againstVotes: "0",
            abstainVotes: "0",
            quorum: "9000000000000000000000000",
          },
        })}
      />
    );

    expect(markup).toContain("100%");
    expect(markup).toContain("12.6M / 9M");
  });

  it("still fetches the quorum when the sentinel is all a live row has", () => {
    renderToStaticMarkup(
      <QuorumCell
        proposal={makeProposal({
          state: "Active",
          votes: {
            forVotes: FOR_VOTES,
            againstVotes: "0",
            abstainVotes: "0",
            quorum: "0",
          },
        })}
      />
    );

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    );
  });
});
