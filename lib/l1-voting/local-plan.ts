// Vote plans built in the browser from the user's own RPCs: the same buildVotePlan the indexer
// runs, with an empty cache, so voting needs no indexer at all. Proofs are read from the
// Arbitrum state of the snapshot's assertion, about a week old on mainnet, so the Arbitrum RPC
// must be an archive node.

import {
  buildVotePlan,
  createProofSource,
  loadMirrorConfig,
  memoryProofStore,
  type PinnedDeployment,
  type PlanDeps,
  type VotePlan,
} from "@offchainlabs/l1-voting-proving";
import {
  type Address,
  createPublicClient,
  type Hex,
  http,
  type PublicClient,
} from "viem";

/** The Arbitrum RPC can't serve the old state a proof needs. */
export class ArchiveRpcError extends Error {
  constructor(l2Block: bigint) {
    super(
      `This Arbitrum RPC can't serve state from block ${l2Block.toLocaleString()}, which this vote is proven against. Use an archive node.`
    );
    this.name = "ArchiveRpcError";
  }
}

export type LocalPlanner = (input: {
  proposalId: string;
  delegate: Address;
  l1Voter: Address;
  signature?: Hex;
}) => Promise<VotePlan>;

export function createLocalPlanner(opts: {
  l1: PublicClient;
  l2RpcUrl: string;
  deployment: PinnedDeployment;
}): LocalPlanner {
  const l2 = createPublicClient({
    transport: http(opts.l2RpcUrl, { timeout: 30_000, retryCount: 1 }),
  });
  const { l1, deployment } = opts;
  let deps: Promise<PlanDeps> | null = null;
  const servable = new Set<Hex>();

  return async (input) => {
    deps ??= loadMirrorConfig(l1, deployment.stateMirror, deployment.governor)
      .then(
        (config): PlanDeps => ({
          l1,
          l2,
          l1ChainId: deployment.l1ChainId,
          config,
          l1DelegateMapping: deployment.l1DelegateMapping,
          proofs: createProofSource({
            l1,
            l2,
            config,
            store: memoryProofStore(),
          }),
        })
      )
      .catch((error) => {
        deps = null;
        throw error;
      });
    const d = await deps;
    const plan = await buildVotePlan(d, {
      ...input,
      proposalId: BigInt(input.proposalId),
    });
    // A non-archive node fails every old-state proof, which the plan would report as "no voting
    // power". Say what is actually wrong instead.
    const a = plan.assertionHash;
    if (a && !servable.has(a)) {
      const { l2BlockNumber } = await d.proofs.preimage(a);
      try {
        await l2.getProof({
          address: d.config.l2Token,
          storageKeys: [],
          blockNumber: l2BlockNumber,
        });
      } catch {
        throw new ArchiveRpcError(l2BlockNumber);
      }
      servable.add(a);
    }
    return plan;
  };
}
