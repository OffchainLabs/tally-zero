"use client";

import { useCallback, useEffect, useState } from "react";

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

/**
 * Handles legacy timelock hash deep links.
 */
export function DeepLinkHandler() {
  const { urlState, clearDeepLink, openTimelock } = useDeepLink();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isOpen, setIsOpen] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const [lastOpIndex, setLastOpIndex] = useState<number | undefined>(undefined);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync modal state with URL */
    if (urlState.type === "timelock" && urlState.id) {
      setIsOpen(true);
      setLastId(urlState.id);
      setLastOpIndex(urlState.opIndex);
    } else {
      setIsOpen(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [urlState]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        clearDeepLink();
      }
    },
    [clearDeepLink]
  );

  const activeId = urlState.id || lastId;
  const activeOpIndex = urlState.type ? urlState.opIndex : lastOpIndex;

  const handleOperationIndexChange = useCallback(
    (opIndex: number | undefined) => {
      if (activeId) {
        openTimelock(activeId, opIndex);
      }
    },
    [activeId, openTimelock]
  );

  if (!activeId) {
    return null;
  }

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
