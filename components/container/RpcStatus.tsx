"use client";

import { memo, useEffect, useRef, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useRpcHealth } from "@/hooks/use-rpc-health";
import type { RpcHealthResult } from "@/lib/rpc-health";
import { cn } from "@/lib/utils";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
  checking: {
    icon: <ReloadIcon className="h-3 w-3 animate-spin" />,
    color: "text-muted-foreground",
    bgColor: "bg-white/20 dark:bg-white/10",
  },
  healthy: {
    icon: <CheckCircledIcon className="h-3 w-3" />,
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-500/20 dark:bg-green-500/25",
  },
  degraded: {
    icon: <CheckCircledIcon className="h-3 w-3" />,
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-500/20 dark:bg-yellow-500/25",
  },
  down: {
    icon: <CrossCircledIcon className="h-3 w-3" />,
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-500/20 dark:bg-red-500/25",
  },
} as const;

function getStatusLabel(result: RpcHealthResult): string {
  switch (result.status) {
    case "checking":
      return "Checking...";
    case "healthy":
      return result.latencyMs ? `${result.latencyMs}ms` : "OK";
    case "degraded":
      return result.latencyMs ? `${result.latencyMs}ms (degraded)` : "Degraded";
    case "down":
      return "Down";
  }
}

interface RpcStatusProps {
  customUrls?: {
    arb1?: string;
    nova?: string;
    l1?: string;
  };
  onHealthChecked?: (allHealthy: boolean, requiredHealthy: boolean) => void;
  autoCheck?: boolean;
}

const StatusIndicator = memo(function StatusIndicator({
  result,
}: {
  result: RpcHealthResult;
}) {
  const config = STATUS_CONFIG[result.status];
  const label = getStatusLabel(result);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
        "glass-subtle backdrop-blur",
        config.bgColor,
        config.color
      )}
      title={result.error || `Block: ${result.blockNumber || "N/A"}`}
    >
      {config.icon}
      <span className="font-medium">{result.name}</span>
      <span className="opacity-80">{label}</span>
    </div>
  );
});

export default function RpcStatus({
  customUrls,
  onHealthChecked,
  autoCheck = true,
}: RpcStatusProps) {
  const { results, isChecking, summary, checkHealth } = useRpcHealth({
    customUrls,
    autoCheck,
  });
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [isExpanded, setIsExpanded] = useState(false);
  const shownToastRef = useRef(false);

  // Notify parent when health check completes - use useEffect to avoid setState during render
  useEffect(() => {
    if (summary && onHealthChecked) {
      onHealthChecked(summary.allHealthy, summary.requiredHealthy);
    }
  }, [summary, onHealthChecked]);

  const healthyCount = results.filter((r) => r.status === "healthy").length;
  const totalCount = results.length;
  const hasIssues =
    summary && (!summary.allHealthy || !summary.requiredHealthy);

  // Check for degraded RPCs (e.g., lack of archive data support)
  const degradedRpcs = results.filter((r) => r.status === "degraded");
  const hasDegradedRpcs = degradedRpcs.length > 0;

  // Show toast notification for degraded RPCs (only once)
  useEffect(() => {
    if (hasDegradedRpcs && !isChecking && !shownToastRef.current) {
      shownToastRef.current = true;

      const rpcNames = degradedRpcs.map((rpc) => rpc.name).join(", ");
      const hasArchiveIssue = degradedRpcs.some((r) => !r.archiveDataSupported);

      toast.warning("⚠️ Degraded RPC Detected", {
        description: `${rpcNames} ${degradedRpcs.length === 1 ? "has" : "have"} limited capabilities${hasArchiveIssue ? " (no archive data support)" : ""}. Consider providing an alternative RPC URL in settings.`,
        duration: 8000,
        action: {
          label: "Settings",
          onClick: () => {
            // Open settings sheet - we'll need to trigger this via context or event
            document
              .querySelector<HTMLButtonElement>('[aria-label="Settings"]')
              ?.click();
          },
        },
      });
    }
  }, [hasDegradedRpcs, degradedRpcs, isChecking]);

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        {isMobile ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] -ml-2 px-2"
          >
            <span>RPC Status</span>
            <span
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-bold glass-subtle backdrop-blur",
                hasIssues
                  ? "bg-yellow-500/20 text-yellow-700 dark:bg-yellow-500/25 dark:text-yellow-400"
                  : "bg-green-500/20 text-green-700 dark:bg-green-500/25 dark:text-green-400"
              )}
            >
              {healthyCount}/{totalCount}
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            RPC Status
          </span>
        )}
        <button
          type="button"
          onClick={() => checkHealth()}
          disabled={isChecking}
          className={cn(
            "text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-50",
            "min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2",
            "rounded-lg hover:bg-white/10 dark:hover:bg-white/5"
          )}
        >
          {isChecking ? (
            <ReloadIcon className="h-4 w-4 animate-spin" />
          ) : (
            <ReloadIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {(!isMobile || isExpanded) && (
        <>
          <div className="flex flex-wrap gap-2">
            {results.map((result) => (
              <StatusIndicator key={result.id} result={result} />
            ))}
          </div>

          {summary && !summary.requiredHealthy && (
            <p className="text-xs text-red-700 dark:text-red-400 glass-subtle backdrop-blur rounded-md px-3 py-2 bg-red-500/10 dark:bg-red-500/15">
              Arbitrum One RPC is required for proposal search
            </p>
          )}

          {summary && summary.requiredHealthy && !summary.allHealthy && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400 glass-subtle backdrop-blur rounded-md px-3 py-2 bg-yellow-500/10 dark:bg-yellow-500/15">
              Some RPCs are unavailable. Lifecycle tracking may be incomplete.
            </p>
          )}

          {hasDegradedRpcs && (
            <div className="text-xs glass-subtle backdrop-blur rounded-md px-3 py-2 bg-orange-500/10 dark:bg-orange-500/15 space-y-1">
              <p className="text-orange-700 dark:text-orange-400 font-medium">
                ⚠️ Degraded RPC detected
              </p>
              <p className="text-orange-700/90 dark:text-orange-400/90">
                {degradedRpcs.map((rpc) => rpc.name).join(", ")}{" "}
                {degradedRpcs.length === 1 ? "has" : "have"} limited
                capabilities
                {degradedRpcs.some((r) => !r.archiveDataSupported) &&
                  " (no archive data support)"}
                . Consider providing an alternative RPC URL in settings.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
