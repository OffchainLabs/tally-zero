"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { memberElectionGovernorAbi } from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";

import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { debug } from "@/lib/debug";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import { createRpcProvider } from "@/lib/rpc-utils";

export interface NomineeVoter {
  address: string;
  votes: string;
  weight: string;
  weightedVotes: string;
  label: string | undefined;
}

export function useNomineeVoters({
  proposalId,
  memberGovernorAddress,
  nomineeAddress,
}: {
  proposalId: string;
  memberGovernorAddress: string;
  nomineeAddress: string;
}) {
  const { l2Rpc, isHydrated } = useRpcSettings();

  const [voters, setVoters] = useState<NomineeVoter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const lastFetchedKeyRef = useRef<string | null>(null);

  const fetchVoters = useCallback(async () => {
    if (!proposalId || !memberGovernorAddress || !nomineeAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = await createRpcProvider(l2Rpc);
      const contract = new ethers.Contract(
        memberGovernorAddress,
        memberElectionGovernorAbi,
        provider
      );

      const filter = contract.filters.VoteCastForNominee(
        null, // voter (any)
        proposalId,
        nomineeAddress
      );

      const logs = await contract.queryFilter(filter);

      const parsed: NomineeVoter[] = logs.map((log) => {
        const event = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        const voterAddr: string = event.args.voter;
        const votes: ethers.BigNumber = event.args.votes;
        // "weight" in the event is the already-computed weighted contribution
        // for this vote (votes * decayFactor / WAD), not a raw multiplier.
        // "weightReceived" is the cumulative total for the nominee.
        const weightedVotes: ethers.BigNumber = event.args.weight;

        return {
          address: voterAddr,
          votes: votes.toString(),
          weight: weightedVotes.toString(),
          weightedVotes: weightedVotes.toString(),
          label: getDelegateLabel(voterAddr),
        };
      });

      // Aggregate: a voter can vote multiple times for the same nominee
      const aggregated = new Map<string, NomineeVoter>();
      for (const v of parsed) {
        const key = v.address.toLowerCase();
        const existing = aggregated.get(key);
        if (existing) {
          existing.votes = ethers.BigNumber.from(existing.votes)
            .add(ethers.BigNumber.from(v.votes))
            .toString();
          existing.weightedVotes = ethers.BigNumber.from(existing.weightedVotes)
            .add(ethers.BigNumber.from(v.weightedVotes))
            .toString();
        } else {
          aggregated.set(key, { ...v });
        }
      }

      // Sort by weighted votes descending
      const sorted = Array.from(aggregated.values()).sort((a, b) => {
        const aBn = ethers.BigNumber.from(a.weightedVotes);
        const bBn = ethers.BigNumber.from(b.weightedVotes);
        if (bBn.gt(aBn)) return 1;
        if (aBn.gt(bBn)) return -1;
        return 0;
      });

      setVoters(sorted);
    } catch (err) {
      debug.delegates("nominee voters fetch error: %O", err);
      setError(toError(err));
    } finally {
      setIsLoading(false);
    }
  }, [proposalId, memberGovernorAddress, nomineeAddress, l2Rpc]);

  useEffect(() => {
    if (!isHydrated) return;

    const fetchKey = `${proposalId}:${memberGovernorAddress}:${nomineeAddress}`;
    if (lastFetchedKeyRef.current !== fetchKey) {
      lastFetchedKeyRef.current = fetchKey;
      fetchVoters();
    }
  }, [
    isHydrated,
    proposalId,
    memberGovernorAddress,
    nomineeAddress,
    fetchVoters,
  ]);

  return { voters, isLoading, error };
}
