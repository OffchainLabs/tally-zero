"use client";

import { useEffect, useState } from "react";

import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "@/lib/date-utils";
import { shortenAddress } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

/** Where the form's contents last went. */
export type DraftSaveStatus =
  | { kind: "never" }
  | { kind: "local"; at: number }
  | { kind: "server"; at: number; address: string | null };

interface DraftSaveStatusBarProps {
  status: DraftSaveStatus;
  /** Edits newer than the last save of either kind. */
  isDirty: boolean;
  /**
   * The contents were restored from this browser's autosave over the server
   * draft the form was opened on, because the local copy was newer.
   */
  restoredFromLocal?: boolean;
  className?: string;
}

/** "just now", "3 min ago", "2 h ago", else the date. Exported for its tests. */
export function formatSaveAge(at: number, now: number): string {
  const age = Math.max(0, now - at);
  if (age < 45 * MS_PER_SECOND) return "just now";
  if (age < MS_PER_HOUR) return `${Math.round(age / MS_PER_MINUTE)} min ago`;
  if (age < 24 * MS_PER_HOUR) return `${Math.round(age / MS_PER_HOUR)} h ago`;
  return new Date(at).toLocaleDateString();
}

const RELATIVE_TICK_MS = 30 * MS_PER_SECOND;

/**
 * Pinned to the bottom of the viewport while the proposal form is on screen.
 * Says whether the current contents are saved, where (this browser only, or
 * the account they were saved under), and when. Purely presentational: the
 * form owns the local autosave and the loader reports server saves.
 */
export function DraftSaveStatusBar({
  status,
  isDirty,
  restoredFromLocal = false,
  className,
}: DraftSaveStatusBarProps) {
  // Re-render on a slow tick so "3 min ago" keeps up without a save happening.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), RELATIVE_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const state = isDirty ? "unsaved" : status.kind;
  // A server draft whose timestamp did not parse arrives as NaN: say where the
  // contents are, just not when.
  const savedAt =
    status.kind === "never" || !Number.isFinite(status.at) ? null : status.at;

  const headline =
    state === "unsaved"
      ? "Unsaved changes"
      : status.kind === "never"
        ? "Not saved"
        : status.kind === "local"
          ? "Saved on this browser only"
          : status.address
            ? `Saved to your drafts as ${shortenAddress(status.address)}`
            : "Saved to your drafts";

  const detail =
    state === "unsaved"
      ? status.kind === "never"
        ? "Autosaves to this browser a moment after you stop typing."
        : status.kind === "local"
          ? "Last saved on this browser."
          : "Last saved to your drafts."
      : status.kind === "never"
        ? "Autosaves to this browser as you type. Save to your drafts to keep it across devices."
        : status.kind === "local"
          ? `${
              restoredFromLocal
                ? "Restored unsaved edits from this browser, newer than the saved draft. "
                : ""
            }Save to your drafts to keep it across devices.`
          : "Reopen it any time from My Drafts.";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="draft-save-status"
      data-state={state}
      className={cn(
        "sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-t-2xl border-t border-border/40 glass px-4 py-2.5 text-sm backdrop-blur",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            state === "unsaved"
              ? "bg-amber-400"
              : state === "local"
                ? "bg-sky-400"
                : state === "server"
                  ? "bg-emerald-400"
                  : "bg-muted-foreground/50"
          )}
        />
        <div className="min-w-0">
          <p className="font-medium text-foreground">{headline}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      {savedAt !== null ? (
        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
          <time dateTime={new Date(savedAt).toISOString()}>
            {new Date(savedAt).toLocaleTimeString()}
          </time>{" "}
          · {formatSaveAge(savedAt, now)}
        </p>
      ) : null}
    </div>
  );
}
