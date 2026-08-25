/**
 * Map an L1 Ethereum block number onto the Arbitrum One blocks that were
 * produced under it.
 *
 * Arbitrum governors keep their clock in L1 blocks (`proposalSnapshot`,
 * `proposalDeadline`, `votingDelay` are all L1 block counts) while their events
 * are emitted on L2. Anything that has an L1 block and needs the matching L2
 * logs has to cross that gap, and guessing it from an average block time
 * drifts by thousands of blocks over a few weeks.
 *
 * `NodeInterface` answers it exactly, in one `eth_call`.
 */

import { ethers } from "ethers";

/**
 * NodeInterface is a virtual contract: no code is deployed at this address,
 * the Nitro node intercepts calls to it. Every Arbitrum One RPC serves it,
 * including the public endpoint.
 */
const NODE_INTERFACE_ADDRESS = "0x00000000000000000000000000000000000000C8";

const NODE_INTERFACE_ABI = [
  "function l2BlockRangeForL1(uint64 blockNum) view returns (uint64 firstBlock, uint64 lastBlock)",
];

/**
 * How far the probe walks when an L1 block maps to no L2 blocks at all.
 *
 * The call reverts for such a block, and the neighbours are the next best
 * anchor. Bounded so an L1 block the sequencer has not reached yet fails fast
 * instead of walking forever.
 */
const MAX_NEIGHBOUR_PROBES = 6;

/** An inclusive range of L2 block numbers */
export interface L2BlockRange {
  fromBlock: number;
  toBlock: number;
}

async function l2BlockRangeForL1Block(
  provider: ethers.providers.Provider,
  l1Block: number
): Promise<L2BlockRange | null> {
  const nodeInterface = new ethers.Contract(
    NODE_INTERFACE_ADDRESS,
    NODE_INTERFACE_ABI,
    provider
  );

  try {
    const [firstBlock, lastBlock] =
      await nodeInterface.l2BlockRangeForL1(l1Block);
    return {
      fromBlock: ethers.BigNumber.from(firstBlock).toNumber(),
      toBlock: ethers.BigNumber.from(lastBlock).toNumber(),
    };
  } catch {
    // Reverts for an L1 block with no L2 blocks under it, and for any RPC that
    // does not serve NodeInterface. Both are the caller's cue to fall back.
    return null;
  }
}

/**
 * Find the L2 range for `l1Block`, walking `step` blocks at a time when that
 * exact L1 block produced no L2 blocks.
 */
async function probeL2BlockRange(
  provider: ethers.providers.Provider,
  l1Block: number,
  step: 1 | -1
): Promise<L2BlockRange | null> {
  for (let probe = 0; probe < MAX_NEIGHBOUR_PROBES; probe++) {
    const candidate = l1Block + probe * step;
    if (candidate < 0) return null;

    const range = await l2BlockRangeForL1Block(provider, candidate);
    if (range) return range;
  }

  return null;
}

/**
 * The L2 blocks produced under an inclusive range of L1 blocks.
 *
 * Widens rather than narrows: the lower bound walks backwards and the upper
 * bound forwards until each finds an L1 block that produced L2 blocks, so the
 * result always covers the requested range.
 *
 * Returns null when the mapping is unavailable, which is the caller's signal to
 * fall back to whatever block range it would have used anyway.
 *
 * @param fromL1Block - First L1 block to cover
 * @param toL1Block - Last L1 block to cover, inclusive
 */
export async function getL2BlockRangeForL1Blocks({
  provider,
  fromL1Block,
  toL1Block,
}: {
  provider: ethers.providers.Provider;
  fromL1Block: number;
  toL1Block: number;
}): Promise<L2BlockRange | null> {
  if (!Number.isInteger(fromL1Block) || !Number.isInteger(toL1Block)) {
    return null;
  }
  if (fromL1Block < 0 || toL1Block < fromL1Block) return null;

  const [start, end] = await Promise.all([
    probeL2BlockRange(provider, fromL1Block, -1),
    probeL2BlockRange(provider, toL1Block, 1),
  ]);

  if (!start || !end) return null;
  if (end.toBlock < start.fromBlock) return null;

  return { fromBlock: start.fromBlock, toBlock: end.toBlock };
}
