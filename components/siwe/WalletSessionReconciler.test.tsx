// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSiwe } from "@/hooks/use-siwe";
import { siweApi } from "@/lib/siwe/client";
import { siweKeys } from "@/lib/siwe/keys";
import type { MeResponse } from "@/lib/siwe/types";

import { WalletSessionReconciler } from "./WalletSessionReconciler";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  signMessageAsync: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useSignMessage: () => ({ signMessageAsync: mocks.signMessageAsync }),
}));

const FIRST = "0x1111111111111111111111111111111111111111";
const SECOND = "0x2222222222222222222222222222222222222222";

function session(address: string): MeResponse {
  return { address, actingAs: null, effectiveAddress: address } as MeResponse;
}

function SignInButton() {
  const { signIn, signInError } = useSiwe();
  return (
    <>
      <button onClick={() => void signIn().catch(() => {})}>Sign in</button>
      {signInError ? <span>{signInError.message}</span> : null}
    </>
  );
}

describe("WalletSessionReconciler", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("revokes the old session and clears owned caches when another wallet connects", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(siweKeys.me, session(FIRST));
    client.setQueryData(siweKeys.drafts(FIRST), ["first draft"]);
    const logout = vi.spyOn(siweApi, "logout").mockResolvedValue();
    vi.spyOn(siweApi, "me")
      .mockResolvedValueOnce(session(FIRST))
      .mockResolvedValue(null);
    mocks.useAccount.mockReturnValue({ address: FIRST, isConnected: true });

    const view = render(
      <QueryClientProvider client={client}>
        <WalletSessionReconciler />
      </QueryClientProvider>
    );
    expect(logout).not.toHaveBeenCalled();

    mocks.useAccount.mockReturnValue({ address: SECOND, isConnected: true });
    view.rerender(
      <QueryClientProvider client={client}>
        <WalletSessionReconciler />
      </QueryClientProvider>
    );

    await waitFor(() => expect(client.getQueryData(siweKeys.me)).toBeNull());
    expect(logout).toHaveBeenCalledOnce();
    expect(client.getQueryData(siweKeys.drafts(FIRST))).toBeUndefined();
    client.clear();
  });

  it("does not revoke a matching cookie when the cached session is from another tab", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(siweKeys.me, session(FIRST));
    mocks.useAccount.mockReturnValue({ address: SECOND, isConnected: true });
    vi.spyOn(siweApi, "me").mockResolvedValue(session(SECOND));
    const logout = vi.spyOn(siweApi, "logout").mockResolvedValue();

    render(
      <QueryClientProvider client={client}>
        <WalletSessionReconciler />
      </QueryClientProvider>
    );

    await waitFor(() =>
      expect(client.getQueryData(siweKeys.me)).toEqual(session(SECOND))
    );
    expect(logout).not.toHaveBeenCalled();
    client.clear();
  });

  it("waits for old-session logout before signing in the new wallet", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(siweKeys.me, session(FIRST));
    mocks.useAccount.mockReturnValue({ address: SECOND, isConnected: true });
    let finishLogout = () => {};
    const logout = vi.spyOn(siweApi, "logout").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLogout = resolve;
        })
    );
    vi.spyOn(siweApi, "me")
      .mockResolvedValueOnce(session(FIRST))
      .mockResolvedValue(null);
    const nonce = vi.spyOn(siweApi, "nonce").mockResolvedValue("nonce1234");
    const verify = vi.spyOn(siweApi, "verify").mockResolvedValue();
    mocks.signMessageAsync.mockResolvedValue("0x1234");

    const view = render(
      <QueryClientProvider client={client}>
        <WalletSessionReconciler />
        <SignInButton />
      </QueryClientProvider>
    );
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    fireEvent.click(view.getByRole("button", { name: "Sign in" }));
    expect(nonce).not.toHaveBeenCalled();

    finishLogout();
    await waitFor(() => expect(verify).toHaveBeenCalledOnce());
    expect(logout).toHaveBeenCalledOnce();
    expect(nonce).toHaveBeenCalledOnce();
    client.clear();
  });

  it("does not sign in the new wallet if revoking the old session fails", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(siweKeys.me, session(FIRST));
    mocks.useAccount.mockReturnValue({ address: SECOND, isConnected: true });
    vi.spyOn(siweApi, "me").mockResolvedValue(session(FIRST));
    const logout = vi
      .spyOn(siweApi, "logout")
      .mockRejectedValue(new Error("logout unavailable"));
    const nonce = vi.spyOn(siweApi, "nonce").mockResolvedValue("nonce1234");

    const view = render(
      <QueryClientProvider client={client}>
        <WalletSessionReconciler />
        <SignInButton />
      </QueryClientProvider>
    );
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    fireEvent.click(view.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(view.getByText("logout unavailable")).toBeDefined()
    );
    expect(logout).toHaveBeenCalledTimes(2);
    expect(nonce).not.toHaveBeenCalled();
    expect(client.getQueryData(siweKeys.me)).toEqual(session(FIRST));
    client.clear();
  });
});
