import type { WeightInfo } from "@/lib/election-weight";
import { formatVotingPower } from "@/lib/format-utils";

interface VotingPowerSummaryProps {
  totalVotingPower: bigint | undefined;
  usedVotes: bigint | undefined;
  availableVotes: bigint | undefined;
  weightInfo?: WeightInfo | undefined;
}

export function VotingPowerSummary({
  totalVotingPower,
  usedVotes,
  availableVotes,
  weightInfo,
}: VotingPowerSummaryProps): React.ReactElement {
  // Effective weight of available votes at the current weight %.
  // Uses exact BigInt math matching the on-chain formula:
  //   weight = votes * remaining / duration
  const effectiveWeight =
    weightInfo && availableVotes !== undefined && availableVotes > BigInt(0)
      ? (availableVotes * weightInfo.remaining) / weightInfo.duration
      : undefined;

  return (
    <div className="glass-subtle backdrop-blur rounded-lg p-3 space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Total Voting Power</span>
        <span className="font-semibold">
          {totalVotingPower !== undefined
            ? `${formatVotingPower(totalVotingPower)} ARB`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Used</span>
        <span>
          {usedVotes !== undefined
            ? `${formatVotingPower(usedVotes)} ARB`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between text-sm font-medium">
        <span className="text-muted-foreground">Available</span>
        <span className="text-primary">
          {availableVotes !== undefined
            ? `${formatVotingPower(availableVotes)} ARB`
            : "—"}
        </span>
      </div>
      {weightInfo && availableVotes !== undefined && (
        <div className="border-t border-border/50 pt-1.5 mt-1.5 space-y-1">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-muted-foreground">Effective Weight</span>
            <span className="text-yellow-500">
              {effectiveWeight !== undefined
                ? `${formatVotingPower(effectiveWeight)} ARB`
                : "0 ARB"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70">
            {formatVotingPower(availableVotes)} ARB &times;{" "}
            {weightInfo.pct.toFixed(2)}% ={" "}
            {effectiveWeight !== undefined
              ? formatVotingPower(effectiveWeight)
              : "0"}{" "}
            ARB weighted votes
          </p>
        </div>
      )}
    </div>
  );
}
