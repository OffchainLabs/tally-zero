"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, type ReactNode } from "react";

import TestWalletProvider from "./TestWalletProvider";
import Web3ModalProviderInner from "./Web3ModalProviderInner";

const queryClient = new QueryClient();

// Both providers used to load through next/dynamic with ssr: false. Because
// they wrap the whole app, that switched every route to client rendering and
// the HTML Google received had no text at all. They now import statically and
// the wagmi configs set ssr: true, which is Reown's documented Next.js setup:
// the server renders a disconnected wallet state and the client reconnects on
// mount, the same thing users saw before, minus the empty HTML.
function NormalProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <Web3ModalProviderInner>{children}</Web3ModalProviderInner>
      </Suspense>
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
