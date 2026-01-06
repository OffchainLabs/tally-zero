"use client";

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
  if (targets.length === 0) {
    return (
      <div className="glass-subtle rounded-xl p-4">
        <p className="text-sm text-muted-foreground">
          No actions in this proposal.
        </p>
      </div>
    );
  }

  const hasOverrides =
    calldataOverrides && Object.keys(calldataOverrides).length > 0;

  return (
    <div className="space-y-4">
      {/* Override info banner */}
      {nerdMode && hasOverrides && (
        <div className="glass-subtle rounded-xl p-4 border-l-4 border-l-amber-500 transition-all duration-200 hover:shadow-md">
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

      {targets.map((target, idx) => (
        <ActionView
          key={idx}
          index={idx}
          target={target}
          value={values[idx] || "0"}
          calldata={calldatas[idx] || "0x"}
          nerdMode={nerdMode}
          overriddenCalldata={calldataOverrides?.[idx]}
          onCalldataChange={(newCalldata) =>
            onCalldataOverrideChange?.(idx, newCalldata)
          }
          governorAddress={governorAddress}
        />
      ))}
    </div>
  );
}
