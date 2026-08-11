import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CreateProposalForm from "./CreateProposalForm";

/**
 * The snapshot block on this page is an Ethereum block number (Arbitrum One
 * reports the synced L1 block as `block.number`, and that is what the ARB
 * token's checkpoints and the governor's quorum are keyed on). It once linked
 * to Arbiscan, which resolved to an unrelated Arbitrum block roughly 20x
 * further back in time instead of failing. These tests pin the label and the
 * explorer so that cannot come back silently.
 */

const CLOCK_BLOCK = BigInt(23_456_789);
// getProposalSnapshotBlock keeps a few blocks of slack behind the clock.
const SNAPSHOT_BLOCK = 23_456_786;

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useGovernanceClock: vi.fn(),
  useReadContract: vi.fn(),
  useSimulateContract: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
  writeContract: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

// The markdown editor is client-only and irrelevant here.
vi.mock("next/dynamic", () => ({
  default: () =>
    function MDEditorStub() {
      return null;
    },
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useReadContract: mocks.useReadContract,
  useSimulateContract: mocks.useSimulateContract,
  useWaitForTransactionReceipt: mocks.useWaitForTransactionReceipt,
  useWriteContract: mocks.useWriteContract,
}));

vi.mock("@/hooks/use-governance-clock", () => ({
  useGovernanceClock: mocks.useGovernanceClock,
}));

describe("CreateProposalForm snapshot block annotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useGovernanceClock.mockReturnValue({
      clockBlock: CLOCK_BLOCK,
      isLoading: false,
    });
    mocks.useAccount.mockReturnValue({
      address: "0x1111111111111111111111111111111111111111",
      isConnected: true,
    });
    mocks.useReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mocks.useSimulateContract.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isFetching: false,
    });
    mocks.useWriteContract.mockReturnValue({
      error: null,
      isPending: false,
      writeContract: mocks.writeContract,
    });
    mocks.useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
      error: null,
    });
  });

  it("links the snapshot block to Etherscan, not Arbiscan", () => {
    const markup = renderToStaticMarkup(<CreateProposalForm />);

    expect(markup).toContain(`https://etherscan.io/block/${SNAPSHOT_BLOCK}`);
    expect(markup).not.toContain(`arbiscan.io/block/`);
  });

  it("names Ethereum as the chain the figures are read at", () => {
    const markup = renderToStaticMarkup(<CreateProposalForm />);

    expect(markup).toContain("Values at Ethereum block #");
    expect(markup).toContain("Quorum at Ethereum block #");
    // Same default locale as the component's own `toLocaleString()` call.
    expect(markup).toContain(SNAPSHOT_BLOCK.toLocaleString());
  });

  it("shows no block reference while the governance clock is unknown", () => {
    mocks.useGovernanceClock.mockReturnValue({
      clockBlock: null,
      isLoading: true,
    });

    const markup = renderToStaticMarkup(<CreateProposalForm />);

    expect(markup).not.toContain("etherscan.io/block/");
    expect(markup).toContain("Values at Ethereum block #?");
  });
});
