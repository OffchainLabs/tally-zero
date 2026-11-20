import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEnsureChain, type EnsureChainResult } from "./use-ensure-chain";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  switchChainAsync: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useChainId: mocks.useChainId,
  useSwitchChain: () => ({
    switchChainAsync: mocks.switchChainAsync,
    isPending: false,
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
    mocks.useAccount.mockReturnValue({ isConnected: true });
    mocks.useChainId.mockReturnValue(412346);
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

  it("toasts and rethrows a failed switch", async () => {
    const failure = new Error("Chain 1337 not configured");
    mocks.switchChainAsync.mockRejectedValue(failure);
    const { ensure } = renderEnsureChain(1337);

    await expect(ensure()).rejects.toBe(failure);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
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
