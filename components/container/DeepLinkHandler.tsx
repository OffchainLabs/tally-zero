"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TimelockOperationContent } from "@/components/container/TimelockOperationContent";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/Drawer";
import { useDeepLink } from "@/context/DeepLinkContext";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useProposalById } from "@/hooks/use-proposal-by-id";
import { buildProposalPath, normalizeProposalTab } from "@/lib/proposal-url";
import type { ParsedProposal } from "@/types/proposal";

interface DeepLinkHandlerProps {
  /**
   * Already loaded proposals from the search/cache
   * If the deep-linked proposal is in this list, we use it directly
   */
  proposals: ParsedProposal[];
}

/**
 * Handles legacy hash deep links.
 * Proposal hashes are redirected to the proposal page; timelock hashes still open a modal.
 */
export function DeepLinkHandler({ proposals }: DeepLinkHandlerProps) {
  const router = useRouter();
  const { urlState, clearDeepLink, openTimelock } = useDeepLink();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isOpen, setIsOpen] = useState(false);

  // Find the proposal in the already-loaded list
  const cachedProposal = useMemo(() => {
    if (urlState.type !== "proposal" || !urlState.id) return null;
    return proposals.find((p) => p.id === urlState.id) ?? null;
  }, [urlState, proposals]);

  // Fetch proposal on-demand if not in cache
  const shouldFetchOnDemand = Boolean(
    urlState.type === "proposal" && urlState.id && !cachedProposal
  );

  const {
    proposal: fetchedProposal,
    isLoading,
    error,
  } = useProposalById({
    proposalId: shouldFetchOnDemand ? urlState.id : null,
    enabled: shouldFetchOnDemand,
  });

  // Use cached proposal if available, otherwise use fetched
  const proposal = cachedProposal ?? fetchedProposal;

  useEffect(() => {
    if (urlState.type !== "proposal" || !urlState.id || isLoading) return;

    if (proposal) {
      router.replace(
        buildProposalPath({
          proposalId: proposal.id,
          governorAddress: proposal.contractAddress,
          tab: normalizeProposalTab(urlState.tab),
        })
      );
      return;
    }

    if (error) {
      router.replace(`/proposal/${urlState.id}`);
    }
  }, [error, isLoading, proposal, router, urlState]);

  // Track what type of modal was last open (to keep it rendered during close animation)
  const [lastType, setLastType] = useState<"proposal" | "timelock" | null>(
    null
  );
  const [lastId, setLastId] = useState<string | null>(null);
  const [lastOpIndex, setLastOpIndex] = useState<number | undefined>(undefined);

  // Open modal when we have a deep link
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync modal state with URL */
    if (urlState.type && urlState.id) {
      setIsOpen(true);
      setLastType(urlState.type);
      setLastId(urlState.id);
      setLastOpIndex(urlState.opIndex);
    } else {
      setIsOpen(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [urlState]);

  // Handle modal close - clear the URL state
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        clearDeepLink();
      }
    },
    [clearDeepLink]
  );

  // Use the current or last-known values for rendering
  // This ensures the modal stays rendered during close animation
  const activeType = urlState.type || lastType;
  const activeId = urlState.id || lastId;
  // Only use lastOpIndex when modal is closing (urlState.type is null)
  // Don't use it as fallback when timelock is still open but user deselected an operation
  const activeOpIndex = urlState.type ? urlState.opIndex : lastOpIndex;

  // Handle operation index changes (for timelock deep links)
  const handleOperationIndexChange = useCallback(
    (opIndex: number | undefined) => {
      if (activeId) {
        openTimelock(activeId, opIndex);
      }
    },
    [activeId, openTimelock]
  );

  // Legacy proposal deep links are redirected to the proposal page.
  if (activeType === "proposal") {
    return null;
  }

  // Handle timelock deep link
  if (activeType === "timelock" && activeId) {
    return (
      <TimelockOperationTrackerModal
        txHash={activeId}
        opIndex={activeOpIndex}
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        onOperationIndexChange={handleOperationIndexChange}
        isDesktop={isDesktop}
      />
    );
  }

  return null;
}

/**
 * Wrapper for TimelockOperationTracker as a controlled modal
 */
function TimelockOperationTrackerModal({
  txHash,
  opIndex,
  isOpen,
  onOpenChange,
  onOperationIndexChange,
  isDesktop,
}: {
  txHash: string;
  opIndex?: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOperationIndexChange?: (opIndex: number | undefined) => void;
  isDesktop: boolean;
}) {
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[1000px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogTitle className="sr-only">
            Timelock Operation Tracker
          </DialogTitle>
          <DialogDescription className="sr-only">
            Track the lifecycle of a timelock operation through the Arbitrum
            governance system
          </DialogDescription>
          <TimelockOperationContent
            txHash={txHash}
            initialOpIndex={opIndex}
            onOperationIndexChange={onOperationIndexChange}
            onClose={handleClose}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] px-4 py-4">
        <DrawerTitle className="sr-only">
          Timelock Operation Tracker
        </DrawerTitle>
        <DrawerDescription className="sr-only">
          Track the lifecycle of a timelock operation through the Arbitrum
          governance system
        </DrawerDescription>
        <TimelockOperationContent
          txHash={txHash}
          initialOpIndex={opIndex}
          onOperationIndexChange={onOperationIndexChange}
          onClose={handleClose}
        />
      </DrawerContent>
    </Drawer>
  );
}
