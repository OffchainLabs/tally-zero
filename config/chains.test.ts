import { describe, expect, it } from "vitest";

import {
  isL1VotingChainId,
  l1VotingChainId,
  l2ChainId,
  LOCAL_L1_CHAIN_ID,
  LOCAL_L2_CHAIN_ID,
  localChains,
} from "./chains";

describe("chain roles", () => {
  it("uses Ethereum and Arbitrum One when local chains are off", () => {
    expect(l1VotingChainId(false)).toBe(1);
    expect(l2ChainId(false)).toBe(42161);
    expect(localChains(false)).toEqual([]);
  });

  it("uses the testnode pair when local chains are on", () => {
    expect(l1VotingChainId(true)).toBe(LOCAL_L1_CHAIN_ID);
    expect(l2ChainId(true)).toBe(LOCAL_L2_CHAIN_ID);
    expect(localChains(true).map((chain) => chain.id)).toEqual([1337, 412346]);
  });

  it("defaults to production when the flag is unset", () => {
    expect(l1VotingChainId()).toBe(1);
    expect(l2ChainId()).toBe(42161);
  });

  it("recognizes L1 voting chain ids in either form", () => {
    expect(isL1VotingChainId(1)).toBe(true);
    expect(isL1VotingChainId("1337")).toBe(true);
    expect(isL1VotingChainId(42161)).toBe(false);
    expect(isL1VotingChainId(undefined)).toBe(false);
  });
});
