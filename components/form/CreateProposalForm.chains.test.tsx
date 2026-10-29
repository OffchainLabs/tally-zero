// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADDRESSES } from "@gzeoneth/gov-tracker";

import type { ProposalFormSnapshot } from "@/lib/drafts/mapping";

import CreateProposalForm from "./CreateProposalForm";
import { installStorage, stored } from "./CreateProposalForm.test-helpers";

/**
 * The per-action chain control and what it does to the proposal. The Core
 * Governor routes every row through the L1 timelock, so the simulated
 * `propose()` must carry the single ArbSys action rather than the rows; the
 * Treasury Governor runs rows on Arbitrum One and shows no control at all.
 */

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useGovernanceClock: vi.fn(),
  useReadContract: vi.fn(),
  useSimulateContract: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
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

const novaDraft = {
  ...stored,
  actions: [{ ...stored.actions[0], chain: "nova" as const }],
};

function lastSimulateArgs(): readonly unknown[] | undefined {
  const call = mocks.useSimulateContract.mock.calls.at(-1)?.[0] as
    | { args?: readonly unknown[] }
    | undefined;
  return call?.args;
}

describe("CreateProposalForm action chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installStorage();
    mocks.useGovernanceClock.mockReturnValue({
      clockBlock: BigInt(23_456_789),
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
      writeContractAsync: vi.fn(),
    });
    mocks.useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("offers a chain per action for the Core Governor", () => {
    const view = render(<CreateProposalForm initialDraft={novaDraft} />);

    const trigger = view.getByLabelText("Chain for action 1");
    expect(trigger.textContent).toContain("Arbitrum Nova");
    expect(view.container.textContent).toContain(
      "Submitted as one call to ArbSys that schedules this operation"
    );
  });

  it("simulates the Core proposal as one ArbSys action, not the rows", () => {
    render(<CreateProposalForm initialDraft={novaDraft} />);

    const [targets, values, calldatas] = lastSimulateArgs() as [
      string[],
      bigint[],
      string[],
    ];
    expect(targets.map((t) => t.toLowerCase())).toEqual([
      ADDRESSES.ARB_SYS.toLowerCase(),
    ]);
    expect(values).toEqual([BigInt(0)]);
    // The Nova delayed inbox is inside the scheduled payload.
    expect(calldatas[0].toLowerCase()).toContain(
      ADDRESSES.NOVA_DELAYED_INBOX.slice(2).toLowerCase()
    );
  });

  it("fixes Treasury actions to Arbitrum One and simulates the rows as given", () => {
    const view = render(
      <CreateProposalForm
        initialDraft={{ ...stored, governorType: "treasury" }}
      />
    );

    expect(view.queryByLabelText("Chain for action 1")).toBeNull();
    expect(view.container.textContent).toContain("Arbitrum One");
    const [targets] = lastSimulateArgs() as [string[]];
    expect(targets.map((t) => t.toLowerCase())).toEqual([
      stored.actions[0].target.toLowerCase(),
    ]);
  });

  it("moves other-chain rows to Arbitrum One when switching to Treasury, and says so", () => {
    const seen: ProposalFormSnapshot[] = [];
    const view = render(
      <CreateProposalForm
        initialDraft={novaDraft}
        renderDraftActions={(snapshot) => {
          seen.push(snapshot);
          return null;
        }}
      />
    );

    fireEvent.click(view.getByRole("radio", { name: /Treasury Governor/ }));

    expect(seen.at(-1)?.governorType).toBe("treasury");
    expect(seen.at(-1)?.actions).toMatchObject([{ chain: "arb1" }]);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringContaining("1 action moved to Arbitrum One")
    );
    expect(view.queryByLabelText("Chain for action 1")).toBeNull();
  });
});
