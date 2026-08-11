import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { arbitrum } from "viem/chains";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";

import { useGovernanceClock } from "./use-governance-clock";

const mocks = vi.hoisted(() => ({
  useReadContract: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useReadContract: mocks.useReadContract,
}));

interface ReadContractConfig {
  address: string;
  abi: ReadonlyArray<{
    type: string;
    name: string;
    stateMutability: string;
    inputs: ReadonlyArray<unknown>;
    outputs: ReadonlyArray<{ type: string }>;
  }>;
  functionName: string;
  chainId: number;
  query: { refetchInterval: number; staleTime: number };
}

/** Renders the hook's result into attributes so it can be asserted on. */
function Probe() {
  const { clockBlock, isLoading } = useGovernanceClock();

  return createElement("span", {
    "data-clock": String(clockBlock),
    "data-loading": String(isLoading),
  });
}

/**
 * Renders the hook and returns both its output and the config it handed to
 * wagmi, which is the part worth pinning down: the wrong contract, function or
 * chain would all still typecheck.
 */
function renderGovernanceClock() {
  const markup = renderToStaticMarkup(createElement(Probe));

  return {
    markup,
    config: mocks.useReadContract.mock.calls[0][0] as ReadContractConfig,
  };
}

describe("useGovernanceClock", () => {
  beforeEach(() => {
    mocks.useReadContract.mockReset();
    mocks.useReadContract.mockReturnValue({ data: undefined, isPending: true });
  });

  it("reads block.number from Multicall3 on Arbitrum One", () => {
    const { config } = renderGovernanceClock();

    expect(config.address).toBe(arbitrum.contracts.multicall3.address);
    expect(config.functionName).toBe("getBlockNumber");

    const entry = config.abi.find((item) => item.name === "getBlockNumber");
    expect(entry).toMatchObject({
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "uint256" }],
    });
  });

  it("pins the read to Arbitrum One rather than the connected chain", () => {
    // On Arbitrum One, `block.number` is the synced L1 block, which is the
    // clock governance checkpoints against. Read from any other chain (or from
    // whatever chain the wallet happens to be on) the value is meaningless.
    const { config } = renderGovernanceClock();

    expect(config.chainId).toBe(ARBITRUM_CHAIN_ID);
    expect(config.chainId).toBe(arbitrum.id);
  });

  it("polls, and treats the value as fresh until the next poll", () => {
    const { config } = renderGovernanceClock();

    expect(config.query.refetchInterval).toBeGreaterThan(0);
    expect(config.query.staleTime).toBe(config.query.refetchInterval);
  });

  it("reports a null clock while the read is pending", () => {
    // Callers gate their snapshot-derived reads on this, so an absent clock
    // must not surface as 0.
    const { markup } = renderGovernanceClock();

    expect(markup).toContain('data-clock="null"');
    expect(markup).toContain('data-loading="true"');
  });

  it("reports a null clock when the read returns no result", () => {
    mocks.useReadContract.mockReturnValue({
      data: undefined,
      isPending: false,
    });

    const { markup } = renderGovernanceClock();

    expect(markup).toContain('data-clock="null"');
    expect(markup).toContain('data-loading="false"');
  });

  it("exposes the block number once the read resolves", () => {
    mocks.useReadContract.mockReturnValue({
      data: BigInt(23_456_789),
      isPending: false,
    });

    const { markup } = renderGovernanceClock();

    expect(markup).toContain('data-clock="23456789"');
    expect(markup).toContain('data-loading="false"');
  });
});
