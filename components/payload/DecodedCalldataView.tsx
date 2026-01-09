"use client";

import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { Badge } from "@components/ui/Badge";
import { CopyableText } from "@components/ui/CopyableText";
import { SimulationButton } from "@components/ui/SimulationButton";
import {
  getAddressLabel,
  type DecodedCalldata,
  type DecodedParameter,
  type KnownChain,
} from "@gzeoneth/gov-tracker";
import {
  simulateCall,
  simulateRetryableTicket,
  simulateTimelockBatch,
} from "@lib/tenderly";
import { truncateMiddle } from "@lib/text-utils";
import { cn } from "@lib/utils";

function getChainLabel(chain: KnownChain): string {
  const labels: Record<KnownChain, string> = {
    ethereum: "L1",
    arb1: "Arb1",
    nova: "Nova",
  };
  return labels[chain];
}

/**
 * Extract function name from signature
 * e.g., "execute(address,uint256)" -> "execute"
 */
function getFunctionName(decoded: DecodedCalldata): string {
  if (decoded.isRetryable) {
    return decoded.targetChain
      ? `Retryable Ticket to ${decoded.targetChain}`
      : "Retryable Ticket";
  }
  if (!decoded.signature) {
    return "Unknown";
  }
  // Extract function name before opening parenthesis
  const match = decoded.signature.match(/^([^(]+)/);
  return match?.[1] || decoded.signature;
}

export interface ParameterViewProps {
  param: DecodedParameter;
  index: number;
  siblingParams?: DecodedParameter[];
  chainContext?: KnownChain;
}

/**
 * Display a single decoded parameter with nested calldata support
 */
export function ParameterView({
  param,
  index,
  siblingParams,
  chainContext = "arb1",
}: ParameterViewProps) {
  // Check if this is a bytes[] with decoded nested array
  const hasNestedArray = param.nestedArray && param.nestedArray.length > 0;
  const hasNestedSingle = param.nested && param.nested.signature != null;

  // Compute UI metadata for addresses using gov-tracker
  const isAddress = param.type === "address";
  const rawValueStr = param.rawValue as string;
  const link = isAddress
    ? getAddressExplorerUrl(rawValueStr, chainContext)
    : undefined;
  const addressLabel = isAddress
    ? getAddressLabel(rawValueStr, chainContext)
    : undefined;
  const chainLabel = isAddress ? getChainLabel(chainContext) : undefined;

  // Render the value - displayValue is already truncated by gov-tracker
  const renderValue = () => {
    const displayText = hasNestedArray
      ? `[${param.nestedArray!.length} calls]`
      : param.displayValue;

    if (link && isAddress) {
      const linkText = addressLabel || displayText;
      const titleText = addressLabel ? displayText : undefined;

      return (
        <span className="inline-flex items-center gap-1 flex-wrap">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            title={titleText}
            className={cn(
              "text-blue-600 dark:text-blue-400 hover:underline",
              addressLabel ? "font-medium" : "font-mono"
            )}
          >
            {linkText}
          </a>
          {chainLabel && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {chainLabel}
            </Badge>
          )}
        </span>
      );
    }

    // Use CopyableText for nested calldata to allow copying the full value
    if (param.isNested && !hasNestedArray) {
      return (
        <CopyableText
          value={rawValueStr}
          displayText={displayText}
          className="text-xs"
        />
      );
    }

    return <span className="font-mono break-all">{displayText}</span>;
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
          <DecodedCalldataView
            decoded={param.nested!}
            isDecoding={false}
            chainContext={
              param.nested!.targetChain &&
              param.nested!.targetChain !== "unknown"
                ? param.nested!.targetChain
                : chainContext
            }
          />
          {(() => {
            const nested = param.nested!;
            const nestedTargetChain = nested.targetChain;
            if (nested.isRetryable) return null;
            if (!nested.signature?.match(/^schedule(Batch)?\(/)) return null;
            const targetParam = siblingParams?.find(
              (p) => p.type === "address"
            );
            if (!targetParam || !param.rawValue) return null;
            const nestedChain =
              nestedTargetChain && nestedTargetChain !== "unknown"
                ? nestedTargetChain
                : chainContext;
            return (
              <div className="mt-2">
                <SimulationButton
                  type="timelock"
                  onSimulate={() =>
                    simulateTimelockBatch({
                      timelockAddress: targetParam.rawValue as string,
                      calldata: param.rawValue as string,
                      chain: nestedChain,
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
          {param.nestedArray!.map((nestedCall, nestedIdx) => {
            const isRetryableTicket = nestedCall.isRetryable;
            return (
              <div
                key={nestedIdx}
                className={cn(
                  "pl-2 sm:pl-3 border-l-2 glass-subtle rounded-lg p-2 sm:p-3 transition-all duration-200 hover:shadow-sm",
                  isRetryableTicket
                    ? "border-l-amber-500/50"
                    : "border-l-violet-500/50"
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-medium block mb-2 uppercase tracking-wide",
                    isRetryableTicket
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-violet-600 dark:text-violet-400"
                  )}
                >
                  Batch action [{nestedIdx}]
                </span>
                {nestedCall.signature != null || isRetryableTicket ? (
                  <>
                    <DecodedCalldataView
                      decoded={nestedCall}
                      isDecoding={false}
                      chainContext={
                        nestedCall.targetChain &&
                        nestedCall.targetChain !== "unknown"
                          ? nestedCall.targetChain
                          : chainContext
                      }
                    />
                    {isRetryableTicket &&
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

                        if (l2TargetParam && l2CalldataParam) {
                          return (
                            <div className="mt-2">
                              <SimulationButton
                                type="retryable"
                                onSimulate={() =>
                                  simulateRetryableTicket({
                                    l2Target: l2TargetParam.rawValue as string,
                                    l2Calldata:
                                      l2CalldataParam.rawValue as string,
                                    l2Value: String(
                                      l2ValueParam?.rawValue ?? "0"
                                    ),
                                    chain: nestedCall.targetChain || "unknown",
                                  })
                                }
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}
                    {!isRetryableTicket &&
                      (() => {
                        const addressArrayParam = siblingParams?.find(
                          (p) => p.type === "address[]"
                        );
                        if (!addressArrayParam) return null;
                        // Use rawValue which contains the original address array
                        const addresses = addressArrayParam.rawValue as
                          | string[]
                          | undefined;
                        const batchTarget = addresses?.[nestedIdx];
                        if (!batchTarget || !nestedCall.raw) return null;
                        return (
                          <div className="mt-2">
                            <SimulationButton
                              type="call"
                              onSimulate={() =>
                                simulateCall({
                                  target: batchTarget,
                                  calldata: nestedCall.raw,
                                  chain: "ethereum",
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
                        ? truncateMiddle(nestedCall.raw, 40, 36)
                        : undefined
                    }
                    className="text-[10px] text-muted-foreground"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface DecodedCalldataViewProps {
  decoded: DecodedCalldata | null;
  isDecoding: boolean;
  chainContext?: KnownChain;
}

/**
 * Display decoded calldata with function signature and parameters
 */
export function DecodedCalldataView({
  decoded,
  isDecoding,
  chainContext: explicitChainContext,
}: DecodedCalldataViewProps) {
  // Use explicit chain context, or from decoded data, or default to arb1
  const chainContext: KnownChain =
    explicitChainContext ||
    (decoded?.targetChain && decoded.targetChain !== "unknown"
      ? decoded.targetChain
      : "arb1");
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
          {getFunctionName(decoded)}()
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
              chainContext={chainContext}
            />
          ))}
        </div>
      )}
    </div>
  );
}
