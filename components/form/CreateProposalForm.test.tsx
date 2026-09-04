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

  // The server-drafts feature reaches the form through two optional props and
  // nothing else, so these pin what each one is given and does on first render.
  describe("server draft props", () => {
    const TARGET = "0x2222222222222222222222222222222222222222";

    const restored = {
      title: "Stored draft",
      description: "# Stored\n\nbody",
      governorType: "core" as const,
      actions: [
        { id: "restored-0", target: TARGET, value: "5", calldata: "0x" },
      ],
    };

    // Radix renders the radio as a button; the checked one carries aria-checked.
    const governorRadio = (markup: string, type: string) =>
      markup.match(new RegExp(`<button[^>]*id="gov-${type}"[^>]*>`))?.[0] ?? "";

    it("defaults to the treasury governor and one blank action without a draft", () => {
      const markup = renderToStaticMarkup(<CreateProposalForm />);

      expect(governorRadio(markup, "treasury")).toContain(
        'aria-checked="true"'
      );
      expect(governorRadio(markup, "core")).toContain('aria-checked="false"');
      expect(markup).not.toContain(TARGET);
    });

    it("seeds governor and actions from initialDraft", () => {
      const markup = renderToStaticMarkup(
        <CreateProposalForm initialDraft={restored} />
      );

      expect(governorRadio(markup, "core")).toContain('aria-checked="true"');
      expect(governorRadio(markup, "treasury")).toContain(
        'aria-checked="false"'
      );
      expect(markup).toContain(`value="${TARGET}"`);
    });

    // Local autosave is suspended while editing a stored draft, so the button
    // that writes to it would appear to work and do nothing. The server draft's
    // own save button (via renderDraftActions) takes its place.
    it("hides the local Save draft button when opened on a stored draft", () => {
      const plain = renderToStaticMarkup(<CreateProposalForm />);
      const onDraft = renderToStaticMarkup(
        <CreateProposalForm initialDraft={restored} />
      );

      expect(plain).toContain(">Save draft</button>");
      expect(onDraft).not.toContain(">Save draft</button>");
    });

    it("hands renderDraftActions the live form snapshot and renders its output", () => {
      const seen: unknown[] = [];
      const markup = renderToStaticMarkup(
        <CreateProposalForm
          initialDraft={restored}
          renderDraftActions={(snapshot) => {
            seen.push(snapshot);
            return <span data-testid="draft-actions-probe" />;
          }}
        />
      );

      expect(markup).toContain('data-testid="draft-actions-probe"');
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        governorType: "core",
        description: restored.description,
        actions: [{ target: TARGET, value: "5", calldata: "0x" }],
      });
    });
  });
});
