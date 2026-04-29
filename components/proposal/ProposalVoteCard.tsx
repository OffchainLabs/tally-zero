"use client";

import VoteForm from "@/components/form/VoteForm";
import { Card, CardContent } from "@/components/ui/Card";
import { proposalSchema } from "@/config/schema";
import { useNerdMode } from "@/context/NerdModeContext";
import { useProposalHasVoted } from "@/hooks/use-proposal-has-voted";
import { cn } from "@/lib/utils";

export function ProposalVoteCard({
  proposal,
  hasCalldataOverrides,
}: {
  proposal: ReturnType<typeof proposalSchema.parse>;
  hasCalldataOverrides: boolean;
}) {
  const { nerdMode } = useNerdMode();
  const { hasRecordedVote } = useProposalHasVoted({
    proposalId: proposal.id,
    governorAddress: proposal.contractAddress as `0x${string}`,
  });

  return (
    <Card
      variant={!hasRecordedVote ? "glass" : undefined}
      className={cn(
        "max-h-fit",
        !hasRecordedVote
          ? "rounded-2xl border border-white/40 shadow-lg shadow-black/5 dark:border-white/10"
          : "border-none"
      )}
    >
      <CardContent className={cn(!hasRecordedVote ? "p-4 md:p-6" : "p-0")}>
        <div className="space-y-3">
          {nerdMode && hasCalldataOverrides && (
            <div className="glass-subtle backdrop-blur bg-orange-500/10 border-orange-500/30 rounded-lg p-3 text-xs text-orange-600 dark:text-orange-400">
              You have calldata overrides active in the Payload tab.
            </div>
          )}
          <VoteForm proposal={proposal} variant="page" />
        </div>
      </CardContent>
    </Card>
  );
}
