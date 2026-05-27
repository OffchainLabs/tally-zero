import { addressesEqual, isValidAddress } from "@/lib/address-utils";
import { isArbitrumGovernor } from "@config/governors";

export type ProposalCancelVisibility = "hidden" | "cancel";

export interface ProposalCancelVisibilityInput {
  accountAddress: string | undefined;
  governorAddress: string;
  isConnected: boolean;
  proposer: string;
  state: string;
}

export function getProposalCancelVisibility({
  accountAddress,
  governorAddress,
  isConnected,
  proposer,
  state,
}: ProposalCancelVisibilityInput): ProposalCancelVisibility {
  if (state.toLowerCase() !== "pending") return "hidden";
  if (!isValidAddress(proposer)) return "hidden";
  if (!isArbitrumGovernor(governorAddress)) return "hidden";
  if (!isConnected || !accountAddress) return "hidden";
  if (!addressesEqual(accountAddress, proposer)) return "hidden";
  return "cancel";
}
