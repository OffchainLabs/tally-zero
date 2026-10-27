// The indexer's L1 voting surface, read through the same-origin proxy. Vote plans and
// registration status are read live from the chain by the indexer, so they are never cached.

import type { VotePlan } from "@offchainlabs/l1-voting-proving";
import type { Address, Hex } from "viem";

const BASE = "/api/governance-indexer/api/l1-voting";

export interface L1VotingDeployment {
  l1ChainId: number;
  l2ChainId: number;
  governor: Address;
  timelock: Address;
  stateMirror: Address;
  l1DelegateMapping: Address;
  l2DelegateMapping: Address;
  rollup: Address;
  multicall3: Address;
}

// Plans come from the same library the indexer builds them with.
export type {
  VotePlan,
  PlanStep as VotePlanStep,
  StepKind as VotePlanStepKind,
} from "@offchainlabs/l1-voting-proving";

export interface ClaimRecord {
  source: string;
  l2Delegate: Address;
  l1Address: Address;
  assertionHash: Hex | null;
  blockNumber: number;
  timestamp: number;
  txHash: Hex;
}

export interface DelegateRegistration {
  delegate: Address;
  l2Claim: (ClaimRecord & { revoked: boolean }) | null;
  l2ClaimProvable: boolean | null;
  confirmedL2Block: number | null;
  l1Claimers: ClaimRecord[];
  registrations: ClaimRecord[];
}

export type RegisteredDelegate = ClaimRecord & { provable: boolean | null };

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (body && typeof body.error === "string" && body.error) ||
      `Indexer request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const l1VotingApi = {
  deployment: () => get<L1VotingDeployment>("/deployment"),
  registration: (delegate: Address) =>
    get<DelegateRegistration>(`/registrations/${delegate}`),
  registrations: () => get<RegisteredDelegate[]>("/registrations"),
  votePlan: (
    proposalId: string,
    delegate: Address,
    l1Voter: Address,
    signature?: Hex
  ) => {
    const query = new URLSearchParams({ delegate, l1Voter });
    if (signature) query.set("signature", signature);
    return get<VotePlan>(`/vote-plan/${proposalId}?${query.toString()}`);
  },
};
