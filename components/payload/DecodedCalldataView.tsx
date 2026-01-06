"use client";

import { Badge } from "@components/ui/Badge";
import { CopyableText } from "@components/ui/CopyableText";
import { SimulationButton } from "@components/ui/SimulationButton";
import type { DecodedCalldata, DecodedParameter } from "@lib/calldata-decoder";
import {
  simulateCall,
  simulateRetryableTicket,
  simulateTimelockBatch,
  type ChainType,
} from "@lib/tenderly";
import { truncateMiddle } from "@lib/text-utils";
import { cn } from "@lib/utils";

// Wrapper to maintain backwards compatibility with existing calls
function truncateValue(value: string, maxLength = 50): string {
  if (value.length <= maxLength) return value;
  return truncateMiddle(value, 24, 20);
}

// Chain ID mapping for timelock simulations
const TIMELOCK_CHAIN_IDS: Record<string, string> = {
  L1: "1",
  Arb1: "42161",
  Nova: "42170",
};

function getChainTypeFromLabel(chainLabel?: string): ChainType {
  if (!chainLabel) return "unknown";
  const label = chainLabel.toLowerCase();
  if (label === "l1" || label === "ethereum") return "L1";
  if (label === "arb1" || label === "arbitrum one") return "Arb1";
  if (label === "nova" || label === "arbitrum nova") return "Nova";
  return "unknown";
}

function parseAddressArray(value: string): string[] {
  const match = value.match(/\[(.*)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("0x"));
}

export interface ParameterViewProps {
  param: DecodedParameter;
  index: number;
  siblingParams?: DecodedParameter[];
}

/**
 * Display a single decoded parameter with nested calldata support
 */
export function ParameterView({
  param,
  index,
  siblingParams,
}: ParameterViewProps) {
  // Check if this is a bytes[] with decoded nested array
  const hasNestedArray = param.nestedArray && param.nestedArray.length > 0;
  const hasNestedSingle = param.nested && param.nested.functionName;

  // Render the value - either as a link or plain text
  const renderValue = () => {
    const isTruncatable =
      param.isNested && !hasNestedArray && param.value.length > 50;
    const displayValue =
      param.isNested && !hasNestedArray
        ? truncateValue(param.value)
        : hasNestedArray
          ? `[${param.nestedArray!.length} calls]`
          : param.value;

    if (param.link && param.type === "address") {
      // Show label as primary text if available, address as title
      const linkText = param.addressLabel || displayValue;
      const titleText = param.addressLabel ? displayValue : undefined;

      return (
        <span className="inline-flex items-center gap-1 flex-wrap">
          <a
            href={param.link}
            target="_blank"
            rel="noopener noreferrer"
            title={titleText}
            className={cn(
              "text-blue-600 dark:text-blue-400 hover:underline",
              param.addressLabel ? "font-medium" : "font-mono"
            )}
          >
            {linkText}
          </a>
          {param.chainLabel && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {param.chainLabel}
            </Badge>
          )}
        </span>
      );
    }

    // Use CopyableText for truncated values to allow copying the original
    if (isTruncatable) {
      return (
        <CopyableText
          value={param.value}
          displayText={displayValue}
          className="text-xs"
        />
      );
    }

    return <span className="font-mono break-all">{displayValue}</span>;
  };

  return (
    <div className="text-xs space-y-1.5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 py-1">
        <span className="text-muted-foreground font-mono shrink-0 bg-muted/30 dark:bg-muted/10 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] w-fit">
          {param.name !== `arg${index}` ? param.name : `[${index}]`}
          <span className="text-muted-foreground/60 ml-1">{param.type}</span>
        </span>
        <div className="overflow-x-auto">{renderValue()}</div>
      </div>

      {/* Nested single bytes calldata */}
      {hasNestedSingle && (
        <div className="ml-2 sm:ml-4 pl-2 sm:pl-3 border-l-2 border-blue-500/40 glass-subtle rounded-lg p-2 sm:p-3 mt-2 transition-all duration-200 hover:shadow-sm">
          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 block mb-2 uppercase tracking-wide">
            Nested call
          </span>
          <DecodedCalldataView decoded={param.nested!} isDecoding={false} />
          {param.nested!.functionName?.match(/^schedule(Batch)?$/) &&
            (() => {
              const targetParam = siblingParams?.find(
                (p) => p.type === "address"
              );
              if (!targetParam || !param.value) return null;
              const chain = getChainTypeFromLabel(targetParam.chainLabel);
              const networkId =
                TIMELOCK_CHAIN_IDS[chain] || TIMELOCK_CHAIN_IDS.L1;
              return (
                <div className="mt-2">
                  <SimulationButton
                    type="timelock"
                    onSimulate={() =>
                      simulateTimelockBatch({
                        timelockAddress: targetParam.value,
                        calldata: param.value,
                        networkId,
                      })
                    }
                  />
                </div>
              );
            })()}
        </div>
      )}

      {/* Nested bytes[] array - each element is a decoded call */}
      {hasNestedArray && (
        <div className="ml-2 sm:ml-4 space-y-2 sm:space-y-3 mt-2">
          {param.nestedArray!.map((nestedCall, nestedIdx) => (
            <div
              key={nestedIdx}
              className={cn(
                "pl-2 sm:pl-3 border-l-2 glass-subtle rounded-lg p-2 sm:p-3 transition-all duration-200 hover:shadow-sm",
                nestedCall.functionName?.startsWith("Retryable Ticket")
                  ? "border-l-amber-500/50"
                  : "border-l-violet-500/50"
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-medium block mb-2 uppercase tracking-wide",
                  nestedCall.functionName?.startsWith("Retryable Ticket")
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-violet-600 dark:text-violet-400"
                )}
              >
                Batch action [{nestedIdx}]
              </span>
              {nestedCall.functionName ? (
                <>
                  <DecodedCalldataView
                    decoded={nestedCall}
                    isDecoding={false}
                  />
                  {nestedCall.functionName?.startsWith("Retryable Ticket") &&
                    nestedCall.parameters &&
                    (() => {
                      const l2TargetParam = nestedCall.parameters.find(
                        (p) => p.name === "l2Target"
                      );
                      const l2CalldataParam = nestedCall.parameters.find(
                        (p) => p.name === "l2Calldata"
                      );
                      const l2ValueParam = nestedCall.parameters.find(
                        (p) => p.name === "l2Value"
                      );
                      const chainFromName = nestedCall.functionName?.includes(
                        "Nova"
                      )
                        ? "nova"
                        : nestedCall.functionName?.includes("Arbitrum One")
                          ? "arb1"
                          : "unknown";

                      if (l2TargetParam && l2CalldataParam) {
                        return (
                          <div className="mt-2">
                            <SimulationButton
                              type="retryable"
                              onSimulate={() =>
                                simulateRetryableTicket({
                                  l2Target: l2TargetParam.value,
                                  l2Calldata: l2CalldataParam.value,
                                  l2Value: l2ValueParam?.value?.split(" ")[0],
                                  chain: chainFromName as
                                    | "arb1"
                                    | "nova"
                                    | "unknown",
                                })
                              }
                            />
                          </div>
                        );
                      }
                      return null;
                    })()}
                  {!nestedCall.functionName?.startsWith("Retryable Ticket") &&
                    (() => {
                      const addressArrayParam = siblingParams?.find(
                        (p) => p.type === "address[]"
                      );
                      if (!addressArrayParam) return null;
                      const addresses = parseAddressArray(
                        addressArrayParam.value
                      );
                      const batchTarget = addresses[nestedIdx];
                      if (!batchTarget || !nestedCall.raw) return null;
                      return (
                        <div className="mt-2">
                          <SimulationButton
                            type="call"
                            onSimulate={() =>
                              simulateCall({
                                target: batchTarget,
                                calldata: nestedCall.raw,
                                chain: "L1",
                              })
                            }
                          />
                        </div>
                      );
                    })()}
                </>
              ) : (
                <CopyableText
                  value={nestedCall.raw}
                  displayText={
                    nestedCall.raw.length > 80
                      ? truncateValue(nestedCall.raw, 80)
                      : undefined
                  }
                  className="text-[10px] text-muted-foreground"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface DecodedCalldataViewProps {
  decoded: DecodedCalldata | null;
  isDecoding: boolean;
}

/**
 * Display decoded calldata with function signature and parameters
 */
export function DecodedCalldataView({
  decoded,
  isDecoding,
}: DecodedCalldataViewProps) {
  if (isDecoding) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-lg bg-muted/20">
        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        <span>Decoding calldata...</span>
      </div>
    );
  }

  if (!decoded || decoded.decodingSource === "failed") {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Function signature badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="secondary"
          className="font-mono text-xs px-2.5 py-1 bg-primary/10 text-primary border-0"
        >
          {decoded.functionName}()
        </Badge>
        <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50">
          {decoded.decodingSource === "local" ? "local" : "4byte"}
        </span>
      </div>

      {/* Decoded parameters */}
      {decoded.parameters && decoded.parameters.length > 0 && (
        <div className="space-y-2 pl-3 border-l-2 border-primary/20 ml-1">
          {decoded.parameters.map((param, idx) => (
            <ParameterView
              key={idx}
              param={param}
              index={idx}
              siblingParams={decoded.parameters ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
