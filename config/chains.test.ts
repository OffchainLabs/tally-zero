import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isL1VotingChainId,
  l1VotingChainId,
  l1VotingChainIds,
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

  it("recognizes L1 voting chain ids in either form", () => {
    expect(isL1VotingChainId(1)).toBe(true);
    expect(isL1VotingChainId("1", false)).toBe(true);
    expect(isL1VotingChainId("1337", true)).toBe(true);
    expect(isL1VotingChainId(42161)).toBe(false);
    expect(isL1VotingChainId(undefined)).toBe(false);
  });

  it("accepts the local L1 only while the local chains are on", () => {
    expect(l1VotingChainIds(false)).toEqual([1]);
    expect(isL1VotingChainId(1337, false)).toBe(false);
    expect(l1VotingChainIds(true)).toEqual([1, LOCAL_L1_CHAIN_ID]);
  });
});

// The no-argument forms are what production calls (lib/appkit.ts, the wagmi
// transports), so the flag itself is what keeps the testnode out of a build.
describe("NEXT_PUBLIC_LOCAL_CHAINS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function chainsWithFlag(value: string | undefined) {
    vi.stubEnv("NEXT_PUBLIC_LOCAL_CHAINS", value);
    vi.resetModules();
    return import("./chains");
  }

  it.each([undefined, "0", "", "true"])(
    "leaves the local chains off for %j",
    async (value) => {
      const chains = await chainsWithFlag(value);

      expect(chains.isLocalChainsEnabled()).toBe(false);
      expect(chains.localChains()).toEqual([]);
      expect(chains.l1VotingChainId()).toBe(1);
      expect(chains.l2ChainId()).toBe(42161);
      expect(chains.isL1VotingChainId(LOCAL_L1_CHAIN_ID)).toBe(false);
    }
  );

  it('turns them on only for "1"', async () => {
    const chains = await chainsWithFlag("1");

    expect(chains.isLocalChainsEnabled()).toBe(true);
    expect(chains.localChains().map((chain) => chain.id)).toEqual([
      LOCAL_L1_CHAIN_ID,
      LOCAL_L2_CHAIN_ID,
    ]);
    expect(chains.l1VotingChainId()).toBe(LOCAL_L1_CHAIN_ID);
    expect(chains.l2ChainId()).toBe(LOCAL_L2_CHAIN_ID);
    expect(chains.isL1VotingChainId(LOCAL_L1_CHAIN_ID)).toBe(true);
  });
});
