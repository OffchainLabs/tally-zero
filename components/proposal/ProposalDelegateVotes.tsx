"use client";

import {
  Minus,
  ThumbsDown,
  ThumbsUp,
  User,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  useProposalDelegateVotes,
  type ProposalDelegateVotesResult,
  type ProposalVoter,
} from "@/hooks/use-proposal-delegate-votes";
import { VOTE_COLORS } from "@/lib/badge-colors";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

interface ProposalDelegateVotesProps {
  proposalId: string;
  governorAddress: string;
  startBlock?: number;
  endBlock?: number;
}

type SupportKey = "for" | "against" | "abstain";

const PAGE_SIZE = 20;

const SECTIONS: Array<{
  key: SupportKey;
  label: string;
  icon: LucideIcon;
  textClass: string;
  dotClass: string;
}> = [
  {
    key: "for",
    label: "For",
    icon: ThumbsUp,
    textClass: VOTE_COLORS.for.text,
    dotClass: VOTE_COLORS.for.dot,
  },
  {
    key: "against",
    label: "Against",
    icon: ThumbsDown,
    textClass: VOTE_COLORS.against.text,
    dotClass: VOTE_COLORS.against.dot,
  },
  {
    key: "abstain",
    label: "Abstain",
    icon: Minus,
    textClass: VOTE_COLORS.abstain.text,
    dotClass: VOTE_COLORS.abstain.dot,
  },
];

export function ProposalDelegateVotes({
  proposalId,
  governorAddress,
  startBlock,
  endBlock,
}: ProposalDelegateVotesProps) {
  const { data, isLoading, error } = useProposalDelegateVotes({
    proposalId,
    governorAddress,
    startBlock,
    endBlock,
  });

  const [visibleCounts, setVisibleCounts] = useState<
    Record<SupportKey, number>
  >({
    for: PAGE_SIZE,
    against: PAGE_SIZE,
    abstain: PAGE_SIZE,
  });

  const loadMore = (key: SupportKey) =>
    setVisibleCounts((prev) => ({ ...prev, [key]: prev[key] + PAGE_SIZE }));

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <p className="py-6 text-sm text-destructive">
        Failed to load voters: {error.message}
      </p>
    );
  }

  if (!data) return null;

  return (
    <Tabs defaultValue="for" className="w-full">
      <TabsList className="w-full justify-start">
        {SECTIONS.map((section) => (
          <TabsTrigger
            key={section.key}
            value={section.key}
            className="gap-1.5"
          >
            <section.icon className={cn("h-3.5 w-3.5", section.textClass)} />
            <span className={cn("font-medium", section.textClass)}>
              {section.label}
            </span>
            <span className="text-xs text-muted-foreground">
              ({data[section.key].length})
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {SECTIONS.map((section) => (
        <TabsContent key={section.key} value={section.key} className="mt-4">
          <SupportPanel
            label={section.label}
            voters={data[section.key]}
            totalWeight={getTotalWeight(data, section.key)}
            visibleCount={visibleCounts[section.key]}
            onLoadMore={() => loadMore(section.key)}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function getTotalWeight(
  data: ProposalDelegateVotesResult,
  key: SupportKey
): string {
  if (key === "for") return data.totals.forWeight;
  if (key === "against") return data.totals.againstWeight;
  return data.totals.abstainWeight;
}

interface SupportPanelProps {
  label: string;
  voters: ProposalVoter[];
  totalWeight: string;
  visibleCount: number;
  onLoadMore: () => void;
}

function SupportPanel({
  label,
  voters,
  totalWeight,
  visibleCount,
  onLoadMore,
}: SupportPanelProps) {
  const visible = voters.slice(0, visibleCount);
  const remaining = voters.length - visible.length;

  if (voters.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No {label.toLowerCase()} votes yet
      </p>
    );
  }

  return (
    <div>
      <header className="mb-2 flex items-center justify-between border-b border-border/40 pb-2 text-xs text-muted-foreground">
        <span>
          {voters.length} voter{voters.length === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">
          {formatVotingPower(totalWeight)} ARB
        </span>
      </header>

      <ul className="divide-y divide-border/30">
        {visible.map((voter) => (
          <VoterRow key={voter.voter} voter={voter} />
        ))}
      </ul>

      {remaining > 0 && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={onLoadMore}>
            Load more ({remaining} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}

function VoterRow({ voter }: { voter: ProposalVoter }) {
  const label = voter.display?.label ?? null;
  const picture = voter.display?.picture ?? null;
  const displayName = label ?? shortenAddress(voter.voter);
  const profileUrl = voter.display?.profileUrl ?? `/delegates/${voter.voter}`;

  return (
    <li>
      <Link
        href={profileUrl}
        className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-white/30 dark:hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar picture={picture} />
          <span className="truncate text-sm">{displayName}</span>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatVotingPower(voter.weight)} ARB
        </span>
      </Link>
    </li>
  );
}

function Avatar({ picture }: { picture: string | null }) {
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture}
        alt=""
        className="h-6 w-6 rounded-full object-cover ring-1 ring-border"
        loading="lazy"
      />
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted ring-1 ring-border">
      <User className="h-3 w-3 text-muted-foreground" />
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
