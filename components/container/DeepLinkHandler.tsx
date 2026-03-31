"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TimelockOperationContent } from "@/components/container/TimelockOperationContent";
import VoteModel from "@/components/container/VoteModel";
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
import { Skeleton } from "@/components/ui/Skeleton";
import { proposalSchema } from "@/config/schema";
import { useDeepLink } from "@/context/DeepLinkContext";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useProposalById } from "@/hooks/use-proposal-by-id";
import { findStateByValue } from "@/lib/state-utils";
import type { ParsedProposal } from "@/types/proposal";

interface DeepLinkHandlerProps {
  /**
   * Already loaded proposals from the search/cache
   * If the deep-linked proposal is in this list, we use it directly
   */
  proposals: ParsedProposal[];
}

/**
 * Component that handles deep link navigation to proposals and timelock operations
 * Displays the appropriate modal based on the URL hash state
 */
export function DeepLinkHandler({ proposals }: DeepLinkHandlerProps) {
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

  // Render proposal modal content
  const renderProposalContent = () => {
    if (isLoading) {
      return <ProposalLoadingSkeleton />;
    }

    if (error) {
      return (
        <ProposalErrorState
          error={error}
          onClose={() => handleOpenChange(false)}
        />
      );
    }

    if (!proposal) {
      return (
        <ProposalNotFoundState
          proposalId={urlState.id}
          onClose={() => handleOpenChange(false)}
        />
      );
    }

    const parsedProposal = proposalSchema.safeParse(proposal);
    if (!parsedProposal.success) {
      return (
        <ProposalErrorState
          error={new Error("Invalid proposal data")}
          onClose={() => handleOpenChange(false)}
        />
      );
    }

    const stateValue = findStateByValue(proposal.state);
    if (!stateValue) {
      return (
        <ProposalErrorState
          error={new Error("Unknown proposal state")}
          onClose={() => handleOpenChange(false)}
        />
      );
    }

    const defaultTab = urlState.tab as
      | "description"
      | "payload"
      | "stages"
      | "vote"
      | undefined;

    return (
      <VoteModel
        proposal={parsedProposal.data}
        stateValue={stateValue}
        isDesktop={isDesktop}
        defaultTab={defaultTab ?? "description"}
      />
    );
  };

  // Handle proposal deep link
  if (activeType === "proposal") {
    if (isDesktop) {
      return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
          {renderProposalContent()}
        </Dialog>
      );
    }

    return (
      <Drawer open={isOpen} onOpenChange={handleOpenChange}>
        {renderProposalContent()}
      </Drawer>
    );
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
 * Loading skeleton for proposal modal
 */
function ProposalLoadingSkeleton() {
  return (
    <DialogContent className="sm:max-w-[1000px] max-w-sm">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    </DialogContent>
  );
}

/**
 * Error state for proposal modal
 */
function ProposalErrorState({
  error,
  onClose,
}: {
  error: Error;
  onClose: () => void;
}) {
  return (
    <DialogContent className="sm:max-w-[500px]">
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">Failed to load proposal</h3>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Close
        </button>
      </div>
    </DialogContent>
  );
}

/**
 * Not found state for proposal modal
 */
function ProposalNotFoundState({
  proposalId,
  onClose,
}: {
  proposalId: string | null;
  onClose: () => void;
}) {
  return (
    <DialogContent className="sm:max-w-[500px]">
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-yellow-600 dark:text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">Proposal not found</h3>
        <p className="text-sm text-muted-foreground">
          Could not find proposal with ID:{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-xs">
            {proposalId
              ? `${proposalId.slice(0, 10)}...${proposalId.slice(-6)}`
              : "unknown"}
          </code>
        </p>
        <p className="text-xs text-muted-foreground">
          The proposal may not exist or may have been created on a different
          network.
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Close
        </button>
      </div>
    </DialogContent>
  );
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
