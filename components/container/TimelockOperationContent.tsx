"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  useTimelockOperation,
  type TimelockOperationInfo,
} from "@/hooks/use-timelock-operation";
import {
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import { shortenAddress } from "@/lib/format-utils";
import { getAllStageMetadata } from "@/lib/stage-tracker";
import { truncateMiddle } from "@/lib/text-utils";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { calculateExpectedEta, type TrackedStage } from "@gzeoneth/gov-tracker";
import {
  ExternalLinkIcon,
  InfoCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

import { ActionView } from "../payload/ActionView";
import { LoadingSkeleton, StageItem } from "../proposal/stages";
import { ExecuteTimelockButton } from "../proposal/stages/ExecuteTimelockButton";

interface TimelockOperationContentProps {
  /** Transaction hash to track */
  txHash: string;
  /** Initial operation index to select (1-based) */
  initialOpIndex?: number;
  /** Callback when an operation is selected (for URL updates) */
  onOperationIndexChange?: (opIndex: number | undefined) => void;
  /** Callback to close the modal */
  onClose?: () => void;
}

/**
 * Reusable content for displaying timelock operation tracking
 * Used by both TimelockOperationTracker (button-triggered) and DeepLinkHandler (URL-triggered)
 */
export function TimelockOperationContent({
  txHash,
  initialOpIndex,
  onOperationIndexChange,
  onClose,
}: TimelockOperationContentProps) {
  const {
    operations,
    selectedOperation,
    stages,
    isLoading,
    isParsing,
    error,
    selectOperation,
    deselectOperation,
    refetch,
  } = useTimelockOperation({
    txHash,
    enabled: true,
  });

  // Auto-select operation based on initial index or single operation
  useEffect(() => {
    if (operations.length === 0 || selectedOperation) return;

    // If initial operation index is provided, use it (1-based)
    if (
      initialOpIndex &&
      initialOpIndex > 0 &&
      initialOpIndex <= operations.length
    ) {
      selectOperation(operations[initialOpIndex - 1]);
      return;
    }

    // Otherwise auto-select if only one operation
    if (operations.length === 1) {
      selectOperation(operations[0]);
    }
  }, [operations, selectedOperation, selectOperation, initialOpIndex]);

  // Wrapped handlers that update URL when operation selection changes
  const handleSelectOperation = useCallback(
    (operation: (typeof operations)[0]) => {
      const opIndex =
        operations.findIndex((op) => op.operationId === operation.operationId) +
        1;
      selectOperation(operation);
      onOperationIndexChange?.(opIndex);
    },
    [operations, selectOperation, onOperationIndexChange]
  );

  const handleDeselectOperation = useCallback(() => {
    deselectOperation();
    onOperationIndexChange?.(undefined);
  }, [deselectOperation, onOperationIndexChange]);

  if (isParsing) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <ReloadIcon className="w-6 h-6 text-primary animate-spin" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Parsing Transaction</h3>
          <p className="text-sm text-muted-foreground">
            Looking for CallScheduled events...
          </p>
          <code className="text-xs text-muted-foreground block">
            {txHash.slice(0, 20)}...{txHash.slice(-8)}
          </code>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">Error loading operation</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (operations.length === 0 && !isLoading) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-yellow-600 dark:text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">No operations found</h3>
        <p className="text-sm text-muted-foreground">
          No CallScheduled events found in transaction{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-xs">
            {txHash.slice(0, 10)}...{txHash.slice(-6)}
          </code>
        </p>
        <p className="text-xs text-muted-foreground">
          Make sure this transaction contains a timelock queue operation.
        </p>
      </div>
    );
  }

  // Operation selector (if multiple operations found)
  if (operations.length > 1 && !selectedOperation) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 px-2"
            >
              <svg
                className="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </Button>
          )}
          <div className="flex-1 text-center">
            <h3 className="text-lg font-semibold">Multiple Operations Found</h3>
            <p className="text-sm text-muted-foreground">
              Transaction contains {operations.length} operations. Select one to
              track:
            </p>
          </div>
          {/* Spacer for symmetry when back button exists */}
          {onClose && <div className="w-16" />}
        </div>
        <OperationSelector
          operations={operations}
          onSelect={handleSelectOperation}
        />
      </div>
    );
  }

  // Show lifecycle stages
  if (selectedOperation) {
    const showBackButton = operations.length > 1;
    return (
      <div className="flex-1 overflow-y-auto space-y-4">
        <OperationHeader
          operation={selectedOperation}
          isLoading={isLoading}
          onRefresh={refetch}
          onBack={showBackButton ? handleDeselectOperation : undefined}
          operationIndex={
            operations.findIndex(
              (op) => op.operationId === selectedOperation.operationId
            ) + 1
          }
          totalOperations={operations.length}
        />

        {/* Operation Lifecycle - shown first for visibility */}
        <div className="glass rounded-xl p-4">
          <div className="mb-4 pb-3 border-b border-border/50">
            <h3 className="text-sm font-semibold">Operation Lifecycle</h3>
          </div>
          <StagesList
            stages={stages}
            isLoading={isLoading}
            operation={selectedOperation}
            onRefresh={refetch}
          />
        </div>

        {/* Operation Payload with decoded calldata */}
        <div className="glass rounded-xl p-4">
          <div className="mb-4 pb-3 border-b border-border/50">
            <h3 className="text-sm font-semibold">Operation Payload</h3>
          </div>
          <ActionView
            index={0}
            target={selectedOperation.target}
            value={selectedOperation.value}
            calldata={selectedOperation.data}
            governorAddress={selectedOperation.timelockAddress}
          />
        </div>
      </div>
    );
  }

  // Loading state (initial)
  return <LoadingSkeleton />;
}

interface OperationSelectorProps {
  operations: TimelockOperationInfo[];
  onSelect: (operation: TimelockOperationInfo) => void;
}

function OperationSelector({ operations, onSelect }: OperationSelectorProps) {
  return (
    <div className="space-y-2">
      {operations.map((op, idx) => (
        <button
          key={op.operationId}
          onClick={() => onSelect(op)}
          className="w-full p-3 text-left rounded-lg glass-subtle hover:bg-muted/50 transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Operation {idx + 1}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {truncateMiddle(op.operationId, 6, 4)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Target: {shortenAddress(op.target)}
          </div>
        </button>
      ))}
    </div>
  );
}

interface OperationHeaderProps {
  operation: TimelockOperationInfo;
  isLoading: boolean;
  onRefresh: () => void;
  onBack?: () => void;
  operationIndex?: number;
  totalOperations?: number;
}

function OperationHeader({
  operation,
  isLoading,
  onRefresh,
  onBack,
  operationIndex,
  totalOperations,
}: OperationHeaderProps) {
  const arbiscanUrl = `https://arbiscan.io/tx/${operation.txHash}`;

  return (
    <div className="glass-subtle rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-7 px-2"
            >
              <svg
                className="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </Button>
          )}
          <h4 className="text-sm font-semibold">
            {operationIndex && totalOperations
              ? `Operation ${operationIndex} of ${totalOperations}`
              : "Operation Details"}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={arbiscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            View on Arbiscan
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <ReloadIcon className="h-4 w-4 animate-spin" />
            ) : (
              <ReloadIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Operation ID:</span>
          <p className="font-mono truncate" title={operation.operationId}>
            {truncateMiddle(operation.operationId, 6, 4)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Target:</span>
          <p className="font-mono truncate" title={operation.target}>
            {shortenAddress(operation.target)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Delay:</span>
          <p>{formatDelay(parseInt(operation.delay))}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Scheduled At:</span>
          <p>{new Date(operation.timestamp * 1000).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

// Timelock operation stage types (direct timelock tracking, no proposal stages)
const TIMELOCK_STAGE_TYPES: StageType[] = [
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
];

interface StagesListProps {
  stages: ProposalStage[];
  isLoading: boolean;
  operation: TimelockOperationInfo;
  onRefresh: () => void;
}

// Threshold in seconds before showing slow tracking hint
const SLOW_TRACKING_THRESHOLD = 15;

function StagesList({
  stages,
  isLoading,
  operation,
  onRefresh,
}: StagesListProps) {
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [showSlowHint, setShowSlowHint] = useState(false);

  // Track loading duration and show hint when slow
  useEffect(() => {
    if (isLoading && !loadingStartTime) {
      setLoadingStartTime(Date.now());
      setShowSlowHint(false);
    } else if (!isLoading) {
      setLoadingStartTime(null);
      setShowSlowHint(false);
    }
  }, [isLoading, loadingStartTime]);

  useEffect(() => {
    if (!loadingStartTime) return;

    const timer = setInterval(() => {
      const elapsed = (Date.now() - loadingStartTime) / 1000;
      if (elapsed >= SLOW_TRACKING_THRESHOLD) {
        setShowSlowHint(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [loadingStartTime]);

  const stageMap = useMemo(() => {
    const map = new Map<StageType, ProposalStage>();
    for (const stage of stages) {
      map.set(stage.type, stage);
    }
    return map;
  }, [stages]);

  // Get stage metadata for calculating ETAs
  // getAllStageMetadata returns a Record<StageType, StageMetadata> in gov-tracker
  const allStageMetadata = useMemo(() => getAllStageMetadata(), []);

  // Always show all stages - user wants full lifecycle visibility
  const relevantStageTypes = TIMELOCK_STAGE_TYPES;

  // Build stage metadata with estimated durations
  const relevantStages = useMemo(() => {
    return relevantStageTypes.map((type) => {
      const meta = allStageMetadata[type];
      return {
        type,
        estimatedDays: meta?.estimatedDays,
      };
    });
  }, [relevantStageTypes, allStageMetadata]);

  // Calculate estimated completion times using gov-tracker's calculateExpectedEta
  const estimatedTimes = useMemo(() => {
    const times = new Map<StageType, EstimatedTimeRange>();

    // Convert ProposalStage[] to TrackedStage[] for gov-tracker
    const trackedStages = stages as unknown as TrackedStage[];

    for (const stageType of relevantStageTypes) {
      const stage = stageMap.get(stageType);

      // Skip completed stages
      if (stage?.status === "COMPLETED") continue;

      // Find the actual index in stages array (may differ from relevantStageTypes order)
      const stageIndex = stages.findIndex((s) => s.type === stageType);
      if (stageIndex < 0) continue;

      // Use gov-tracker's calculateExpectedEta for consistent ETA calculation
      const eta = calculateExpectedEta(trackedStages, stageIndex);

      if (eta) {
        const estimatedTime = new Date(eta * 1000);
        times.set(stageType, {
          minDate: estimatedTime,
          maxDate: estimatedTime,
        });
      }
    }

    return times;
  }, [stages, relevantStageTypes, stageMap]);

  // Refresh handler for StageItem (refreshes from a specific stage index)
  const handleRefreshFromStage = useCallback(
    (_index: number) => {
      onRefresh();
    },
    [onRefresh]
  );

  // Find current stage index for tracking indicator
  const currentStageIndex = useMemo(() => {
    for (let i = relevantStageTypes.length - 1; i >= 0; i--) {
      const stage = stageMap.get(relevantStageTypes[i]);
      if (stage?.status === "COMPLETED") {
        return i;
      }
    }
    return -1;
  }, [relevantStageTypes, stageMap]);

  if (stages.length === 0 && isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="relative">
      {/* Slow tracking hint */}
      {showSlowHint && isLoading && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start gap-2">
            <InfoCircledIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">
                Tracking is taking longer than usual
              </p>
              <p className="text-xs mt-1 text-yellow-700 dark:text-yellow-300">
                Public RPCs can be slow. For faster tracking, configure your own
                L1 RPC endpoint in Settings (gear icon in top-right).
              </p>
            </div>
          </div>
        </div>
      )}

      {relevantStages.map((meta, idx) => {
        const stage = stageMap.get(meta.type);
        const isTrackingThis = isLoading && idx === currentStageIndex + 1;
        const estimatedCompletion = estimatedTimes.get(meta.type);

        // Check if this stage is ready for execution (status READY in gov-tracker)
        const isReadyForExecution =
          meta.type === "L2_TIMELOCK" &&
          (stage?.status === "READY" ||
            (stage?.status === "PENDING" &&
              stage?.data?.message === "Operation ready for execution"));

        return (
          <div key={meta.type}>
            <StageItem
              stage={stage}
              stageType={meta.type}
              stageIndex={idx}
              isLast={idx === relevantStages.length - 1}
              isTracking={isTrackingThis}
              isLoading={isLoading}
              isRefreshing={false}
              onRefresh={handleRefreshFromStage}
              estimatedCompletion={estimatedCompletion}
              votingTimeRange={null}
              governorType="core"
              proposalId={operation.operationId}
              governorAddress={operation.timelockAddress}
            />
            {isReadyForExecution && (
              <div className="ml-12 mb-4 -mt-2">
                <ExecuteTimelockButton
                  operation={operation}
                  onSuccess={onRefresh}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatDelay(seconds: number): string {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""}${hours > 0 ? `, ${hours} hr${hours > 1 ? "s" : ""}` : ""}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${seconds} seconds`;
}
