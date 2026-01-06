"use client";

import { memo, useEffect, useState } from "react";

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
      return result.latencyMs ? `${result.latencyMs}ms (slow)` : "Slow";
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
        "glass-subtle",
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
                "px-2 py-1 rounded-md text-[10px] font-bold glass-subtle",
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
            <p className="text-xs text-red-700 dark:text-red-400 glass-subtle rounded-md px-3 py-2 bg-red-500/10 dark:bg-red-500/15">
              Arbitrum One RPC is required for proposal search
            </p>
          )}

          {summary && summary.requiredHealthy && !summary.allHealthy && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400 glass-subtle rounded-md px-3 py-2 bg-yellow-500/10 dark:bg-yellow-500/15">
              Some RPCs are unavailable. Lifecycle tracking may be incomplete.
            </p>
          )}
        </>
      )}
    </div>
  );
}
