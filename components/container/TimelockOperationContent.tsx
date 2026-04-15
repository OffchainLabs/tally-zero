"use client";

import { useCallback, useEffect, useMemo } from "react";

import { Button } from "@/components/ui/Button";
import {
  useTimelockOperation,
  type TimelockOperationInfo,
} from "@/hooks/use-timelock-operation";
import { buildLookupMap } from "@/lib/collection-utils";
import { SECONDS_PER_DAY, SECONDS_PER_HOUR } from "@/lib/date-utils";
import { shortenAddress } from "@/lib/format-utils";
import { truncateMiddle } from "@/lib/text-utils";
import { ExternalLinkIcon, ReloadIcon } from "@radix-ui/react-icons";

import { ActionView } from "../payload/ActionView";
import { LoadingSkeleton } from "../proposal/stages";
import { TimelockStagesList } from "./timelock/TimelockStagesList";

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

  // Pre-compute index Map for O(1) lookups
  const operationIndexMap = useMemo(
    () =>
      buildLookupMap(
        operations.map((op, i) => ({ id: op.operationId, index: i + 1 })),
        (item) => item.id
      ),
    [operations]
  );

  // Wrapped handlers that update URL when operation selection changes
  const handleSelectOperation = useCallback(
    (operation: (typeof operations)[0]) => {
      const opIndex = operationIndexMap.get(operation.operationId)?.index ?? 1;
      selectOperation(operation);
      onOperationIndexChange?.(opIndex);
    },
    [operationIndexMap, selectOperation, onOperationIndexChange]
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
          <TimelockStagesList
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
          className="w-full p-3 text-left rounded-lg glass-subtle backdrop-blur hover:bg-muted/50 transition-all duration-200"
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
    <div className="glass-subtle backdrop-blur rounded-lg p-4 space-y-3">
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
        {operation.timestamp > 0 && (
          <div>
            <span className="text-muted-foreground">Scheduled At:</span>
            <p>{new Date(operation.timestamp * 1000).toLocaleString()}</p>
          </div>
        )}
      </div>
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
