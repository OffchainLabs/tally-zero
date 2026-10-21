"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { L1VotePanel } from "@/components/l1-voting/L1VotePanel";
import IndexerProposalStages from "@/components/proposal/IndexerProposalStages";
import { L1ProposalVoters } from "@/components/proposal/L1ProposalVoters";
import { ProposalPageError } from "@/components/proposal/ProposalPageError";
import { ProposalPageSkeleton } from "@/components/proposal/ProposalPageSkeleton";
import { Badge } from "@/components/ui/Badge";
import { GovernorBadge } from "@/components/ui/GovernorBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  L1_VOTING_GOVERNOR_NAME,
  registerL1VotingGovernor,
} from "@/config/governors";
import { useL1Proposal } from "@/hooks/use-l1-proposal";
import { VOTE_COLORS, type VoteType } from "@/lib/badge-colors";
import {
  explorerChainForChainId,
  getBlockExplorerUrl,
} from "@/lib/explorer-utils";
import { formatVotingPower } from "@/lib/format-utils";
import {
  getL1VotingDeadline,
  resolveL1ProposalState,
  snapshotLockExplanation,
} from "@/lib/l1-proposal";
import { getL1DisplayState } from "@/lib/lifecycle-utils";
import { proposalSanitizeSchema } from "@/lib/sanitize-schema";
import { findStateByValue } from "@/lib/state-utils";
import type { TallyProposalVoteSummary } from "@/lib/tally-data/types";
import { extractProposalTitle, truncateText } from "@/lib/text-utils";
import { cn } from "@/lib/utils";

type L1ProposalTab = "description" | "stages" | "voters";

/**
 * The detail page of a proposal on the L1 voting governor. Everything comes
 * from the indexer and the governor on its L1 chain; the Arbitrum One proposal
 * page's RPC reads and gov-tracker trace do not apply.
 */
export function L1ProposalPage({
  proposalId,
  governorAddress,
  chainId,
}: {
  proposalId: string;
  governorAddress: string;
  chainId: number;
}) {
  // Address-only lookups downstream (badges, governor type) need to know it.
  registerL1VotingGovernor(governorAddress, chainId);

  const { entry, voteSummary, onChain, currentBlock, isLoading, error } =
    useL1Proposal({ proposalId, governorAddress, chainId });
  const [activeTab, setActiveTab] = useState<L1ProposalTab>("description");

  if (isLoading) return <ProposalPageSkeleton />;
  if (error) {
    return (
      <ProposalPageError title="Failed to load proposal" message={error} />
    );
  }
  if (!entry) {
    return (
      <ProposalPageError
        title="Proposal not found"
        message={`Could not find proposal ${proposalId}.`}
      />
    );
  }

  const state = resolveL1ProposalState(onChain.state, entry.state);
  const display = getL1DisplayState(
    state,
    entry.executionPhase,
    entry.executionCancelled
  );
  const stateValue = findStateByValue(display.state);
  const description = entry.description ?? `Proposal ${proposalId}`;
  const title = truncateText(extractProposalTitle(description), 140);

  return (
    <div className="space-y-4" data-testid="l1-proposal-page">
      <div className="glass md:rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <GovernorBadge governorName={L1_VOTING_GOVERNOR_NAME} />
            {stateValue && (
              <Badge
                data-testid="l1-proposal-state"
                data-state={display.state.toUpperCase()}
                className={cn(
                  "text-xs font-semibold inline-flex items-center",
                  stateValue.bgColor
                )}
              >
                <stateValue.icon
                  className="mr-1"
                  style={{ strokeWidth: "2" }}
                />
                {display.display}
              </Badge>
            )}
            {display.phaseLabel && (
              <span className="text-xs text-muted-foreground">
                {display.phaseLabel}
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="space-y-6 min-w-0">
          <L1VotingStatus
            chainId={chainId}
            snapshotBlock={onChain.snapshotBlock ?? entry.snapshotBlock}
            snapshotLocked={
              onChain.snapshotLocked ?? Boolean(entry.snapshotLocked)
            }
            deadlineBlock={onChain.deadlineBlock}
            currentBlock={currentBlock}
          />
          <L1Tallies voteSummary={voteSummary} quorum={entry.quorum ?? null} />
          <L1VotePanel
            proposalId={proposalId}
            governorAddress={governorAddress}
          />
        </div>

        <div className="md:col-span-2 min-w-0 glass md:rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5">
          <Tabs
            value={activeTab}
            onValueChange={(tab) => setActiveTab(tab as L1ProposalTab)}
            className="flex flex-col"
          >
            <TabsList className="w-full justify-start">
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger value="stages">Lifecycle</TabsTrigger>
              <TabsTrigger value="voters">Voters</TabsTrigger>
            </TabsList>
            <TabsContent value="description">
              <div className="glass-subtle backdrop-blur rounded-lg p-4 text-sm [overflow-wrap:anywhere] prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    [rehypeSanitize, proposalSanitizeSchema],
                    rehypeRaw,
                  ]}
                >
                  {description}
                </ReactMarkdown>
              </div>
            </TabsContent>
            <TabsContent value="stages">
              <div className="glass-subtle backdrop-blur rounded-lg">
                <IndexerProposalStages
                  proposalId={proposalId}
                  governorAddress={governorAddress}
                  governorType="l1"
                />
              </div>
            </TabsContent>
            <TabsContent value="voters">
              <div className="glass-subtle backdrop-blur rounded-lg p-4">
                <L1ProposalVoters
                  proposalId={proposalId}
                  governorAddress={governorAddress}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function BlockNumber({ block, chainId }: { block: number; chainId: number }) {
  const explorerChain = explorerChainForChainId(chainId);
  const text = block.toLocaleString();
  if (!explorerChain) return <span className="font-mono">{text}</span>;
  return (
    <a
      href={getBlockExplorerUrl(block, explorerChain)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono underline decoration-dotted underline-offset-2 hover:text-primary"
    >
      {text}
    </a>
  );
}

function L1VotingStatus({
  chainId,
  snapshotBlock,
  snapshotLocked,
  deadlineBlock,
  currentBlock,
}: {
  chainId: number;
  snapshotBlock: number;
  snapshotLocked: boolean;
  deadlineBlock: number | undefined;
  currentBlock: number | null;
}) {
  const deadline =
    deadlineBlock !== undefined && deadlineBlock > 0 && currentBlock !== null
      ? getL1VotingDeadline(deadlineBlock, currentBlock, chainId)
      : null;

  return (
    <div className="glass rounded-2xl border border-white/40 dark:border-white/10 p-4 space-y-3 text-sm">
      <div data-testid="l1-snapshot">
        {snapshotLocked ? (
          <p className="font-medium">
            Snapshot locked at L1 block{" "}
            <BlockNumber block={snapshotBlock} chainId={chainId} />
          </p>
        ) : (
          <p className="font-medium">Snapshot not locked yet</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {snapshotLocked
            ? snapshotLockExplanation(chainId)
            : "Votes open once the snapshot is locked against a confirmed Arbitrum assertion."}
        </p>
      </div>

      <div data-testid="l1-deadline">
        {deadline ? (
          <>
            <p className="font-medium">
              Voting {deadline.hasEnded ? "ended" : "ends"} at L1 block{" "}
              <BlockNumber block={deadline.deadlineBlock} chainId={chainId} />
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {deadline.hasEnded
                ? `About ${deadline.estimatedAt.toLocaleString()}`
                : `${deadline.blocksRemaining.toLocaleString()} blocks to go, about ${deadline.estimatedAt.toLocaleString()}`}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Reading the voting deadline...
          </p>
        )}
      </div>
    </div>
  );
}

const TALLY_ROWS: Array<{ key: VoteType; label: string }> = [
  { key: "for", label: "For" },
  { key: "against", label: "Against" },
  { key: "abstain", label: "Abstain" },
];

function L1Tallies({
  voteSummary,
  quorum,
}: {
  voteSummary: TallyProposalVoteSummary | null;
  quorum: string | null;
}) {
  return (
    <div
      className="glass rounded-2xl border border-white/40 dark:border-white/10 p-4 space-y-2 text-sm"
      data-testid="l1-tallies"
    >
      {TALLY_ROWS.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between">
          <span className={cn("font-medium", VOTE_COLORS[key].text)}>
            {label}
          </span>
          <span className="tabular-nums">
            {voteSummary ? formatVotingPower(voteSummary[key].weight) : "-"}
            <span className="ml-2 text-xs text-muted-foreground">
              {voteSummary ? `${voteSummary[key].voterCount} voters` : ""}
            </span>
          </span>
        </div>
      ))}
      {quorum && (
        <p className="text-xs text-muted-foreground pt-1">
          Quorum: {formatVotingPower(quorum)}
        </p>
      )}
    </div>
  );
}
