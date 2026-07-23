"use client";

import { memo } from "react";

import { formatEtaTimestamp } from "@/lib/date-utils";
import type { TrackedStage } from "@gzeoneth/gov-tracker";

import {
  RetryableCreationDetails,
  RetryableRedemptionDetails,
} from "./RetryableDetails";

// The on-chain ETA (timelock maturity time) is only meaningful while the
// stage is still waiting or awaiting execution; once a stage reaches a
// terminal state its transactions carry the exact times and the stale ETA
// would just be noise.
const ETA_RELEVANT_STATUSES = new Set(["PENDING", "READY"]);

export interface StageDataDisplayProps {
  data: TrackedStage["data"];
  status: string;
}

export const StageDataDisplay = memo(function StageDataDisplay({
  data,
  status,
}: StageDataDisplayProps) {
  const eta =
    "eta" in data && data.eta && ETA_RELEVANT_STATUSES.has(status)
      ? data.eta
      : null;
  const note = "note" in data && data.note ? data.note : null;
  const message =
    "message" in data && data.message && !note ? data.message : null;
  const creationDetails =
    "creationDetails" in data &&
    Array.isArray(data.creationDetails) &&
    data.creationDetails.length > 0
      ? data.creationDetails
      : null;
  const redemptionDetails =
    "redemptionDetails" in data &&
    Array.isArray(data.redemptionDetails) &&
    data.redemptionDetails.length > 0
      ? data.redemptionDetails
      : null;

  if (!eta && !note && !message && !creationDetails && !redemptionDetails) {
    return null;
  }

  return (
    <div className="mt-2 text-xs glass-subtle backdrop-blur rounded-lg px-3 py-2 space-y-1">
      {eta ? (
        <p className="text-muted-foreground">
          ETA: {formatEtaTimestamp(String(eta))}
        </p>
      ) : null}
      {note ? (
        <p className="text-muted-foreground italic">{String(note)}</p>
      ) : null}
      {message ? (
        <p className="text-muted-foreground italic">{String(message)}</p>
      ) : null}
      {creationDetails ? (
        <RetryableCreationDetails details={creationDetails} />
      ) : null}
      {redemptionDetails ? (
        <RetryableRedemptionDetails details={redemptionDetails} />
      ) : null}
    </div>
  );
});
