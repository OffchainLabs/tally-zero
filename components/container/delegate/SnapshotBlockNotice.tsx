"use client";

import { InfoIcon } from "lucide-react";

export interface SnapshotBlockNoticeProps {
  snapshotBlock: number;
  cacheAge?: string;
}

export function SnapshotBlockNotice({
  snapshotBlock,
  cacheAge,
}: SnapshotBlockNoticeProps) {
  if (snapshotBlock <= 0) return null;

  return (
    <div className="glass-subtle rounded-xl p-4 flex items-start gap-3">
      <InfoIcon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
      <p className="text-sm text-muted-foreground">
        Delegate list indexed up to block{" "}
        <span className="font-medium text-foreground">
          {snapshotBlock.toLocaleString()}
        </span>
        . New delegates since then may not appear.
        {cacheAge && (
          <>
            {" "}
            Cache age:{" "}
            <span className="font-medium text-foreground">{cacheAge}</span>
          </>
        )}
      </p>
    </div>
  );
}
