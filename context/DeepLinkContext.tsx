"use client";

import { useUrlState, type UrlState } from "@hooks/use-url-state";
import { createContext, useContext, useMemo } from "react";

interface DeepLinkContextValue {
  urlState: UrlState;
  openProposal: (proposalId: string, tab?: string) => void;
  openTimelock: (txHash: string, opIndex?: number) => void;
  clearDeepLink: () => void;
}

const DeepLinkContext = createContext<DeepLinkContextValue | null>(null);

export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const { urlState, openProposal, openTimelock, clearUrlState } = useUrlState();

  const value = useMemo(
    () => ({
      urlState,
      openProposal,
      openTimelock,
      clearDeepLink: clearUrlState,
    }),
    [urlState, openProposal, openTimelock, clearUrlState]
  );

  return (
    <DeepLinkContext.Provider value={value}>
      {children}
    </DeepLinkContext.Provider>
  );
}

export function useDeepLink(): DeepLinkContextValue {
  const context = useContext(DeepLinkContext);
  if (!context) {
    throw new Error("useDeepLink must be used within a DeepLinkProvider");
  }
  return context;
}
