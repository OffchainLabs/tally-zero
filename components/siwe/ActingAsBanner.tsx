"use client";

import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useActAs } from "@/hooks/use-act-as";
import { useSiwe } from "@/hooks/use-siwe";

/**
 * Always-visible notice that the session is acting as a Safe.
 *
 * Deliberately not dismissible. Act-as is stored server-side on the session
 * row, and the session cookie lives 7 days on a sliding window — so the mode
 * outlives page reloads, tab closes, and restarts. Without a permanent marker a
 * user can return days later and quietly edit the Safe's profile believing it
 * is their own. The banner is the mitigation, so hiding it defeats the point.
 */
export function ActingAsBanner() {
  const { actingAs } = useSiwe();
  const { stopActingAs, isStopping } = useActAs();

  if (!actingAs) return null;

  return (
    <div
      data-testid="acting-as-banner"
      role="status"
      className="w-full border-b border-amber-500/40 bg-amber-500/10"
    >
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium text-amber-200">
            Acting as{" "}
            <span className="font-mono" data-testid="acting-as-address">
              {actingAs}
            </span>
          </span>
          <span className="ml-2 text-amber-200/70">
            Profile edits, drafts, and uploads apply to this Safe.
          </span>
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="act-as-stop"
          disabled={isStopping}
          onClick={() => {
            stopActingAs().catch(() => {});
          }}
        >
          {isStopping ? "Stopping…" : "Stop"}
        </Button>
      </div>
    </div>
  );
}
