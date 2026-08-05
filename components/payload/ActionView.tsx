"use client";

import { useCallback, useState } from "react";
import { formatEther } from "viem";

import { Badge } from "@components/ui/Badge";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Label } from "@components/ui/Label";
import { SimulationButton } from "@components/ui/SimulationButton";

import { L2_TREASURY_TIMELOCK } from "@config/arbitrum-governance";
import { isTreasuryGovernor } from "@config/governors";
import type { KnownChain } from "@gzeoneth/gov-tracker";
import { useCopyToClipboard } from "@hooks/use-copy-to-clipboard";
import { useDecodedCalldata } from "@hooks/use-decoded-calldata";
import { getAddressExplorerUrl, getExplorerName } from "@lib/explorer-utils";
import type {
  EffectivePayloadActionType,
  PayloadActionSimulation,
} from "@lib/payload-actions";
import { simulateCall, simulateRetryableTicket } from "@lib/tenderly";
import { cn } from "@lib/utils";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";

import { DecodedCalldataView } from "./DecodedCalldataView";
import { RawCalldataDisplay } from "./RawCalldataDisplay";

export interface ActionViewProps {
  index: number;
  target: string;
  value: string;
  calldata: string;
  nerdMode?: boolean;
  overriddenCalldata?: string;
  onCalldataChange?: (newCalldata: string | undefined) => void;
  governorAddress?: string;
  chainContext?: KnownChain;
  actionType?: EffectivePayloadActionType;
  simulation?: PayloadActionSimulation;
  editable?: boolean;
  title?: string;
  showIndex?: boolean;
}

const CHAIN_LABELS: Record<KnownChain, string> = {
  ethereum: "Ethereum",
  arb1: "Arbitrum One",
  nova: "Nova",
};

/**
 * Single action view with calldata decoding and optional editing
 */
export function ActionView({
  index,
  target,
  value,
  calldata,
  nerdMode = false,
  overriddenCalldata,
  onCalldataChange,
  governorAddress,
  chainContext,
  actionType,
  simulation,
  editable = true,
  title = "Action",
  showIndex = true,
}: ActionViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(overriddenCalldata || calldata);
  const { copied: targetCopied, copy: copyTarget } = useCopyToClipboard();

  const effectiveCalldata = overriddenCalldata ?? calldata;
  const isOverridden = overriddenCalldata !== undefined;

  const ethValue = formatEther(BigInt(value));
  const hasValue = ethValue !== "0";
  const hasCalldata = effectiveCalldata !== "0x" && effectiveCalldata !== "";
  const targetChain = chainContext ?? "arb1";
  const targetExplorerUrl = getAddressExplorerUrl(target, targetChain);

  const { decoded, isDecoding } = useDecodedCalldata({
    calldata: effectiveCalldata,
    targetAddress: target,
    enabled: hasCalldata,
    chainContext,
  });

  const showDecoded = decoded && decoded.decodingSource !== "failed";

  const handleSaveEdit = useCallback(() => {
    if (editValue !== calldata) {
      onCalldataChange?.(editValue);
    } else {
      onCalldataChange?.(undefined);
    }
    setIsEditing(false);
  }, [editValue, calldata, onCalldataChange]);

  const handleResetOverride = useCallback(() => {
    onCalldataChange?.(undefined);
    setEditValue(calldata);
    setIsEditing(false);
  }, [calldata, onCalldataChange]);

  const handleCancelEdit = useCallback(() => {
    setEditValue(overriddenCalldata || calldata);
    setIsEditing(false);
  }, [overriddenCalldata, calldata]);

  return (
    <div
      className={cn(
        "glass-subtle backdrop-blur rounded-xl p-3 sm:p-4 space-y-2 sm:space-y-3 text-sm transition-all duration-200 hover:shadow-md",
        isOverridden && "border-l-4 border-l-amber-500"
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showIndex && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {index + 1}
            </span>
          )}
          <span className="text-sm font-medium text-foreground">{title}</span>
          {chainContext && (
            <Badge variant="outline" className="text-[10px] bg-muted/40">
              {CHAIN_LABELS[chainContext]}
            </Badge>
          )}
          {actionType && (
            <Badge
              variant="outline"
              className="text-[10px] bg-muted/40"
              title={
                actionType === "delegatecall"
                  ? "Executed with the UpgradeExecutor's context"
                  : "Executed as a normal contract call"
              }
            >
              {actionType === "delegatecall" ? "Delegatecall" : "Call"}
            </Badge>
          )}
          {isOverridden && (
            <Badge
              variant="outline"
              className="text-[10px] border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
            >
              Override
            </Badge>
          )}
        </div>
        {hasValue && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {ethValue} ETH
          </span>
        )}
      </div>

      {/* Target address */}
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 dark:bg-muted/10">
        <span className="text-xs text-muted-foreground shrink-0 font-medium">
          To:
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <a
            href={targetExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`View on ${getExplorerName(targetChain)}`}
            className="text-xs font-mono break-all text-blue-600 dark:text-blue-400 hover:underline"
          >
            {target}
          </a>
          <button
            type="button"
            onClick={() => copyTarget(target)}
            aria-label="Copy target address"
            title="Copy target address"
            className={cn(
              "p-1 rounded shrink-0 transition-colors",
              "text-muted-foreground hover:text-primary hover:bg-muted/60",
              targetCopied && "text-emerald-500 hover:text-emerald-500"
            )}
          >
            {targetCopied ? (
              <CheckIcon className="w-3.5 h-3.5" />
            ) : (
              <CopyIcon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Calldata section */}
      {hasCalldata && (
        <div className="space-y-2">
          {/* Decoded view */}
          {(showDecoded || isDecoding) && !isEditing && (
            <DecodedCalldataView
              decoded={decoded}
              isDecoding={isDecoding}
              chainContext={chainContext}
            />
          )}

          {hasCalldata && !isEditing && simulation && (
            <SimulationButton
              type={simulation.type}
              onSimulate={() =>
                simulation.type === "retryable"
                  ? simulateRetryableTicket(simulation)
                  : simulateCall(simulation)
              }
            />
          )}

          {showDecoded && !isEditing && !simulation && governorAddress && (
            <SimulationButton
              type="call"
              onSimulate={() =>
                simulateCall({
                  target,
                  calldata: effectiveCalldata,
                  chain: "arb1",
                  from: isTreasuryGovernor(governorAddress)
                    ? L2_TREASURY_TIMELOCK.address
                    : undefined,
                })
              }
            />
          )}

          {/* Editing mode */}
          {nerdMode && editable && isEditing ? (
            <div className="glass-subtle backdrop-blur rounded-lg p-3 space-y-3">
              <Label className="text-xs font-medium">Edit Calldata (hex)</Label>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="0x..."
                className="font-mono text-xs bg-background/50"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelEdit}
                  className="transition-all duration-200"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={
                    !editValue.startsWith("0x") || editValue.length < 10
                  }
                  className="transition-all duration-200"
                >
                  Save Override
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Raw data - always visible in nerd mode, collapsible otherwise */}
              <details className="group" open={nerdMode || isOverridden}>
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1.5 py-1.5 transition-colors duration-200">
                  {showDecoded
                    ? "Raw calldata"
                    : `Calldata (${effectiveCalldata.length} bytes)`}
                  {!showDecoded && !isDecoding && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-muted/50"
                    >
                      Unknown
                    </Badge>
                  )}
                </summary>
                <div className="mt-2 space-y-2">
                  <RawCalldataDisplay
                    calldata={effectiveCalldata}
                    nerdMode={nerdMode && editable}
                    isOverridden={isOverridden}
                    onEdit={() => {
                      setEditValue(effectiveCalldata);
                      setIsEditing(true);
                    }}
                    onReset={handleResetOverride}
                  />
                </div>
              </details>
            </>
          )}
        </div>
      )}

      {!hasCalldata && (
        <div className="p-2 rounded-lg bg-muted/30 dark:bg-muted/10">
          <span className="text-xs text-muted-foreground italic">
            No calldata
          </span>
        </div>
      )}
    </div>
  );
}
