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
  PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
  useProposalDelegateVotes,
  type ProposalDelegateVotesResult,
  type ProposalVoter,
  type ProposalVoteSupportKey,
} from "@/hooks/use-proposal-delegate-votes";
import { VOTE_COLORS } from "@/lib/badge-colors";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

interface ProposalDelegateVotesProps {
  proposalId: string;
  governorAddress: string;
  proposalState: string;
}

type SupportKey = ProposalVoteSupportKey;

const SECTIONS: Array<{
  key: SupportKey;
  label: string;
  icon: LucideIcon;
  textClass: string;
  dotClass: string;
  activeClass: string;
}> = [
  {
    key: "for",
    label: "For",
    icon: ThumbsUp,
    textClass: VOTE_COLORS.for.text,
    dotClass: VOTE_COLORS.for.dot,
    activeClass:
      "border-emerald-500/40 !bg-emerald-500/10 ring-1 ring-emerald-500/25 dark:!bg-emerald-400/10",
  },
  {
    key: "against",
    label: "Against",
    icon: ThumbsDown,
    textClass: VOTE_COLORS.against.text,
    dotClass: VOTE_COLORS.against.dot,
    activeClass:
      "border-rose-500/40 !bg-rose-500/10 ring-1 ring-rose-500/25 dark:!bg-rose-400/10",
  },
  {
    key: "abstain",
    label: "Abstain",
    icon: Minus,
    textClass: VOTE_COLORS.abstain.text,
    dotClass: VOTE_COLORS.abstain.dot,
    activeClass: "border-border !bg-muted/70 ring-1 ring-border/70",
  },
];

export function ProposalDelegateVotes({
  proposalId,
  governorAddress,
  proposalState,
}: ProposalDelegateVotesProps) {
  const [activeSupport, setActiveSupport] = useState<SupportKey>("for");
  const [loadedSupports, setLoadedSupports] = useState<Set<SupportKey>>(
    () => new Set<SupportKey>(["for"])
  );
  const [visibleCounts, setVisibleCounts] = useState<
    Record<SupportKey, number>
  >({
    for: PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
    against: PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
    abstain: PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
  });

  const {
    data,
    isLoading,
    error,
    isSyncing,
    syncError,
    supportLoading,
    supportFetching,
  } = useProposalDelegateVotes({
    proposalId,
    governorAddress,
    proposalState,
    activeSupport,
    visibleCounts,
    enabledSupports: loadedSupports,
  });

  const handleSupportChange = (value: string) => {
    if (!isSupportKey(value)) return;

    setActiveSupport(value);
    setLoadedSupports((prev) => {
      if (prev.has(value)) return prev;
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  };

  const loadMore = (key: SupportKey) => {
    setLoadedSupports((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setVisibleCounts((prev) => ({
      ...prev,
      [key]: prev[key] + PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
    }));
  };

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
    <Tabs
      value={activeSupport}
      onValueChange={handleSupportChange}
      className="w-full"
    >
      <TabsList className="w-full justify-start">
        {SECTIONS.map((section) => {
          const isActive = activeSupport === section.key;

          return (
            <TabsTrigger
              key={section.key}
              value={section.key}
              className={cn(
                "gap-1.5 border border-transparent",
                isActive && section.activeClass
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full opacity-0 transition-opacity",
                  section.dotClass,
                  isActive && "opacity-100"
                )}
              />
              <section.icon className={cn("h-3.5 w-3.5", section.textClass)} />
              <span
                className={cn(
                  "font-medium",
                  section.textClass,
                  isActive && section.key === "abstain" && "!text-foreground"
                )}
              >
                {section.label}
              </span>
              <span
                className={cn(
                  "text-xs text-muted-foreground",
                  isActive && "font-medium !text-foreground"
                )}
              >
                ({getTotalCount(data, section.key)})
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {(isSyncing || syncError) && (
        <p
          className={cn(
            "mt-3 text-xs",
            syncError ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {syncError
            ? `Showing cached voters. Latest vote sync failed: ${syncError.message}`
            : "Syncing latest votes..."}
        </p>
      )}

      {SECTIONS.map((section) => (
        <TabsContent key={section.key} value={section.key} className="mt-4">
          <SupportPanel
            label={section.label}
            voters={data[section.key]}
            totalCount={getTotalCount(data, section.key)}
            totalWeight={getTotalWeight(data, section.key)}
            visibleCount={visibleCounts[section.key]}
            isLoading={supportLoading[section.key]}
            isFetching={supportFetching[section.key]}
            onLoadMore={() => loadMore(section.key)}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function isSupportKey(value: string): value is SupportKey {
  return value === "for" || value === "against" || value === "abstain";
}

function getTotalCount(
  data: ProposalDelegateVotesResult,
  key: SupportKey
): number {
  if (key === "for") return data.totals.forCount;
  if (key === "against") return data.totals.againstCount;
  return data.totals.abstainCount;
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
  totalCount: number;
  totalWeight: string;
  visibleCount: number;
  isLoading: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

function SupportPanel({
  label,
  voters,
  totalCount,
  totalWeight,
  visibleCount,
  isLoading,
  isFetching,
  onLoadMore,
}: SupportPanelProps) {
  const visible = voters.slice(0, visibleCount);
  const remaining = Math.max(0, totalCount - visible.length);
  const targetVisibleCount = Math.min(visibleCount, totalCount);
  const skeletonCount =
    isFetching && visible.length > 0
      ? Math.min(
          PROPOSAL_DELEGATE_VOTES_PAGE_SIZE,
          Math.max(0, targetVisibleCount - visible.length)
        )
      : 0;

  if (isLoading && visible.length === 0) return <PanelSkeleton />;

  if (totalCount === 0) {
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
          {totalCount} voter{totalCount === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">
          {formatVotingPower(totalWeight)} ARB
        </span>
      </header>

      <ul className="divide-y divide-border/30">
        {visible.map((voter) => (
          <VoterRow key={voter.voter} voter={voter} />
        ))}
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <VoterRowSkeleton key={`loading-${i}`} />
        ))}
      </ul>

      {remaining > 0 && skeletonCount === 0 && (
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
      <PanelSkeleton />
    </div>
  );
}

function PanelSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <VoterRowSkeleton key={i} />
      ))}
    </ul>
  );
}

function VoterRowSkeleton() {
  return (
    <li className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-3 w-16" />
    </li>
  );
}
