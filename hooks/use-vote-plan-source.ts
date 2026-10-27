"use client";

import { createPlanner, type VotePlan } from "@offchainlabs/l1-voting-proving";
import { useMemo, useState } from "react";
import {
  type Address,
  createPublicClient,
  getAddress,
  type Hex,
  http,
  isAddress,
  type PublicClient,
} from "viem";

import { isLocalChainsEnabled, LOCAL_L2_RPC_URL } from "@/config/chains";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { l1VotingApi } from "@/lib/l1-voting/api";
import { checkPlan, type PinnedDeployment } from "@/lib/l1-voting/trust";

export type PlanSource = "indexer" | "own";

/**
 * Where vote plans come from: the indexer, or (the "own RPCs" option) built in the browser by the
 * same library from the user's Ethereum RPC and an Arbitrum archive RPC. Either way `fetchPlan`
 * returns only plans that pass the checks against the pinned deployment.
 */
export function useVotePlanSource({
  proposalId,
  deployment,
  l1,
}: {
  proposalId: string;
  deployment: PinnedDeployment | null | undefined;
  l1: PublicClient | undefined;
}) {
  const [source, setSource] = useLocalStorage<PlanSource>(
    STORAGE_KEYS.L1_VOTE_PLAN_SOURCE,
    "indexer"
  );
  const [storedArchiveRpc, setArchiveRpc] = useLocalStorage(
    STORAGE_KEYS.L2_ARCHIVE_RPC,
    ""
  );
  // With its own RPCs the voter may also name a delegate: the indexer's registrations may be
  // unreachable.
  const [delegateInput, setDelegateInput] = useState("");
  const ownRpcs = source === "own";
  const archiveRpc =
    storedArchiveRpc || (isLocalChainsEnabled() ? LOCAL_L2_RPC_URL : "");

  const planner = useMemo(
    () =>
      ownRpcs && deployment && l1 && archiveRpc
        ? createPlanner({
            l1,
            l2: createPublicClient({
              transport: http(archiveRpc, { timeout: 30_000, retryCount: 1 }),
            }),
            deployment,
          })
        : null,
    [ownRpcs, deployment, l1, archiveRpc]
  );

  async function fetchPlan(
    delegate: Address,
    l1Voter: Address,
    signature?: Hex
  ): Promise<VotePlan> {
    if (!deployment)
      throw new Error("L1 voting is not deployed on this network.");
    const plan = planner
      ? await planner({
          proposalId: BigInt(proposalId),
          delegate,
          l1Voter,
          signature,
        })
      : await l1VotingApi.votePlan(proposalId, delegate, l1Voter, signature);
    return checkPlan(plan, { deployment, proposalId, delegate, l1Voter });
  }

  return {
    source,
    setSource,
    ownRpcs,
    storedArchiveRpc,
    setArchiveRpc,
    delegateInput,
    setDelegateInput,
    typedDelegate:
      ownRpcs && isAddress(delegateInput) ? getAddress(delegateInput) : null,
    /** Plans can be fetched: always from the indexer; with own RPCs, once an archive RPC is set. */
    ready: !!deployment && (!ownRpcs || !!planner),
    /** Part of the plan query's key: a change of source or RPC refetches. */
    key: [source, archiveRpc] as const,
    fetchPlan,
  };
}
