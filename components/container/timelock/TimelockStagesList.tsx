"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { TimelockOperationInfo } from "@/hooks/use-timelock-operation";
import { buildLookupMap } from "@/lib/collection-utils";
import { type EstimatedTimeRange } from "@/lib/date-utils";
import { getAllStageMetadata } from "@/lib/stage-tracker";
import type { ProposalStage, StageType } from "@/types/proposal-stage";
import { calculateExpectedEta } from "@gzeoneth/gov-tracker";
import { InfoCircledIcon } from "@radix-ui/react-icons";

import { LoadingSkeleton, StageItem } from "../../proposal/stages";
import { ExecuteTimelockButton } from "../../proposal/stages/ExecuteTimelockButton";

/** Timelock operation stage types (direct timelock tracking, no proposal stages) */
const TIMELOCK_STAGE_TYPES: StageType[] = [
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
];

/** Threshold in seconds before showing slow tracking hint */
const SLOW_TRACKING_THRESHOLD = 15;

interface TimelockStagesListProps {
  stages: ProposalStage[];
  isLoading: boolean;
  operation: TimelockOperationInfo;
  onRefresh: () => void;
}

export function TimelockStagesList({
  stages,
  isLoading,
  operation,
  onRefresh,
}: TimelockStagesListProps) {
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- loading timer management */
    if (isLoading && !loadingStartTime) {
      setLoadingStartTime(Date.now());
      setShowSlowHint(false);
    } else if (!isLoading) {
      setLoadingStartTime(null);
      setShowSlowHint(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
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

  const stageMap = useMemo(
    () => buildLookupMap(stages, (s) => s.type),
    [stages]
  );

  const allStageMetadata = useMemo(() => getAllStageMetadata(), []);

  const relevantStages = useMemo(() => {
    return TIMELOCK_STAGE_TYPES.map((type) => {
      const meta = allStageMetadata[type];
      return {
        type,
        estimatedDays: meta?.estimatedDays,
      };
    });
  }, [allStageMetadata]);

  const estimatedTimes = useMemo(() => {
    const times = new Map<StageType, EstimatedTimeRange>();

    for (const stageType of TIMELOCK_STAGE_TYPES) {
      const stage = stageMap.get(stageType);

      if (stage?.status === "COMPLETED") continue;

      const stageIndex = stages.findIndex((s) => s.type === stageType);
      if (stageIndex < 0) continue;

      const eta = calculateExpectedEta(stages, stageIndex);

      if (eta) {
        const estimatedTime = new Date(eta * 1000);
        times.set(stageType, {
          minDate: estimatedTime,
          maxDate: estimatedTime,
        });
      }
    }

    return times;
  }, [stages, stageMap]);

  const handleRefreshFromStage = useCallback(
    (_index: number) => {
      onRefresh();
    },
    [onRefresh]
  );

  const currentStageIndex = useMemo(() => {
    for (let i = TIMELOCK_STAGE_TYPES.length - 1; i >= 0; i--) {
      const stage = stageMap.get(TIMELOCK_STAGE_TYPES[i]);
      if (stage?.status === "COMPLETED") {
        return i;
      }
    }
    return -1;
  }, [stageMap]);

  if (stages.length === 0 && isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="relative">
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
