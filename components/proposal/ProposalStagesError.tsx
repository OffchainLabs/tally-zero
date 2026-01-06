"use client";

import { Button } from "@/components/ui/Button";
import { ExclamationTriangleIcon, ReloadIcon } from "@radix-ui/react-icons";

interface ProposalStagesErrorProps {
  error: Error;
  onReset: () => void;
}

export default function ProposalStagesError({
  error,
  onReset,
}: ProposalStagesErrorProps) {
  return (
    <div className="p-4 text-center space-y-3">
      <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
        <ExclamationTriangleIcon className="h-5 w-5" />
        <h3 className="text-sm font-semibold">Failed to Load Lifecycle</h3>
      </div>

      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        {error.message || "An error occurred loading lifecycle stages."}
      </p>

      <Button variant="outline" size="sm" onClick={onReset}>
        <ReloadIcon className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}
