import { ethers } from "ethers";

import { createRpcProvider } from "@/lib/rpc-utils";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

/**
 * Governor contracts are immutable per (rpcUrl, address), so reuse instances
 * across the many per-row quorum lookups the table issues.
 */
const contractCache = new Map<string, ethers.Contract>();

/**
 * Fetch a proposal's quorum requirement (in ARB wei) from its governor.
 *
 * Quorum is a function of the votable supply at the proposal's vote-start
 * (snapshot) block, so it is fixed for a given proposal and safe to cache.
 * The snapshot block is the proposal's `startBlock`, matching the argument the
 * bulk RPC refresh already passes to `quorum()`.
 */
export async function fetchProposalQuorum(
  rpcUrl: string,
  governorAddress: string,
  snapshotBlock: string
): Promise<string> {
  const provider = await createRpcProvider(rpcUrl);

  const cacheKey = `${rpcUrl}:${governorAddress.toLowerCase()}`;
  let contract = contractCache.get(cacheKey);
  if (!contract) {
    contract = new ethers.Contract(governorAddress, OZGovernor_ABI, provider);
    contractCache.set(cacheKey, contract);
  }

  const quorum = await contract.quorum(snapshotBlock);
  return quorum.toString();
}
