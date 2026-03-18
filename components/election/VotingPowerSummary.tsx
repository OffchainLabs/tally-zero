import { formatVotingPower } from "@/lib/format-utils";

interface VotingPowerSummaryProps {
  totalVotingPower: bigint | undefined;
  usedVotes: bigint | undefined;
  availableVotes: bigint | undefined;
}

export function VotingPowerSummary({
  totalVotingPower,
  usedVotes,
  availableVotes,
}: VotingPowerSummaryProps): React.ReactElement {
  return (
    <div className="glass-subtle rounded-lg p-3 space-y-1">
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
    </div>
  );
}
