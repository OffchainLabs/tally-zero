import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { isValidAddress } from "@/lib/address-utils";

export const PROPOSAL_TABS = [
  "description",
  "payload",
  "stages",
  "vote",
] as const;

export type ProposalTab = (typeof PROPOSAL_TABS)[number];

const GOVERNOR_ID_PREFIX = `eip155:${ARBITRUM_CHAIN_ID}:`;

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

export function buildGovernorId(governorAddress: string): string {
  return `${GOVERNOR_ID_PREFIX}${governorAddress}`;
}

export function parseGovernorId(
  governorId: string | null | undefined
): string | null {
  if (!governorId || !governorId.startsWith(GOVERNOR_ID_PREFIX)) {
    return null;
  }

  const governorAddress = governorId.slice(GOVERNOR_ID_PREFIX.length);
  return isValidAddress(governorAddress) ? governorAddress : null;
}

export function buildProposalPath({
  proposalId,
  governorAddress,
  tab,
}: {
  proposalId: string;
  governorAddress: string;
  tab?: ProposalTab;
}): string {
  const normalizedTab = normalizeProposalTab(tab);
  const basePath = `/proposal/${proposalId}`;
  const query = `?govId=${buildGovernorId(governorAddress)}`;

  if (!normalizedTab || normalizedTab === "description") {
    return `${basePath}${query}`;
  }

  return `${basePath}${query}&tab=${normalizedTab}`;
}
