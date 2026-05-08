import { describe, expect, it } from "vitest";

import type { TallyDelegateVote } from "@/lib/tally-data/types";

import { findCachedUserVote } from "./use-user-vote";

const votes: TallyDelegateVote[] = [
  {
    proposalId: "1",
    governorAddress: "0x1111111111111111111111111111111111111111",
    support: 1,
    weight: "100",
    blockNumber: 10,
  },
  {
    proposalId: "2",
    governorAddress: "0x2222222222222222222222222222222222222222",
    support: 0,
    weight: "250",
    blockNumber: 20,
  },
];

describe("findCachedUserVote", () => {
  it("finds a cached vote by proposal and governor", () => {
    expect(
      findCachedUserVote({
        votes,
        proposalId: "1",
        governorAddress: "0x1111111111111111111111111111111111111111",
      })
    ).toEqual({
      support: 1,
      weight: "100",
    });
  });

  it("matches governor addresses case-insensitively", () => {
    expect(
      findCachedUserVote({
        votes,
        proposalId: "2",
        governorAddress:
          "0x2222222222222222222222222222222222222222".toUpperCase(),
      })
    ).toEqual({
      support: 0,
      weight: "250",
    });
  });

  it("returns null when the cached vote is for another proposal or governor", () => {
    expect(
      findCachedUserVote({
        votes,
        proposalId: "3",
        governorAddress: "0x1111111111111111111111111111111111111111",
      })
    ).toBeNull();
    expect(
      findCachedUserVote({
        votes,
        proposalId: "1",
        governorAddress: "0x2222222222222222222222222222222222222222",
      })
    ).toBeNull();
  });
});
