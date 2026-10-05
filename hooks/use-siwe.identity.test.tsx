// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { siweKeys } from "@/lib/siwe/keys";
import type { MeResponse } from "@/lib/siwe/types";
import { useSiwe } from "./use-siwe";

const useAccount = vi.hoisted(() => vi.fn());
vi.mock("wagmi", () => ({
  useAccount,
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
}));
vi.mock("@/config/siwe", () => ({ SIWE_CHAIN_ID: 42161 }));

const SIGNER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const OTHER = "0x1111111111111111111111111111111111111111";
const SAFE = "0x2222222222222222222222222222222222222222";
const clients: QueryClient[] = [];
function mount(actingAs: string | null = null) {
  const session = {
    address: SIGNER,
    actingAs,
    effectiveAddress: actingAs ?? SIGNER,
  } as MeResponse;
  const client = new QueryClient();
  clients.push(client);
  client.setQueryData(siweKeys.me, session);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useSiwe(), { wrapper }), client, session };
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("useSiwe connected identity", () => {
  it.each([
    [SIGNER.replace("abcdef", "ABCDEF"), true, null, true],
    [OTHER, true, SAFE, false],
    [SIGNER, false, SAFE, false],
    [undefined, false, SAFE, false],
    [undefined, true, SAFE, false],
    [SIGNER.replace("abcdef", "ABCDEF"), true, SAFE, true],
  ])(
    "gates wallet %s connected=%s actingAs=%s (signed in=%s)",
    (address, isConnected, actingAs, signedIn) => {
      useAccount.mockReturnValue({ address, isConnected });
      const { result, session } = mount(actingAs);
      expect(result.current).toMatchObject({
        address,
        isConnected,
        session: signedIn ? session : null,
        isSignedIn: signedIn,
        effectiveAddress: signedIn ? session.effectiveAddress : null,
        actingAs: signedIn ? actingAs : null,
      });
    }
  );

  it("hides the previous Safe subject immediately on wallet switch", () => {
    useAccount.mockReturnValue({ address: SIGNER, isConnected: true });
    const { result, rerender, client, session } = mount(SAFE);
    expect(result.current.effectiveAddress).toBe(SAFE);
    useAccount.mockReturnValue({ address: OTHER, isConnected: true });
    rerender();
    expect(result.current).toMatchObject({
      session: null,
      isSignedIn: false,
      effectiveAddress: null,
      actingAs: null,
    });
    expect(client.getQueryData(siweKeys.me)).toEqual(session);
  });
});
