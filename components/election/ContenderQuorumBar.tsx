import { formatVotingPower } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

interface ContenderQuorumBarProps {
  votes: string;
  quorumThreshold: string;
}

export function ContenderQuorumBar({
  votes,
  quorumThreshold,
}: ContenderQuorumBarProps): React.ReactElement {
  const votesBig = BigInt(votes);
  const thresholdBig = BigInt(quorumThreshold);
  const qualified = thresholdBig > BigInt(0) && votesBig >= thresholdBig;
  const percent =
    thresholdBig > BigInt(0)
      ? Math.min(Number((votesBig * BigInt(10000)) / thresholdBig) / 100, 100)
      : 0;

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-xs gap-4">
        {qualified ? (
          <span className="text-green-500 font-medium">Qualified</span>
        ) : (
          <>
            <span className="text-muted-foreground shrink-0 whitespace-pre min-w-[20%]">
              {formatVotingPower(votes)} / {formatVotingPower(quorumThreshold)}{" "}
              Votes
            </span>
            <div className="h-1.5 bg-muted rounded-full w-full shrink">
              <div
                className={cn("h-1.5 rounded-full transition-all bg-primary")}
                style={{ width: `${percent}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
