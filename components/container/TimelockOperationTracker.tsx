"use client";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useDeepLink } from "@/context/DeepLinkContext";
import { isValidTxHash } from "@/lib/address-utils";
import { MagnifyingGlassIcon, ReloadIcon } from "@radix-ui/react-icons";
import { useCallback, useState } from "react";

import { TimelockOperationContent } from "./TimelockOperationContent";

interface TimelockOperationTrackerProps {
  defaultTxHash?: string;
}

/**
 * Button-triggered dialog for tracking timelock operations.
 * Users enter a transaction hash, and the lifecycle is displayed.
 * Updates URL for deep linking when tracking begins.
 */
export function TimelockOperationTracker({
  defaultTxHash = "",
}: TimelockOperationTrackerProps) {
  const { openTimelock, clearDeepLink } = useDeepLink();
  const [txHashInput, setTxHashInput] = useState(defaultTxHash);
  const [activeTxHash, setActiveTxHash] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValidTxHash(txHashInput)) {
      setActiveTxHash(txHashInput);
      openTimelock(txHashInput);
    }
  };

  const handleClear = () => {
    setTxHashInput("");
    setActiveTxHash("");
    clearDeepLink();
  };

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        // Clear URL when dialog is closed
        clearDeepLink();
      }
    },
    [clearDeepLink]
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
          Track Timelock Operation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[1000px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Timelock Operation Tracker</DialogTitle>
          <DialogDescription>
            Enter a transaction hash containing a CallScheduled event to track
            its lifecycle through the Arbitrum governance system.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="txHash">Transaction Hash</Label>
            <div className="flex gap-2">
              <Input
                id="txHash"
                type="text"
                placeholder="0x..."
                value={txHashInput}
                onChange={(e) => setTxHashInput(e.target.value)}
                className="font-mono text-sm"
              />
              <Button type="submit" disabled={isSubmitting || !txHashInput}>
                {isSubmitting ? (
                  <ReloadIcon className="h-4 w-4 animate-spin" />
                ) : (
                  "Track"
                )}
              </Button>
              {activeTxHash && (
                <Button type="button" variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </form>

        {/* Show content when we have an active tx hash */}
        {activeTxHash && <TimelockOperationContent txHash={activeTxHash} />}
      </DialogContent>
    </Dialog>
  );
}
