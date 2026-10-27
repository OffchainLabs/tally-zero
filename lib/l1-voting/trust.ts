// What this site trusts when it sends an L1 voting transaction: addresses pinned in
// @offchainlabs/l1-voting-proving, and nothing the indexer says. Every vote plan, from the
// indexer or built on the user's own RPCs, is checked against them before a wallet sees it.

import {
  knownDeployment,
  pinDeployment,
  validatePlan,
  type PinnedDeployment,
  type VotePlan,
} from "@offchainlabs/l1-voting-proving";
import type { Address, PublicClient } from "viem";

import { isLocalChainsEnabled, LOCAL_L2_CHAIN_ID } from "@/config/chains";
import { env } from "@/env";
import { l1VotingApi } from "@/lib/l1-voting/api";

export type { PinnedDeployment } from "@offchainlabs/l1-voting-proving";

/** A plan with a step this site doesn't recognise. Nothing from it was sent. */
export class UnsafePlanError extends Error {
  constructor(public violations: string[]) {
    super(
      `The vote plan asked for a transaction this site doesn't recognise, so nothing was sent. ${violations.join("; ")}`
    );
    this.name = "UnsafePlanError";
  }
}

/** Throws UnsafePlanError unless every step of `plan` is one L1 voting needs. */
export function checkPlan(
  plan: VotePlan,
  ctx: {
    deployment: PinnedDeployment;
    proposalId: string;
    delegate: Address;
    l1Voter: Address;
  }
): VotePlan {
  const violations = validatePlan(plan, {
    ...ctx,
    proposalId: BigInt(ctx.proposalId),
  });
  if (violations.length) throw new UnsafePlanError(violations);
  return plan;
}

/**
 * The deployment for this L1: the pinned one, or, on the local testnode only, one read from the
 * chain starting at its governor. Null where L1 voting isn't deployed.
 */
export async function loadDeployment(
  l1: PublicClient,
  l1ChainId: number
): Promise<PinnedDeployment | null> {
  const known = knownDeployment(l1ChainId);
  if (known) return known;
  if (!isLocalChainsEnabled()) return null;
  // The local testnode: start from the governor (set by the e2e runner, else the indexer's) and
  // read the rest from the chain.
  const governor =
    (env.NEXT_PUBLIC_LOCAL_L1_VOTING_GOVERNOR as Address | undefined) ??
    (await l1VotingApi.deployment()).governor;
  return pinDeployment(l1, governor, {
    l2ChainId: LOCAL_L2_CHAIN_ID,
    governorDeployBlock: BigInt(0),
  });
}
