"use client";

import { memo } from "react";

import { formatEtaTimestamp } from "@/lib/date-utils";
import type { TrackedStage } from "@gzeoneth/gov-tracker";

import {
  RetryableCreationDetails,
  RetryableRedemptionDetails,
} from "./RetryableDetails";

export interface StageDataDisplayProps {
  data: TrackedStage["data"];
}

export const StageDataDisplay = memo(function StageDataDisplay({
  data,
}: StageDataDisplayProps) {
  return (
    <div className="mt-2 text-xs glass-subtle rounded-lg px-3 py-2 space-y-1">
      {"eta" in data && data.eta ? (
        <p className="text-muted-foreground">
          ETA: {formatEtaTimestamp(String(data.eta))}
        </p>
      ) : null}
      {"note" in data && data.note ? (
        <p className="text-muted-foreground italic">{String(data.note)}</p>
      ) : null}
      {"message" in data && data.message && !("note" in data && data.note) ? (
        <p className="text-muted-foreground italic">{String(data.message)}</p>
      ) : null}
      {"creationDetails" in data &&
      Array.isArray(data.creationDetails) &&
      data.creationDetails.length > 0 ? (
        <RetryableCreationDetails details={data.creationDetails} />
      ) : null}
      {"redemptionDetails" in data &&
      Array.isArray(data.redemptionDetails) &&
      data.redemptionDetails.length > 0 ? (
        <RetryableRedemptionDetails details={data.redemptionDetails} />
      ) : null}
    </div>
  );
});
