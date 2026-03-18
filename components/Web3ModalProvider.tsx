"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Suspense, type ReactNode } from "react";

const queryClient = new QueryClient();

const Web3ModalProviderInner = dynamic(
  () => import("./Web3ModalProviderInner").then((mod) => mod.default),
  { ssr: false, loading: () => null }
);

const TestWalletProvider = dynamic(
  () => import("./TestWalletProvider").then((mod) => mod.default),
  { ssr: false, loading: () => null }
);

function NormalProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={children}>
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
