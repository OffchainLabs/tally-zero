"use client";

import { getTxExplorerUrl, type ChainId } from "@/lib/explorer-utils";
import { cn } from "@/lib/utils";
import type { ProposalStage, StageStatus } from "@/types/proposal-stage";
import { getStageMetadata } from "@gzeoneth/gov-tracker";
import {
  AlertCircle,
  CheckCircle,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { memo } from "react";

interface TimelockStagesDisplayProps {
  stages: ProposalStage[];
  isLoading?: boolean;
}

function StatusIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "COMPLETED":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "PENDING":
      return <Clock className="h-5 w-5 text-yellow-500" />;
    case "READY":
      return <AlertCircle className="h-5 w-5 text-blue-500" />;
    case "FAILED":
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" />;
  }
}

function chainIdToChainName(chainId: number): ChainId {
  switch (chainId) {
    case 1:
      return "ethereum";
    case 42161:
      return "arb1";
    case 42170:
      return "nova";
    default:
      return "arb1";
  }
}

function getChainLabel(chain: string): string {
  switch (chain) {
    case "ethereum":
      return "L1";
    case "arb1":
      return "Arb1";
    case "nova":
      return "Nova";
    default:
      return chain;
  }
}

const StageItem = memo(function StageItem({
  stage,
  isLast,
}: {
  stage: ProposalStage;
  isLast: boolean;
}) {
  const metadata = getStageMetadata(stage.type);
  const status = stage.status;

  return (
    <div className="relative flex gap-4">
      {!isLast && (
        <div
          className={cn(
            "absolute left-[14px] top-8 w-0.5 h-[calc(100%-16px)]",
            status === "COMPLETED"
              ? "bg-gradient-to-b from-green-500 to-green-500/50"
              : "bg-gradient-to-b from-muted to-muted/30"
          )}
        />
      )}

      <div className="relative z-10 flex-shrink-0 mt-0.5">
        <div
          className={cn(
            "rounded-full p-1",
            status === "COMPLETED"
              ? "bg-green-500/20"
              : status === "PENDING"
                ? "bg-yellow-500/20"
                : "bg-muted/50"
          )}
        >
          <StatusIcon status={status} />
        </div>
      </div>

      <div className="flex-1 pb-6">
        <div className="flex items-center gap-2">
          <h4
            className={cn(
              "text-sm font-medium",
              status === "COMPLETED"
                ? "text-foreground"
                : status === "PENDING"
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-muted-foreground"
            )}
          >
            {metadata?.title || stage.type}
          </h4>
          {metadata?.chain && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium",
                metadata.chain === "ethereum"
                  ? "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                  : metadata.chain === "arb1"
                    ? "bg-arb-blue/20 text-arb-blue dark:text-arb-teal"
                    : "bg-orange-500/20 text-orange-700 dark:text-orange-300"
              )}
            >
              {getChainLabel(metadata.chain)}
            </span>
          )}
        </div>

        {metadata?.description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {metadata.description}
          </p>
        )}

        {stage.transactions && stage.transactions.length > 0 && (
          <div className="mt-2 space-y-1">
            {stage.transactions.map((tx) => (
              <a
                key={tx.hash}
                href={getTxExplorerUrl(tx.hash, chainIdToChainName(tx.chainId))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground group"
              >
                <span className="font-mono">
                  {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                </span>
                {tx.description && (
                  <span className="text-muted-foreground">
                    ({tx.description})
                  </span>
                )}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export function TimelockStagesDisplay({
  stages,
  isLoading,
}: TimelockStagesDisplayProps) {
  if (stages.length === 0 && isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading stages...</span>
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No lifecycle stages available
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {stages.map((stage, idx) => (
        <StageItem
          key={stage.type}
          stage={stage}
          isLast={idx === stages.length - 1}
        />
      ))}
    </div>
  );
}
