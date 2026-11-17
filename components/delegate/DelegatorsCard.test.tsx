// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TallyAddressDisplayRecord,
  TallyDelegator,
  TallyFormerDelegator,
} from "@/lib/delegate-cache";
import * as delegateCache from "@/lib/delegate-cache";

import { DelegatorsCard, formatShare } from "./DelegatorsCard";

const DELEGATE = "0x1111111111111111111111111111111111111111";
const ALICE = "0xa11ce00000000000000000000000000000000000";
const BOB = "0xb0b0000000000000000000000000000000000000";
const OTHER = "0x0d0d000000000000000000000000000000000000";
const ZERO = "0x0000000000000000000000000000000000000000";
const ARB = BigInt(10) ** BigInt(18);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function display(
  address: string,
  label: string | null = null
): TallyAddressDisplayRecord {
  return {
    address,
    label,
    title: null,
    picture: null,
    profileUrl: null,
    source: label ? "delegate" : "address",
  };
}

function current(
  address: string,
  balance: string | null,
  label: string | null = null
): TallyDelegator {
  return {
    address,
    balance,
    delegatedAtBlock: "100",
    delegatedAtTimestamp: "1700000000",
    txHash: `0x${address.slice(2, 6)}`,
    display: display(address, label),
  };
}

function former(
  over: Partial<TallyFormerDelegator> = {}
): TallyFormerDelegator {
  return {
    address: BOB,
    amountRemoved: (BigInt(500) * ARB).toString(),
    leftAtBlock: "200",
    leftAtTimestamp: "1710000000",
    leftTxHash: "0xleft",
    nowDelegatesTo: OTHER,
    display: display(BOB),
    nowDelegatesToDisplay: display(OTHER, "Other Delegate"),
    ...over,
  };
}

function renderCard(
  votingPower: string | null = (BigInt(1000) * ARB).toString()
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DelegatorsCard address={DELEGATE} votingPower={votingPower} />
    </QueryClientProvider>
  );
}

describe("DelegatorsCard", () => {
  it("lists current delegators with amount, share, and a self badge", async () => {
    vi.spyOn(delegateCache, "getDelegatorsPage").mockResolvedValue({
      totalCount: 2,
      balancesAsOfBlock: "999",
      delegators: [
        current(ALICE, (BigInt(750) * ARB).toString(), "Alice"),
        current(DELEGATE, (BigInt(250) * ARB).toString()),
      ],
    });

    const view = renderCard();

    await view.findByText("Alice");
    expect(view.getByText("2 addresses")).toBeTruthy();
    expect(view.getByText("750 ARB")).toBeTruthy();
    expect(view.getByText("75%")).toBeTruthy();
    expect(view.getByText("25%")).toBeTruthy();
    expect(view.getByText("Self")).toBeTruthy();
    expect(view.getByText("Alice").closest("a")?.getAttribute("href")).toBe(
      `/delegates/${ALICE}`
    );
    expect(view.queryByText(/Load more/)).toBeNull();
  });

  it("says when balances couldn't be read instead of showing zeros", async () => {
    vi.spyOn(delegateCache, "getDelegatorsPage").mockResolvedValue({
      totalCount: 1,
      balancesAsOfBlock: null,
      delegators: [current(ALICE, null)],
    });

    const view = renderCard();

    await view.findByText("Unavailable");
    expect(view.getByText(/Balances couldn't be read/)).toBeTruthy();
  });

  it("loads the next page on demand", async () => {
    const getPage = vi
      .spyOn(delegateCache, "getDelegatorsPage")
      .mockResolvedValueOnce({
        totalCount: 2,
        balancesAsOfBlock: "999",
        delegators: [current(ALICE, ARB.toString(), "Alice")],
      })
      .mockResolvedValueOnce({
        totalCount: 2,
        balancesAsOfBlock: "999",
        delegators: [current(BOB, ARB.toString(), "Bob")],
      });

    const view = renderCard();

    fireEvent.click(await view.findByText("Load more (1 remaining)"));
    await view.findByText("Bob");
    expect(getPage).toHaveBeenLastCalledWith(DELEGATE, 1, 25);
    expect(view.queryByText(/Load more/)).toBeNull();
  });

  it("shows an empty state when nobody delegates here", async () => {
    vi.spyOn(delegateCache, "getDelegatorsPage").mockResolvedValue({
      totalCount: 0,
      balancesAsOfBlock: null,
      delegators: [],
    });

    const view = renderCard();

    await view.findByText("No one delegates to this address right now.");
  });

  it("shows the error and retries", async () => {
    const getPage = vi
      .spyOn(delegateCache, "getDelegatorsPage")
      .mockRejectedValueOnce(
        new Error("Governance indexer request failed: 502")
      )
      .mockResolvedValueOnce({
        totalCount: 1,
        balancesAsOfBlock: "1",
        delegators: [current(ALICE, ARB.toString(), "Alice")],
      });

    const view = renderCard();

    await view.findByText(/request failed: 502/);
    fireEvent.click(view.getByText("Retry"));
    await view.findByText("Alice");
    expect(getPage).toHaveBeenCalledTimes(2);
  });

  it("switches to former delegators, loading them only when asked", async () => {
    vi.spyOn(delegateCache, "getDelegatorsPage").mockResolvedValue({
      totalCount: 0,
      balancesAsOfBlock: null,
      delegators: [],
    });
    const getFormer = vi
      .spyOn(delegateCache, "getFormerDelegatorsPage")
      .mockResolvedValue({
        totalCount: 2,
        delegators: [
          former(),
          former({
            address: ALICE,
            amountRemoved: "0",
            nowDelegatesTo: ZERO,
            display: display(ALICE, "Alice"),
            nowDelegatesToDisplay: display(ZERO),
          }),
        ],
      });

    const view = renderCard();
    await view.findByText("No one delegates to this address right now.");
    expect(getFormer).not.toHaveBeenCalled();

    fireEvent.click(view.getByText("Former"));

    await view.findByText("Other Delegate");
    expect(view.getByText("−500 ARB")).toBeTruthy();
    expect(view.getByText(/Now delegates to/)).toBeTruthy();
    expect(view.getByText(/Undelegated/)).toBeTruthy();
    expect(view.getByText("0 ARB")).toBeTruthy();
    expect(
      view.getByText("Other Delegate").closest("a")?.getAttribute("href")
    ).toBe(`/delegates/${OTHER}`);
    await waitFor(() =>
      expect(getFormer).toHaveBeenCalledWith(DELEGATE, 0, 25)
    );
  });
});

describe("formatShare", () => {
  it("formats a share of voting power to at most two decimals", () => {
    expect(formatShare("1", "3")).toBe("33.33%");
    expect(formatShare("1", "2")).toBe("50%");
    expect(formatShare("1", "1000000")).toBe("<0.01%");
    expect(formatShare("0", "100")).toBe("0%");
  });

  it("caps at 100% when a balance briefly exceeds the voting power", () => {
    expect(formatShare("200", "100")).toBe("100%");
  });

  it("returns null without a usable voting power", () => {
    expect(formatShare("1", null)).toBeNull();
    expect(formatShare("1", "0")).toBeNull();
    expect(formatShare("1", "not a number")).toBeNull();
  });
});
