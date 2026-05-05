"use client";

import { useMemo } from "react";

import { DelegateVotesTable } from "@/components/delegate/DelegateVotesTable";
import { useDelegateEligibility } from "@/hooks/use-delegate-eligibility";
import { delegateVoteKey, useDelegateVotes } from "@/hooks/use-delegate-votes";
import { useMultiGovernorSearch } from "@/hooks/use-multi-governor-search";
import { DEFAULT_FORM_VALUES } from "@config/arbitrum-governance";

interface DelegateVotesLoaderProps {
  address: string;
}

export function DelegateVotesLoader({ address }: DelegateVotesLoaderProps) {
  const {
    proposals,
    isSearching,
    error: proposalsError,
  } = useMultiGovernorSearch({
    daysToSearch: DEFAULT_FORM_VALUES.daysToSearch,
    enabled: true,
    blockRange: DEFAULT_FORM_VALUES.blockRange,
  });

  const {
    data: votesByKey,
    isLoading: votesLoading,
    error: votesError,
  } = useDelegateVotes(address);

  const unvotedSnapshotBlocks = useMemo(() => {
    if (!votesByKey) return [];
    const blocks: number[] = [];
    for (const proposal of proposals) {
      const key = delegateVoteKey(proposal.id, proposal.contractAddress);
      if (!votesByKey.has(key)) {
        blocks.push(Number(proposal.startBlock));
      }
    }
    return blocks;
  }, [proposals, votesByKey]);

  const { data: eligibilityByBlock, isLoading: eligibilityLoading } =
    useDelegateEligibility(address, unvotedSnapshotBlocks, {
      enabled: votesByKey !== undefined && unvotedSnapshotBlocks.length > 0,
    });

  const isLoading =
    isSearching ||
    votesLoading ||
    (eligibilityLoading && unvotedSnapshotBlocks.length > 0);

  const error = proposalsError ?? votesError ?? null;

  if (error) {
    return (
      <p className="py-6 text-sm text-destructive">
        Failed to load votes: {error.message}
      </p>
    );
  }

  return (
    <DelegateVotesTable
      proposals={proposals}
      votesByKey={votesByKey ?? new Map()}
      eligibilityByBlock={eligibilityByBlock ?? null}
      isLoading={isLoading}
    />
  );
}
