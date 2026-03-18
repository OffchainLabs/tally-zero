"use client";

import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { PHASE_METADATA } from "@/config/security-council";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { ElectionPhase } from "@/types/election";

const OVERRIDABLE_PHASES: ElectionPhase[] = [
  "CONTENDER_SUBMISSION",
  "NOMINEE_SELECTION",
  "MEMBER_ELECTION",
];

export function ElectionPhaseOverride(): React.ReactElement {
  const [override, setOverride] = useLocalStorage<string>(
    STORAGE_KEYS.ELECTION_PHASE_OVERRIDE,
    ""
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-yellow-500" />
        <Label className="text-sm font-medium">Election Phase Override</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Force the election page to display a specific phase for testing write
        actions. Uses the most recent completed election as mock data.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {OVERRIDABLE_PHASES.map((phase) => (
          <Button
            key={phase}
            type="button"
            variant={override === phase ? "default" : "outline"}
            size="sm"
            onClick={() => setOverride(override === phase ? "" : phase)}
            className="text-xs"
          >
            {PHASE_METADATA[phase].name}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOverride("")}
          disabled={!override}
          className="text-xs"
        >
          Clear
        </Button>
      </div>
      {override && (
        <p className="text-xs text-yellow-500">
          Active override: {PHASE_METADATA[override as ElectionPhase].name}
        </p>
      )}
    </div>
  );
}
