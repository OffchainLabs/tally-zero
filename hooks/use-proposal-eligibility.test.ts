import { keepPreviousData } from "@tanstack/react-query";
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
const SAFE = "0x2222222222222222222222222222222222222222";

interface ReadContractConfig {
  address: string;
  functionName: string;
  args?: ReadonlyArray<unknown>;
  chainId?: number;
  query?: { enabled?: boolean; placeholderData?: unknown };
}

function Probe({
  governorType,
  address,
}: {
  governorType: GovernorType;
  address?: string | null;
}) {
  const {
    eligibility,
    votingPower,
    proposalThreshold,
    snapshotBlock,
    isLoading,
    isError,
  } = useProposalEligibility(
    governorType,
    address === undefined ? undefined : { address }
  );

  return createElement("span", {
    "data-eligibility": eligibility,
    "data-voting-power": String(votingPower),
    "data-threshold": String(proposalThreshold),
    "data-snapshot": String(snapshotBlock),
    "data-loading": String(isLoading),
    "data-error": String(isError),
  });
}

/**
 * Answers each read by function name, the way the form's tests do. A read
 * with no value is loading unless named in `failed`, in which case it has
 * settled in error.
 */
function reads({
  votingPower,
  threshold,
  failed = [],
}: {
  votingPower?: bigint;
  threshold?: bigint;
  failed?: Array<"votingPower" | "threshold">;
}) {
  mocks.useReadContract.mockImplementation((config: ReadContractConfig) => {
    const isThreshold = config.functionName === "proposalThreshold";
    const data = isThreshold ? threshold : votingPower;
    const isError = failed.includes(isThreshold ? "threshold" : "votingPower");
    return {
      data,
      isLoading: data === undefined && !isError,
      isError,
      refetch: vi.fn(),
    };
  });
}

function render(
  governorType: GovernorType = "treasury",
  address?: string | null
) {
  const markup = renderToStaticMarkup(
    createElement(Probe, { governorType, address })
  );
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
    // Keeps the last figure while the clock moves the snapshot block.
    expect(votingPowerRead.query?.placeholderData).toBe(keepPreviousData);

    expect(thresholdRead.address).toBe(GOVERNORS.core.address);
    expect(thresholdRead.chainId).toBe(ARBITRUM_CHAIN_ID);
  });

  // The drafts dialog and list gate on the SIWE subject (the Safe when acting
  // as one), which is not the wallet that signed in.
  it("measures the given address instead of the connected wallet", () => {
    const { votingPowerRead } = render("treasury", SAFE);

    expect(votingPowerRead.args?.[0]).toBe(SAFE);
    expect(votingPowerRead.query?.enabled).toBe(true);
  });

  it("falls back to the wallet when the given address is null", () => {
    expect(render("treasury", null).votingPowerRead.args?.[0]).toBe(WALLET);
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
    expect(markup).toContain('data-error="false"');
  });

  // A failed threshold read has no refetch interval, so without this flag the
  // callers would report "checking" for as long as the tab stays focused.
  it("is unknown, settled, and in error when the threshold read failed", () => {
    reads({ votingPower: BigInt(100), failed: ["threshold"] });

    const { markup } = render();

    expect(markup).toContain('data-eligibility="unknown"');
    expect(markup).toContain('data-loading="false"');
    expect(markup).toContain('data-error="true"');
  });

  it("is not in error while a failed voting-power read still shows its last value", () => {
    reads({
      votingPower: BigInt(100),
      threshold: BigInt(100),
      failed: ["votingPower"],
    });

    const { markup } = render();

    expect(markup).toContain('data-eligibility="meets"');
    expect(markup).toContain('data-error="false"');
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
