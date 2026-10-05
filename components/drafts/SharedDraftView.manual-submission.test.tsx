// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SharedDraftView } from "./SharedDraftView";

const TX = `0x${"ab".repeat(32)}`;
const GOVERNOR = `0x${"33".repeat(20)}`;
const mocks = vi.hoisted(() => ({
  markSubmitted: vi.fn(),
  error: null as Error | null,
}));
vi.mock("@/hooks/use-drafts", () => ({
  useSharedDraft: () => ({
    data: {
      id: "d1",
      author: `0x${"11".repeat(20)}`,
      title: "Draft",
      description: "Plan",
      governorType: "TREASURY",
      actions: [],
      status: "published",
      onchain: null,
      updatedAt: "2026-09-02T00:00:00.000Z",
    },
    isLoading: false,
    error: null,
  }),
  useMarkSubmitted: () => ({
    markSubmitted: mocks.markSubmitted,
    isSubmitting: false,
    error: mocks.error,
  }),
}));
vi.mock("@/hooks/use-siwe", () => ({
  useSiwe: () => ({ effectiveAddress: GOVERNOR }),
}));
vi.mock("@/components/siwe/SiweGate", () => ({
  SiweGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function fill(
  view: ReturnType<typeof render>,
  tx = TX,
  governor = GOVERNOR,
  id = "42"
) {
  for (const [label, value] of [
    ["Transaction hash", tx],
    ["Governor address", governor],
    ["Proposal id", id],
  ]) {
    fireEvent.change(view.getByLabelText(label), { target: { value } });
  }
}

describe("SharedDraftView manual submission", () => {
  beforeEach(() => {
    mocks.error = null;
    mocks.markSubmitted.mockReset().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it.each([
    ["empty hash", "", GOVERNOR, "42"],
    ["short hash", "0xabc", GOVERNOR, "42"],
    ["nonhex hash", `0x${"gg".repeat(32)}`, GOVERNOR, "42"],
    ["short governor", TX, "0x1234", "42"],
    ["nonhex governor", TX, `0x${"gg".repeat(20)}`, "42"],
    ["empty id", TX, GOVERNOR, ""],
    ["hex id", TX, GOVERNOR, "0x2a"],
    ["negative id", TX, GOVERNOR, "-42"],
    ["fractional id", TX, GOVERNOR, "4.2"],
    ["exponent id", TX, GOVERNOR, "4e2"],
  ])("blocks recording with %s", async (_name, tx, governor, id) => {
    const view = render(<SharedDraftView slug="abc123" />);
    fill(view, tx, governor, id);
    const button = view.getByRole("button", {
      name: "Mark as submitted",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
  });

  it("trims valid fields and preserves a large decimal proposal id", async () => {
    const view = render(<SharedDraftView slug="abc123" />);
    const id = "90071992547409931234567890";
    fill(view, ` ${TX} `, ` ${GOVERNOR} `, ` ${id} `);
    const button = view.getByRole("button", {
      name: "Mark as submitted",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mocks.markSubmitted).toHaveBeenCalledExactlyOnceWith({
      transactionHash: TX,
      governorAddress: GOVERNOR,
      proposalId: id,
    });
  });
});
