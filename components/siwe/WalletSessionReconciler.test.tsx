// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
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

  it.each(["switching back", "disconnecting", "unmounting"])(
    "abandons a pending wallet check after %s",
    async (change) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      client.setQueryData(siweKeys.me, session(FIRST));
      client.setQueryData(siweKeys.drafts(FIRST), ["first draft"]);
      let resolveMe!: (value: MeResponse) => void;
      const me = vi.spyOn(siweApi, "me").mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveMe = resolve;
          })
      );
      const logout = vi.spyOn(siweApi, "logout").mockResolvedValue();
      mocks.useAccount.mockReturnValue({ address: SECOND, isConnected: true });
      const content = (
        <QueryClientProvider client={client}>
          <WalletSessionReconciler />
        </QueryClientProvider>
      );
      const view = render(content);
      await waitFor(() => expect(me).toHaveBeenCalledOnce());
      if (change === "unmounting") view.unmount();
      else {
        mocks.useAccount.mockReturnValue(
          change === "switching back"
            ? { address: FIRST, isConnected: true }
            : { address: undefined, isConnected: false }
        );
        view.rerender(
          <QueryClientProvider client={client}>
            <WalletSessionReconciler />
          </QueryClientProvider>
        );
      }
      await act(async () => resolveMe(session(FIRST)));
      expect(logout).not.toHaveBeenCalled();
      expect(client.getQueryData(siweKeys.me)).toEqual(session(FIRST));
      expect(client.getQueryData(siweKeys.drafts(FIRST))).toEqual([
        "first draft",
      ]);
      client.clear();
    }
  );
});
