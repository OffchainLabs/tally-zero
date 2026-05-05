import fs from "node:fs";
import path from "node:path";

import { ethers } from "ethers";

import {
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
} from "@config/arbitrum-governance";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";

const VOTE_CAST_WITH_PARAMS_ABI = [
  "event VoteCastWithParams(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason, bytes params)",
];

const INITIAL_BLOCK_RANGE = 10_000_000;
const MIN_BLOCK_RANGE = 10_000;
const SEARCH_FROM_BLOCK = 0;
const MAX_TRANSIENT_RETRIES = 3;

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data");
const votesPath = path.join(dataDir, "votes.json");
const proposalsIndexPath = path.join(dataDir, "proposals-index.json");

interface VoteRecord {
  governorAddress: string;
  proposalId: string;
  voter: string;
  support: number;
  weight: string;
  blockNumber: number;
}

interface ProposalIndexEntry {
  governorAddress: string;
  proposalId: string;
  snapshotBlock: number;
}

function isLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /exceeds limit|query timed out|response size/i.test(message);
}

async function queryRangeAdaptive<T>(
  fromBlock: number,
  toBlock: number,
  query: (from: number, to: number) => Promise<T[]>,
  label: string
): Promise<T[]> {
  const span = toBlock - fromBlock + 1;

  for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    try {
      return await query(fromBlock, toBlock);
    } catch (err) {
      if (isLimitError(err) && span > MIN_BLOCK_RANGE) {
        const mid = fromBlock + Math.floor(span / 2);
        console.warn(
          `    ${label} ${fromBlock}-${toBlock}: too many logs, splitting at ${mid}`
        );
        const [left, right] = await Promise.all([
          queryRangeAdaptive(fromBlock, mid - 1, query, label),
          queryRangeAdaptive(mid, toBlock, query, label),
        ]);
        return [...left, ...right];
      }
      if (attempt === MAX_TRANSIENT_RETRIES) {
        throw err;
      }
      console.warn(
        `    ${label} ${fromBlock}-${toBlock}: transient err (attempt ${attempt}/${MAX_TRANSIENT_RETRIES}): ${err}`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  return [];
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC_URL);
  const watermark = await provider.getBlockNumber();
  console.log(`watermark block: ${watermark}`);

  const allVotes: VoteRecord[] = [];
  const allProposals: ProposalIndexEntry[] = [];

  for (const governor of ARBITRUM_GOVERNORS) {
    const governorAddressLower = governor.address.toLowerCase();
    console.log(`\n[${governor.name}] ${governor.address}`);

    const governorContract = new ethers.Contract(
      governor.address,
      OZGovernor_ABI,
      provider
    );
    const voteCastWithParamsContract = new ethers.Contract(
      governor.address,
      VOTE_CAST_WITH_PARAMS_ABI,
      provider
    );

    const proposalCreatedFilter = governorContract.filters.ProposalCreated();
    const voteCastFilter = governorContract.filters.VoteCast();
    const voteCastWithParamsFilter =
      voteCastWithParamsContract.filters.VoteCastWithParams();

    let governorProposals = 0;
    let governorVotes = 0;

    for (
      let from = SEARCH_FROM_BLOCK;
      from <= watermark;
      from += INITIAL_BLOCK_RANGE
    ) {
      const to = Math.min(from + INITIAL_BLOCK_RANGE - 1, watermark);

      const [proposalEvents, voteCastEvents, voteCastWithParamsEvents] =
        await Promise.all([
          queryRangeAdaptive(
            from,
            to,
            (f, t) => governorContract.queryFilter(proposalCreatedFilter, f, t),
            "ProposalCreated"
          ),
          queryRangeAdaptive(
            from,
            to,
            (f, t) => governorContract.queryFilter(voteCastFilter, f, t),
            "VoteCast"
          ),
          queryRangeAdaptive(
            from,
            to,
            (f, t) =>
              voteCastWithParamsContract.queryFilter(
                voteCastWithParamsFilter,
                f,
                t
              ),
            "VoteCastWithParams"
          ),
        ]);

      for (const event of proposalEvents) {
        const args = event.args;
        if (!args || args.proposalId === undefined) continue;
        allProposals.push({
          governorAddress: governorAddressLower,
          proposalId: args.proposalId.toString(),
          snapshotBlock: Number(args.startBlock.toString()),
        });
        governorProposals += 1;
      }

      for (const event of [...voteCastEvents, ...voteCastWithParamsEvents]) {
        const args = event.args;
        if (!args || args.voter === undefined) continue;
        allVotes.push({
          governorAddress: governorAddressLower,
          proposalId: args.proposalId.toString(),
          voter: (args.voter as string).toLowerCase(),
          support: Number(args.support),
          weight: args.weight.toString(),
          blockNumber: event.blockNumber,
        });
        governorVotes += 1;
      }

      const total =
        proposalEvents.length +
        voteCastEvents.length +
        voteCastWithParamsEvents.length;
      if (total > 0) {
        console.log(
          `  ${from.toString().padStart(10)} - ${to.toString().padStart(10)}: ` +
            `+${proposalEvents.length} proposals, ` +
            `+${voteCastEvents.length + voteCastWithParamsEvents.length} votes`
        );
      }
    }

    console.log(
      `  total: ${governorProposals} proposals, ${governorVotes} votes`
    );
  }

  console.log(
    `\nTotal across governors: ${allProposals.length} proposals, ${allVotes.length} votes`
  );

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    proposalsIndexPath,
    JSON.stringify(
      {
        watermarkBlock: watermark,
        generatedAt: new Date().toISOString(),
        proposals: allProposals,
      },
      null,
      2
    ) + "\n"
  );
  fs.writeFileSync(
    votesPath,
    JSON.stringify(
      {
        watermarkBlock: watermark,
        generatedAt: new Date().toISOString(),
        votes: allVotes,
      },
      null,
      2
    ) + "\n"
  );

  console.log(`wrote ${path.relative(rootDir, proposalsIndexPath)}`);
  console.log(`wrote ${path.relative(rootDir, votesPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
