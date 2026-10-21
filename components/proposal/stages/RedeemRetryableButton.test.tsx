// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RedeemRetryableButton } from "./RedeemRetryableButton";
import { RetryableRedemptionDetails } from "./RetryableDetails";

const TICKET = `0x${"44".repeat(32)}`;
const REDEEM_TX = `0x${"99".repeat(32)}`;

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  useAccount: vi.fn(),
  writeContractAsync: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  ensure: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-ensure-chain", () => ({
  useEnsureChain: () => ({
    ensure: mocks.ensure,
    isWrongNetwork: false,
    isSwitching: false,
  }),
}));
vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  usePublicClient: () => ({
    waitForTransactionReceipt: mocks.waitForTransactionReceipt,
  }),
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync }),
}));

function redeemButton(container: HTMLElement) {
  return container.querySelector(
    '[data-testid="retryable-redeem"]'
  ) as HTMLButtonElement | null;
}

describe("RedeemRetryableButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
    mocks.useAccount.mockReturnValue({ isConnected: true });
    mocks.ensure.mockResolvedValue(undefined);
    mocks.writeContractAsync.mockResolvedValue(REDEEM_TX);
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  });
  afterEach(cleanup);

  it("redeems the ticket through ArbRetryableTx on the L2, then refetches", async () => {
    const onRedeemed = vi.fn();
    const { container } = render(
      <RedeemRetryableButton ticketId={TICKET} onRedeemed={onRedeemed} />
    );

    await act(async () => {
      fireEvent.click(redeemButton(container)!);
    });

    expect(mocks.ensure).toHaveBeenCalled();
    expect(mocks.writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0x000000000000000000000000000000000000006E",
        functionName: "redeem",
        args: [TICKET],
        chainId: 42161,
      })
    );
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: REDEEM_TX,
    });
    expect(mocks.toast.success).toHaveBeenCalled();
    expect(onRedeemed).toHaveBeenCalledTimes(1);
  });

  it("redeems on the local L2 when the local chains are on", async () => {
    mocks.env.NEXT_PUBLIC_LOCAL_CHAINS = "1";
    const { container } = render(<RedeemRetryableButton ticketId={TICKET} />);
    await act(async () => {
      fireEvent.click(redeemButton(container)!);
    });
    expect(mocks.writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 412346 })
    );
  });

  it("toasts a reverted redeem and does not refetch", async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    const onRedeemed = vi.fn();
    const { container } = render(
      <RedeemRetryableButton ticketId={TICKET} onRedeemed={onRedeemed} />
    );
    await act(async () => {
      fireEvent.click(redeemButton(container)!);
    });
    expect(mocks.toast.error).toHaveBeenCalled();
    expect(onRedeemed).not.toHaveBeenCalled();
    expect(redeemButton(container)!.disabled).toBe(false);
  });

  it("stays quiet when the wallet refuses", async () => {
    mocks.writeContractAsync.mockRejectedValue(
      Object.assign(new Error("User rejected the request."), { code: 4001 })
    );
    const { container } = render(<RedeemRetryableButton ticketId={TICKET} />);
    await act(async () => {
      fireEvent.click(redeemButton(container)!);
    });
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("is disabled without a wallet", () => {
    mocks.useAccount.mockReturnValue({ isConnected: false });
    const { container } = render(<RedeemRetryableButton ticketId={TICKET} />);
    expect(redeemButton(container)!.disabled).toBe(true);
  });
});

describe("RetryableRedemptionDetails", () => {
  beforeEach(() => {
    mocks.useAccount.mockReturnValue({ isConnected: true });
  });
  afterEach(cleanup);

  it("marks each leg and offers Redeem only on a redeemable ticket", () => {
    const { container } = render(
      <RetryableRedemptionDetails
        details={[
          {
            index: 0,
            targetChain: "arb1",
            status: "REDEEMED",
            l2TxHash: REDEEM_TX,
            ticketId: `0x${"55".repeat(32)}`,
          },
          {
            index: 1,
            targetChain: "arb1",
            status: "REDEEMABLE",
            l2TxHash: null,
            ticketId: TICKET,
          },
          {
            index: 2,
            targetChain: "arb1",
            status: "REDEEMABLE",
            l2TxHash: null,
            ticketId: null,
          },
          {
            index: 3,
            targetChain: "arb1",
            status: "EXPIRED",
            l2TxHash: null,
            ticketId: `0x${"66".repeat(32)}`,
          },
        ]}
      />
    );

    const rows = [...container.querySelectorAll("[data-status]")];
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual([
      "REDEEMED",
      "REDEEMABLE",
      "REDEEMABLE",
      "EXPIRED",
    ]);
    expect(rows[1].getAttribute("data-ticket-id")).toBe(TICKET);
    expect(rows[2].hasAttribute("data-ticket-id")).toBe(false);

    const buttons = container.querySelectorAll(
      '[data-testid="retryable-redeem"]'
    );
    expect(buttons).toHaveLength(1);
    expect(rows[1].contains(buttons[0])).toBe(true);
  });

  it("links a leg's creation transaction on Ethereum, or shows it bare locally", () => {
    const CREATION_TX = `0x${"77".repeat(32)}`;
    const leg = (creationChain: "ethereum" | "unknown") => ({
      index: 0,
      targetChain: "arb1" as const,
      status: "PENDING",
      l2TxHash: null,
      creationTxHash: CREATION_TX,
      creationChain,
    });

    const mainnet = render(
      <RetryableRedemptionDetails details={[leg("ethereum")]} />
    ).container;
    const link = mainnet.querySelector(
      '[data-testid="retryable-creation-tx"] a'
    );
    expect(link?.getAttribute("href")).toBe(
      `https://etherscan.io/tx/${CREATION_TX}`
    );
    cleanup();

    const local = render(
      <RetryableRedemptionDetails details={[leg("unknown")]} />
    ).container;
    const created = local.querySelector(
      '[data-testid="retryable-creation-tx"]'
    );
    expect(created?.querySelector("a")).toBeNull();
    expect(created?.querySelector(`[title="${CREATION_TX}"]`)).not.toBeNull();

    cleanup();
    const none = render(
      <RetryableRedemptionDetails
        details={[{ ...leg("ethereum"), creationTxHash: null }]}
      />
    ).container;
    expect(
      none.querySelector('[data-testid="retryable-creation-tx"]')
    ).toBeNull();
  });
});
