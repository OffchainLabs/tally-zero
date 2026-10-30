import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { L1_VOTING_CHAIN_IDS } from "@/config/chains";
import { getL1VotingGovernor } from "@/config/governors";
import { isValidAddress } from "@/lib/address-utils";

export const PROPOSAL_TABS = [
  "description",
  "payload",
  "stages",
  "voters",
] as const;

export type ProposalTab = (typeof PROPOSAL_TABS)[number];

/** Chains a governor id may name: Arbitrum One, and the L1 voting chains */
const GOVERNOR_ID_CHAIN_IDS: readonly number[] = [
  ARBITRUM_CHAIN_ID,
  ...L1_VOTING_CHAIN_IDS,
];

const GOVERNOR_ID_PATTERN = /^eip155:(\d+):(.+)$/;

export interface GovernorRef {
  governorAddress: string;
  chainId: number;
}

export function normalizeProposalTab(
  tab: string | null | undefined
): ProposalTab | undefined {
  if (!tab) return undefined;

  if (tab === "lifecycle") {
    return "stages";
  }

  return PROPOSAL_TABS.includes(tab as ProposalTab)
    ? (tab as ProposalTab)
    : undefined;
}

/**
 * CAIP-style governor id. The chain defaults to Arbitrum One, or to the chain an
 * L1 voting governor was registered with from the indexer.
 */
export function buildGovernorId(
  governorAddress: string,
  chainId?: number | string
): string {
  const chain =
    chainId ??
    getL1VotingGovernor(governorAddress)?.chainId ??
    ARBITRUM_CHAIN_ID;
  return `eip155:${chain}:${governorAddress}`;
}

/** Governor address and chain from a governor id, or null when invalid */
export function parseGovernorRef(
  governorId: string | null | undefined
): GovernorRef | null {
  const match = governorId?.match(GOVERNOR_ID_PATTERN);
  if (!match) return null;

  const chainId = Number(match[1]);
  const governorAddress = match[2];
  if (!GOVERNOR_ID_CHAIN_IDS.includes(chainId)) return null;
  if (!isValidAddress(governorAddress)) return null;

  return { governorAddress, chainId };
}

export function parseGovernorId(
  governorId: string | null | undefined
): string | null {
  return parseGovernorRef(governorId)?.governorAddress ?? null;
}

export function buildProposalPath({
  proposalId,
  governorAddress,
  chainId,
  tab,
}: {
  proposalId: string;
  governorAddress: string;
  /** The governor's chain; see {@link buildGovernorId} for the default */
  chainId?: number | string;
  tab?: ProposalTab;
}): string {
  const normalizedTab = normalizeProposalTab(tab);
  const basePath = `/proposal/${proposalId}`;
  const query = `?govId=${buildGovernorId(governorAddress, chainId)}`;

  if (!normalizedTab || normalizedTab === "description") {
    return `${basePath}${query}`;
  }

  return `${basePath}${query}&tab=${normalizedTab}`;
}
