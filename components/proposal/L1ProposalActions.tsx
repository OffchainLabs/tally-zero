"use client";

import type { DecodedCall } from "@offchainlabs/l1-voting-proving";
import { formatEther } from "viem";

/**
 * What an L1 proposal executes, decoded from its on-chain calldata: a retryable's Arbitrum call
 * and the executor call inside it are shown nested. Unknown calldata is shown raw.
 */
export function L1ProposalActions({
  actions,
  error,
}: {
  actions: DecodedCall[] | null;
  error: string | null;
}) {
  if (error)
    return (
      <p className="text-sm text-destructive">
        Could not read the actions from Ethereum: {error}
      </p>
    );
  if (!actions)
    return (
      <p className="text-sm text-muted-foreground">
        Reading the actions from Ethereum…
      </p>
    );
  return (
    <ol className="space-y-3 text-sm" data-testid="l1-proposal-actions">
      {actions.map((a, i) => (
        <li key={i}>
          <Call call={a} />
        </li>
      ))}
    </ol>
  );
}

function Call({ call }: { call: DecodedCall }) {
  return (
    <div className="space-y-1 [overflow-wrap:anywhere]">
      <div>
        <span className="font-mono font-semibold">
          {call.functionName ?? "unknown call"}
        </span>{" "}
        on <span className="font-mono">{call.target}</span>
        {call.value > BigInt(0) ? ` with ${formatEther(call.value)} ETH` : ""}
      </div>
      {call.args && !call.inner ? (
        <div className="font-mono text-xs text-muted-foreground">
          ({call.args.map(String).join(", ")})
        </div>
      ) : null}
      {!call.functionName ? (
        <div className="font-mono text-xs text-muted-foreground">
          {call.data}
        </div>
      ) : null}
      {call.inner ? (
        <div className="ml-4 border-l pl-3">
          <Call call={call.inner} />
        </div>
      ) : null}
    </div>
  );
}
