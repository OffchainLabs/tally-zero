"use client";

import { useUrlState, type UrlState } from "@hooks/use-url-state";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";

import { buildProposalPath, type ProposalTab } from "@/lib/proposal-url";

interface DeepLinkContextValue {
  urlState: UrlState;
  openProposal: (
    proposalId: string,
    governorAddress: string,
    tab?: ProposalTab
  ) => void;
  openTimelock: (txHash: string, opIndex?: number) => void;
  clearDeepLink: () => void;
}

const DeepLinkContext = createContext<DeepLinkContextValue | null>(null);

export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { urlState, openTimelock, clearUrlState } = useUrlState();

  const openProposalPage = useCallback(
    (proposalId: string, governorAddress: string, tab?: ProposalTab) => {
      router.push(
        buildProposalPath({
          proposalId,
          governorAddress,
          tab,
        })
      );
    },
    [router]
  );

  const value = useMemo(
    () => ({
      urlState,
      openProposal: openProposalPage,
      openTimelock,
      clearDeepLink: clearUrlState,
    }),
    [urlState, openProposalPage, openTimelock, clearUrlState]
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
