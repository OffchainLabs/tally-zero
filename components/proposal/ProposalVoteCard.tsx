"use client";

import VoteForm from "@/components/form/VoteForm";
import { Card, CardContent } from "@/components/ui/Card";
import { proposalSchema } from "@/config/schema";
import { useNerdMode } from "@/context/NerdModeContext";

export function ProposalVoteCard({
  proposal,
  hasCalldataOverrides,
}: {
  proposal: ReturnType<typeof proposalSchema.parse>;
  hasCalldataOverrides: boolean;
}) {
  const { nerdMode } = useNerdMode();

  return (
    <Card
      variant="glass"
      className="rounded-2xl border border-white/40 shadow-lg shadow-black/5 dark:border-white/10 max-h-fit"
    >
      <CardContent className="p-4 md:p-6">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">
            Cast Your Vote
          </p>
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
