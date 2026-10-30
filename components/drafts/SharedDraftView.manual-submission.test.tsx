// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { TransactionReceiptNotFoundError } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOVERNORS } from "@/config/governors";
import {
  governor as GOVERNOR,
  proposalId as PROPOSAL_ID,
  receipt,
  txHash as TX,
} from "@/lib/drafts/submission-fixtures";

import { SharedDraftView } from "./SharedDraftView";

// The signed-in reviewer, not the author. The governor itself is the draft's.
const REVIEWER = `0x${"33".repeat(20)}`;
const mocks = vi.hoisted(() => ({
  markSubmitted: vi.fn(),
  error: null as Error | null,
  // What the chain says about the typed hash. Defaults to this draft's own
  // ProposalCreated so the format tests exercise only the inputs.
  useTransactionReceipt: vi.fn(),
  refetchReceipt: vi.fn(),
}));
vi.mock("@/hooks/use-drafts", async () => {
  const { draft } = await import("@/lib/drafts/submission-fixtures");
  return {
    useSharedDraft: () => ({ data: draft, isLoading: false, error: null }),
    useMarkSubmitted: () => ({
      markSubmitted: mocks.markSubmitted,
      isSubmitting: false,
      error: mocks.error,
    }),
  };
});
vi.mock("@/hooks/use-siwe", () => ({
  useSiwe: () => ({ effectiveAddress: REVIEWER }),
}));
vi.mock("@/components/siwe/SiweGate", () => ({
  SiweGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("wagmi", () => ({
  useTransactionReceipt: mocks.useTransactionReceipt,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function chainSays(
  result: { data?: unknown; error?: Error } = { data: receipt() }
) {
  mocks.useTransactionReceipt.mockReturnValue({
    data: result.data,
    error: result.error ?? null,
    refetch: mocks.refetchReceipt,
  });
}

function fill(
  view: ReturnType<typeof render>,
  tx: string = TX,
  id: string = PROPOSAL_ID
) {
  for (const [label, value] of [
    ["Transaction hash", tx],
    ["Proposal id", id],
  ]) {
    fireEvent.change(view.getByLabelText(label), { target: { value } });
  }
}

function submitButton(view: ReturnType<typeof render>) {
  return view.getByRole("button", {
    name: "Mark as submitted",
  }) as HTMLButtonElement;
}

describe("SharedDraftView manual submission", () => {
  beforeEach(() => {
    mocks.error = null;
    mocks.markSubmitted.mockReset().mockResolvedValue(undefined);
    mocks.refetchReceipt.mockReset();
    chainSays();
  });
  afterEach(cleanup);

  it("says any signed-in wallet may record, permanently", () => {
    const view = render(<SharedDraftView slug="abc123" />);
    expect(view.container.textContent).toContain(
      "Any signed-in wallet may record this, not only the author, and the record is permanent."
    );
  });

  it.each([
    ["empty hash", "", PROPOSAL_ID],
    ["short hash", "0xabc", PROPOSAL_ID],
    // viem's isHash accepts 63 digits; the server would store it.
    ["one-digit-short hash", TX.slice(0, -1), PROPOSAL_ID],
    ["nonhex hash", `0x${"gg".repeat(32)}`, PROPOSAL_ID],
    ["empty id", TX, ""],
    ["hex id", TX, "0x2a"],
    ["negative id", TX, "-42"],
    ["fractional id", TX, "4.2"],
    ["exponent id", TX, "4e2"],
  ])("blocks recording with %s", async (_name, tx, id) => {
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view, tx, id);
    const button = submitButton(view);
    expect(button.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
  });

  it("reads the receipt only once the hash is well-formed", () => {
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view, TX.slice(0, -1));
    expect(mocks.useTransactionReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ hash: undefined })
    );
    expect(view.queryByTestId("draft-receipt-status")).toBeNull();
    fill(view, ` ${TX} `);
    expect(mocks.useTransactionReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ hash: TX, chainId: 42161 })
    );
  });

  it("holds submit while the receipt is still being read", () => {
    chainSays({ data: undefined });
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view);
    expect(view.getByTestId("draft-receipt-status").textContent).toBe(
      "Checking the transaction…"
    );
    expect(submitButton(view).disabled).toBe(true);
  });

  it("says when no receipt exists yet and offers a retry", () => {
    chainSays({ error: new TransactionReceiptNotFoundError({ hash: TX }) });
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view);
    expect(view.getByTestId("draft-receipt-status").textContent).toContain(
      "No receipt found for this hash yet"
    );
    expect(submitButton(view).disabled).toBe(true);
    fireEvent.click(view.getByTestId("draft-receipt-retry"));
    expect(mocks.refetchReceipt).toHaveBeenCalledTimes(1);
  });

  it("shows a read error with a retry and no RPC detail", () => {
    const failure = new Error("HTTP request failed: https://rpc.example");
    chainSays({ error: failure });
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view);
    expect(view.getByTestId("draft-receipt-status").textContent).toBe(
      "Could not read this transaction."
    );
    expect(view.container.textContent).not.toContain(failure.message);
    expect(submitButton(view).disabled).toBe(true);
    fireEvent.click(view.getByTestId("draft-receipt-retry"));
    expect(mocks.refetchReceipt).toHaveBeenCalledTimes(1);
  });

  it("blocks a reverted transaction", () => {
    chainSays({ data: receipt({ status: "reverted" }) });
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view);
    expect(view.getByTestId("draft-receipt-status").textContent).toBe(
      "This transaction reverted, so it created no proposal."
    );
    expect(submitButton(view).disabled).toBe(true);
    expect(view.queryByTestId("draft-receipt-retry")).toBeNull();
  });

  it("blocks a transaction that created a different proposal", () => {
    chainSays({ data: receipt({ eventProposalId: "7" }) });
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view, TX, "7");
    expect(view.getByTestId("draft-receipt-status").textContent).toBe(
      "This transaction created a different proposal than this draft. Check the hash."
    );
    expect(submitButton(view).disabled).toBe(true);
  });

  it("blocks a transaction with no ProposalCreated from a known governor", () => {
    chainSays({
      data: receipt({ address: `0x${"44".repeat(20)}` }),
    });
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view);
    expect(view.getByTestId("draft-receipt-status").textContent).toBe(
      `No ProposalCreated event from the ${GOVERNORS.treasury.name} was found in this transaction.`
    );
    expect(submitButton(view).disabled).toBe(true);
  });

  // The receipt is right and the draft matches; only the typed id is off.
  it("blocks a mistyped proposal id and names the one in the receipt", async () => {
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view, TX, "42");
    expect(view.getByTestId("draft-receipt-status").textContent).toBe(
      `This transaction created proposal ${PROPOSAL_ID}, not the id entered. Check the proposal id.`
    );
    const button = submitButton(view);
    expect(button.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
  });

  it("trims valid fields and preserves a large decimal proposal id", async () => {
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view, ` ${TX} `, ` ${PROPOSAL_ID} `);
    expect(view.queryByTestId("draft-receipt-status")).toBeNull();
    const button = submitButton(view);
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith({
      transactionHash: TX,
      governorAddress: GOVERNOR,
      proposalId: PROPOSAL_ID,
    });
  });

  it("shows generic rejection feedback, retains values, and allows retry", async () => {
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view);
    const rejection = new Error("Private upstream recording failure");
    mocks.markSubmitted.mockImplementationOnce(async () => {
      mocks.error = rejection;
      throw rejection;
    });
    const button = submitButton(view);
    await act(async () => {
      fireEvent.click(button);
    });
    view.rerender(<SharedDraftView slug="abc123" />);
    expect(view.getByTestId("draft-submit-error").textContent).toBe(
      "Could not record this submission. Please try again."
    );
    expect(view.container.textContent).not.toContain(rejection.message);
    for (const [label, value] of [
      ["Transaction hash", TX],
      ["Proposal id", PROPOSAL_ID],
    ]) {
      expect((view.getByLabelText(label) as HTMLInputElement).value).toBe(
        value
      );
    }
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mocks.markSubmitted).toHaveBeenCalledTimes(2);
    expect(mocks.markSubmitted).toHaveBeenLastCalledWith({
      transactionHash: TX,
      governorAddress: GOVERNOR,
      proposalId: PROPOSAL_ID,
    });
  });
});
