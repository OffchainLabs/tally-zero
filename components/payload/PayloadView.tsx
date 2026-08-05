"use client";

import { useMemo } from "react";

import { Badge } from "@components/ui/Badge";
import {
  normalizePayloadActions,
  type NormalizedPayloadGroup,
} from "@lib/payload-actions";
import { ChevronRightIcon } from "@radix-ui/react-icons";

import { ActionView } from "./ActionView";

export type CalldataOverrides = Record<number, string>;

export interface PayloadViewProps {
  targets: string[];
  values: string[];
  calldatas: string[];
  nerdMode?: boolean;
  calldataOverrides?: CalldataOverrides;
  onCalldataOverrideChange?: (
    index: number,
    newCalldata: string | undefined
  ) => void;
  governorAddress?: string;
}

const ROUTE_CHAIN_LABELS = {
  ethereum: "Ethereum",
  arb1: "Arbitrum One",
  nova: "Nova",
} as const;

function GovernanceRouteDetails({
  group,
  originalCalldata,
  overriddenCalldata,
  nerdMode,
  governorAddress,
  onCalldataChange,
}: {
  group: NormalizedPayloadGroup;
  originalCalldata: string;
  overriddenCalldata?: string;
  nerdMode: boolean;
  governorAddress?: string;
  onCalldataChange: (newCalldata: string | undefined) => void;
}) {
  const isOverridden = overriddenCalldata !== undefined;

  return (
    <details
      className="group glass-subtle backdrop-blur rounded-xl border border-border/50"
      open={nerdMode && isOverridden ? true : undefined}
    >
      <summary className="cursor-pointer list-none p-3 sm:p-4 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          <span className="font-medium text-foreground">
            Governance execution route
          </span>
          <Badge variant="outline" className="text-[9px]">
            L2 Timelock
          </Badge>
          <span aria-hidden="true">→</span>
          <Badge variant="outline" className="text-[9px]">
            L1 Timelock
          </Badge>
          <span aria-hidden="true">→</span>
          {group.routeChains.map((chain) => (
            <Badge key={chain} variant="outline" className="text-[9px]">
              {ROUTE_CHAIN_LABELS[chain]}
            </Badge>
          ))}
          {isOverridden && (
            <Badge
              variant="outline"
              className="text-[9px] border-amber-500 text-amber-600 dark:text-amber-400"
            >
              Override
            </Badge>
          )}
        </div>
        <span className="block mt-1">
          Expand to inspect the submitted ArbSys, timelock, retryable, and
          executor calldata.
        </span>
      </summary>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <ActionView
          index={group.sourceIndex}
          target={group.originalTarget}
          value={group.originalValue}
          calldata={originalCalldata}
          nerdMode={nerdMode}
          overriddenCalldata={overriddenCalldata}
          onCalldataChange={onCalldataChange}
          governorAddress={governorAddress}
          chainContext="arb1"
          title="Submitted governance call"
          showIndex={false}
        />
      </div>
    </details>
  );
}

/**
 * Container component for displaying proposal payload actions
 */
export function PayloadView({
  targets,
  values,
  calldatas,
  nerdMode = false,
  calldataOverrides,
  onCalldataOverrideChange,
  governorAddress,
}: PayloadViewProps) {
  const effectiveCalldatas = useMemo(
    () =>
      calldatas.map(
        (calldata, index) => calldataOverrides?.[index] ?? calldata
      ),
    [calldatas, calldataOverrides]
  );
  const groups = useMemo(
    () =>
      normalizePayloadActions({
        targets,
        values,
        calldatas: effectiveCalldatas,
      }),
    [targets, values, effectiveCalldatas]
  );

  if (targets.length === 0) {
    return (
      <div className="glass-subtle backdrop-blur rounded-xl p-4">
        <p className="text-sm text-muted-foreground">
          No actions in this proposal.
        </p>
      </div>
    );
  }

  const hasOverrides =
    calldataOverrides && Object.keys(calldataOverrides).length > 0;
  const finalActionCount = groups.reduce(
    (count, group) =>
      count + (group.isCanonicalRoute ? group.actions.length : 1),
    0
  );
  let actionIndex = 0;

  return (
    <div className="space-y-4">
      {/* Override info banner */}
      {nerdMode && hasOverrides && (
        <div className="glass-subtle backdrop-blur rounded-xl p-4 border-l-4 border-l-amber-500 transition-all duration-200 hover:shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 dark:text-amber-400 font-medium text-sm">
              Calldata Overrides Active
            </span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            You have modified calldata for one or more actions.
          </p>
        </div>
      )}

      {groups.some((group) => group.isCanonicalRoute) && (
        <p className="text-xs text-muted-foreground px-1">
          Showing {finalActionCount} final action
          {finalActionCount === 1 ? "" : "s"} from {targets.length} submitted
          call{targets.length === 1 ? "" : "s"}.
        </p>
      )}

      {groups.map((group) => {
        if (!group.isCanonicalRoute) {
          const currentIndex = actionIndex++;
          return (
            <ActionView
              key={`source-${group.sourceIndex}`}
              index={currentIndex}
              target={group.originalTarget}
              value={group.originalValue}
              calldata={calldatas[group.sourceIndex] || "0x"}
              nerdMode={nerdMode}
              overriddenCalldata={calldataOverrides?.[group.sourceIndex]}
              onCalldataChange={(newCalldata) =>
                onCalldataOverrideChange?.(group.sourceIndex, newCalldata)
              }
              governorAddress={governorAddress}
            />
          );
        }

        const firstActionIndex = actionIndex;
        actionIndex += group.actions.length;
        return (
          <div key={`route-${group.sourceIndex}`} className="space-y-3">
            <GovernanceRouteDetails
              group={group}
              originalCalldata={calldatas[group.sourceIndex] || "0x"}
              overriddenCalldata={calldataOverrides?.[group.sourceIndex]}
              nerdMode={nerdMode}
              governorAddress={governorAddress}
              onCalldataChange={(newCalldata) =>
                onCalldataOverrideChange?.(group.sourceIndex, newCalldata)
              }
            />
            {group.actions.map((action, groupActionIndex) => (
              <ActionView
                key={`${group.sourceIndex}-${groupActionIndex}`}
                index={firstActionIndex + groupActionIndex}
                target={action.target}
                value={action.value}
                calldata={action.calldata}
                nerdMode={nerdMode}
                governorAddress={governorAddress}
                chainContext={action.chain}
                simulation={action.simulation}
                editable={false}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
