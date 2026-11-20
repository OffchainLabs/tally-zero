import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEnsureChain, type EnsureChainResult } from "./use-ensure-chain";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  switchChainAsync: vi.fn(),
  isPending: { current: false },
  toastError: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useChainId: mocks.useChainId,
  useSwitchChain: () => ({
    switchChainAsync: mocks.switchChainAsync,
    isPending: mocks.isPending.current,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

function Probe({
  chainId,
  onResult,
}: {
  chainId: number;
  onResult: (result: EnsureChainResult) => void;
}) {
  onResult(useEnsureChain(chainId));
  return null;
}

function renderEnsureChain(chainId: number): EnsureChainResult {
  const results: EnsureChainResult[] = [];
  renderToStaticMarkup(
    createElement(Probe, { chainId, onResult: (r) => results.push(r) })
  );
  return results[0];
}

describe("useEnsureChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAccount.mockReturnValue({ isConnected: true, chainId: 412346 });
    mocks.useChainId.mockReturnValue(412346);
    mocks.isPending.current = false;
    mocks.switchChainAsync.mockResolvedValue(undefined);
  });

  it("is on the right network when the wallet already is", async () => {
    const { isWrongNetwork, ensure } = renderEnsureChain(412346);
    expect(isWrongNetwork).toBe(false);
    await ensure();
    expect(mocks.switchChainAsync).not.toHaveBeenCalled();
  });

  it("does nothing without a connected wallet", async () => {
    mocks.useAccount.mockReturnValue({ isConnected: false });
    const { isWrongNetwork, ensure } = renderEnsureChain(1337);
    expect(isWrongNetwork).toBe(false);
    await ensure();
    expect(mocks.switchChainAsync).not.toHaveBeenCalled();
  });

  it("switches a connected wallet on another chain", async () => {
    const { isWrongNetwork, ensure } = renderEnsureChain(1337);
    expect(isWrongNetwork).toBe(true);
    await ensure();
    expect(mocks.switchChainAsync).toHaveBeenCalledWith({ chainId: 1337 });
  });

  it("follows the wallet onto a chain the app does not configure", async () => {
    // The config chain stays on the target while the wallet sits elsewhere.
    mocks.useAccount.mockReturnValue({ isConnected: true, chainId: 10 });
    mocks.useChainId.mockReturnValue(1337);
    const { isWrongNetwork, ensure } = renderEnsureChain(1337);
    expect(isWrongNetwork).toBe(true);
    await ensure();
    expect(mocks.switchChainAsync).toHaveBeenCalledWith({ chainId: 1337 });
  });

  it("trusts the wallet's chain over a stale config chain", async () => {
    mocks.useAccount.mockReturnValue({ isConnected: true, chainId: 1337 });
    mocks.useChainId.mockReturnValue(42161);
    const { isWrongNetwork, ensure } = renderEnsureChain(1337);
    expect(isWrongNetwork).toBe(false);
    await ensure();
    expect(mocks.switchChainAsync).not.toHaveBeenCalled();
  });

  it("falls back to the config chain until the wallet reports one", () => {
    mocks.useAccount.mockReturnValue({ isConnected: true, chainId: undefined });
    mocks.useChainId.mockReturnValue(1337);
    expect(renderEnsureChain(1337).isWrongNetwork).toBe(false);
    expect(renderEnsureChain(412346).isWrongNetwork).toBe(true);
  });

  it("reports a switch that is waiting on the wallet", () => {
    expect(renderEnsureChain(1337).isSwitching).toBe(false);
    mocks.isPending.current = true;
    expect(renderEnsureChain(1337).isSwitching).toBe(true);
  });

  it("toasts and rethrows a failed switch", async () => {
    const failure = new Error("Chain 1337 not configured");
    mocks.switchChainAsync.mockRejectedValue(failure);
    const { ensure } = renderEnsureChain(1337);

    await expect(ensure()).rejects.toBe(failure);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith("Chain 1337 not configured", {
      id: "ensure-chain-1337",
    });
  });

  it("rethrows a refused switch without toasting", async () => {
    const refusal = Object.assign(new Error("User rejected the request."), {
      code: 4001,
    });
    mocks.switchChainAsync.mockRejectedValue(refusal);
    const { ensure } = renderEnsureChain(1337);

    await expect(ensure()).rejects.toBe(refusal);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
