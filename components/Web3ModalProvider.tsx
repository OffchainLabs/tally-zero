"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Suspense, type ReactNode } from "react";

// Setup queryClient
const queryClient = new QueryClient();

// Dynamically import the actual provider component to avoid SSR issues
const Web3ModalProviderInner = dynamic(
  () => import("./Web3ModalProviderInner").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => null,
  }
);

export function Web3ModalProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={children}>
        <Web3ModalProviderInner>{children}</Web3ModalProviderInner>
      </Suspense>
    </QueryClientProvider>
  );
}
