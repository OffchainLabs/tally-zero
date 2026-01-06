"use client";

import { getErrorMessage } from "@/lib/error-utils";
import { Button } from "@components/ui/Button";
import { TenderlySetupDialog } from "@components/ui/TenderlySetupDialog";
import { isTenderlyConfigured } from "@lib/tenderly";
import { cn } from "@lib/utils";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import { useCallback, useState } from "react";

export type SimulationType = "retryable" | "timelock" | "call";

export interface SimulationResult {
  link: string;
  success: boolean;
}

export interface SimulationButtonProps {
  type: SimulationType;
  onSimulate: () => Promise<SimulationResult>;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const TYPE_CONFIG: Record<
  SimulationType,
  {
    defaultLabel: string;
    loadingLabel: string;
    buttonClass: string;
    linkClass: string;
    badge?: string;
  }
> = {
  retryable: {
    defaultLabel: "Simulate L2",
    loadingLabel: "Simulating L2...",
    buttonClass:
      "border-orange-500/50 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30",
    linkClass: "",
    badge: "L1→L2",
  },
  timelock: {
    defaultLabel: "Simulate Execute",
    loadingLabel: "Simulating...",
    buttonClass:
      "border-purple-500/50 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/30",
    linkClass: "",
    badge: "schedule→execute",
  },
  call: {
    defaultLabel: "Simulate",
    loadingLabel: "Simulating...",
    buttonClass: "",
    linkClass: "",
  },
};

export function SimulationButton({
  type,
  onSimulate,
  label,
  disabled,
  className,
}: SimulationButtonProps) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  const [showSetupDialog, setShowSetupDialog] = useState(false);

  const config = TYPE_CONFIG[type];

  const handleSimulate = useCallback(async () => {
    if (!isTenderlyConfigured()) {
      setShowSetupDialog(true);
      return;
    }
    setIsSimulating(true);
    setError(null);
    setSimulationResult(null);

    try {
      const result = await onSimulate();
      setSimulationResult(result);
    } catch (err) {
      setError(getErrorMessage(err, "run simulation"));
    } finally {
      setIsSimulating(false);
    }
  }, [onSimulate]);

  if (simulationResult) {
    return (
      <a
        href={simulationResult.link}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1 text-xs hover:underline",
          simulationResult.success
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400",
          config.linkClass,
          className
        )}
      >
        <ExternalLinkIcon className="w-3 h-3" />
        {simulationResult.success ? "Success" : "Failed"} - View Simulation
      </a>
    );
  }

  return (
    <>
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSimulate}
          disabled={disabled || isSimulating}
          className={cn("text-xs h-7 px-2", config.buttonClass)}
        >
          {isSimulating ? config.loadingLabel : label || config.defaultLabel}
          {config.badge && !isSimulating && (
            <span className="ml-1 text-[10px] opacity-60">
              ({config.badge})
            </span>
          )}
        </Button>
        {error && (
          <span className="text-xs text-red-500 dark:text-red-400">
            {error}
          </span>
        )}
      </div>
      <TenderlySetupDialog
        open={showSetupDialog}
        onOpenChange={setShowSetupDialog}
      />
    </>
  );
}
