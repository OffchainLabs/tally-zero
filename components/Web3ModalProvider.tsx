"use client";

import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { type ReactNode } from "react";

import TestWalletProvider from "./TestWalletProvider";
import Web3ModalProviderInner from "./Web3ModalProviderInner";

let browserQueryClient: QueryClient | undefined;

// TanStack's App Router setup: one client for the browser session, a fresh
// one per server render. A module-level client would be shared by every
// request on the server, where gcTime defaults to Infinity, so each query key
// a render touched (one per delegate address, say) would never be collected.
// Not useState: a suspend before first mount would discard it on the client.
function getQueryClient(): QueryClient {
  if (isServer) return new QueryClient();
  browserQueryClient ??= new QueryClient();
  return browserQueryClient;
}

// Both providers used to load through next/dynamic with ssr: false. Because
// they wrap the whole app, that switched every route to client rendering and
// the HTML Google received had no text at all. They now import statically and
// the wagmi configs set ssr: true, which is Reown's documented Next.js setup:
// the server renders a disconnected wallet state and the client reconnects on
// mount, the same thing users saw before, minus the empty HTML.
function NormalProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <Web3ModalProviderInner>{children}</Web3ModalProviderInner>
    </QueryClientProvider>
  );
}

export function Web3ModalProvider({ children }: { children: ReactNode }) {
  return (
    <TestWalletProvider fallback={<NormalProvider>{children}</NormalProvider>}>
      {children}
    </TestWalletProvider>
  );
}
