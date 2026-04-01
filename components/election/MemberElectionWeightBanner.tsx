import { AlertCircle, ExternalLink, Info } from "lucide-react";

import type { WeightInfo } from "@/lib/election-weight";

import { VoteWeightChart } from "./VoteWeightChart";

interface MemberElectionWeightBannerProps {
  isFullWeight: boolean;
  weightInfo: WeightInfo | undefined;
}

export function MemberElectionWeightBanner({
  isFullWeight,
  weightInfo,
}: MemberElectionWeightBannerProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
      {isFullWeight || !weightInfo || weightInfo.pct === 100 ? (
        <span className="text-green-500 text-xs font-medium">
          Full weight voting active
        </span>
      ) : weightInfo.pct > 0 ? (
        <div className="flex items-center gap-1 text-yellow-500">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="text-xs">
            Vote weight is now decreasing ({weightInfo.pct.toFixed(1)}%),
            earlier votes count more
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-yellow-500">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="text-xs">Vote weight has reached minimum</span>
        </div>
      )}
      <div className="flex gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="space-y-2 flex-1 min-w-0">
          <p>
            The 21-day member election uses a decaying vote weight to encourage
            early participation:
          </p>
          <VoteWeightChart currentPct={weightInfo?.pct} />
          <a
            href="https://docs.arbitrum.foundation/dao-constitution#section-4-security-council-elections"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
          >
            Learn more in the DAO Constitution
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
