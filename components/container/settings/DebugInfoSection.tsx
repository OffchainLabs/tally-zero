"use client";

import { Label } from "@/components/ui/Label";
import {
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
} from "@/config/storage-keys";

import type { StoredSettings } from "./types";

interface DebugInfoSectionProps {
  storedSettings: StoredSettings;
}

/**
 * Debug info section shown only in Nerd Mode
 */
export function DebugInfoSection({ storedSettings }: DebugInfoSectionProps) {
  const {
    storedL2Rpc,
    storedL1Rpc,
    blockRange,
    l1BlockRange,
    daysToSearch,
    cacheTtl,
    tenderlyOrg,
    tenderlyProject,
  } = storedSettings;

  return (
    <div className="glass-subtle backdrop-blur rounded-lg p-4 space-y-3 transition-all duration-200 hover:shadow-md">
      <Label className="text-sm font-medium">Debug Info</Label>
      <div className="pt-2 border-t border-[var(--glass-border)] space-y-2 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">L2 RPC:</span>
          <span className="truncate max-w-[180px]">
            {storedL2Rpc || "(default)"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">L1 RPC:</span>
          <span className="truncate max-w-[180px]">
            {storedL1Rpc || "(default)"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Block Range:</span>
          <span>{blockRange.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">L1 Block Range:</span>
          <span>{l1BlockRange.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Days:</span>
          <span>{daysToSearch}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cache TTL:</span>
          <span>
            {cacheTtl}s ({Math.floor(cacheTtl / 60)}m)
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tenderly Org:</span>
          <span>{tenderlyOrg || DEFAULT_TENDERLY_ORG}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tenderly Project:</span>
          <span>{tenderlyProject || DEFAULT_TENDERLY_PROJECT}</span>
        </div>
      </div>
    </div>
  );
}
