import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARB_TOKEN, ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS, type GovernorType } from "@/config/governors";

import { useProposalEligibility } from "./use-proposal-eligibility";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useReadContract: vi.fn(),
  useGovernanceClock: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useReadContract: mocks.useReadContract,
}));

vi.mock("@/hooks/use-governance-clock", () => ({
  useGovernanceClock: mocks.useGovernanceClock,
}));

const WALLET = "0x1111111111111111111111111111111111111111";

interface ReadContractConfig {
  address: string;
  functionName: string;
  args?: ReadonlyArray<unknown>;
  chainId?: number;
  query?: { enabled?: boolean };
}

function Probe({ governorType }: { governorType: GovernorType }) {
  const {
    eligibility,
    votingPower,
    proposalThreshold,
    snapshotBlock,
    isLoading,
  } = useProposalEligibility(governorType);

  return createElement("span", {
    "data-eligibility": eligibility,
    "data-voting-power": String(votingPower),
    "data-threshold": String(proposalThreshold),
    "data-snapshot": String(snapshotBlock),
    "data-loading": String(isLoading),
  });
}

/** Answers each read by function name, the way the form's tests do. */
function reads({
  votingPower,
  threshold,
}: {
  votingPower?: bigint;
  threshold?: bigint;
}) {
  mocks.useReadContract.mockImplementation((config: ReadContractConfig) => {
    const data =
      config.functionName === "proposalThreshold" ? threshold : votingPower;
    return { data, isLoading: data === undefined };
  });
}

function render(governorType: GovernorType = "treasury") {
  const markup = renderToStaticMarkup(createElement(Probe, { governorType }));
  const configs = mocks.useReadContract.mock.calls.map(
    ([config]) => config as ReadContractConfig
  );
  return {
    markup,
    votingPowerRead: configs.find(
      (c) => c.functionName !== "proposalThreshold"
    )!,
    thresholdRead: configs.find((c) => c.functionName === "proposalThreshold")!,
  };
}

describe("useProposalEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAccount.mockReturnValue({ address: WALLET, isConnected: true });
    mocks.useGovernanceClock.mockReturnValue({
      clockBlock: BigInt(1_000_000),
      isLoading: false,
    });
    reads({ votingPower: BigInt(100), threshold: BigInt(100) });
  });

  it("reads the wallet's ARB votes at the snapshot block and the governor's threshold", () => {
    const { votingPowerRead, thresholdRead, markup } = render("core");

    expect(votingPowerRead.address).toBe(ARB_TOKEN.address);
    expect(votingPowerRead.args?.[0]).toBe(WALLET);
    // The clock less the lookback, and reported so callers can show it.
    expect(markup).toMatch(/data-snapshot="\d+"/);
    expect(String(votingPowerRead.args?.[1])).toBe(
      markup.match(/data-snapshot="(\d+)"/)![1]
    );
    expect(votingPowerRead.query?.enabled).toBe(true);

    expect(thresholdRead.address).toBe(GOVERNORS.core.address);
    expect(thresholdRead.chainId).toBe(ARBITRUM_CHAIN_ID);
  });

  it("meets the threshold at exactly the threshold", () => {
    const { markup } = render();

    expect(markup).toContain('data-eligibility="meets"');
    expect(markup).toContain('data-loading="false"');
  });

  it("is below the threshold with less voting power", () => {
    reads({ votingPower: BigInt(99), threshold: BigInt(100) });

    expect(render().markup).toContain('data-eligibility="below"');
  });

  it("is unknown, and loading, until both reads have settled", () => {
    reads({ votingPower: BigInt(100) });

    const { markup } = render();

    expect(markup).toContain('data-eligibility="unknown"');
    expect(markup).toContain('data-loading="true"');
  });

  it("does not read voting power without a wallet or a clock", () => {
    mocks.useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    expect(render().votingPowerRead.query?.enabled).toBe(false);

    mocks.useAccount.mockReturnValue({ address: WALLET, isConnected: true });
    mocks.useGovernanceClock.mockReturnValue({
      clockBlock: null,
      isLoading: true,
    });
    const { votingPowerRead, markup } = render();
    expect(votingPowerRead.query?.enabled).toBe(false);
    expect(markup).toContain('data-snapshot="undefined"');
  });
});
