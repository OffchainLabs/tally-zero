import fs from "node:fs";
import path from "node:path";

import { ethers } from "ethers";

import {
  ARBITRUM_GOVERNORS,
  ARBITRUM_RPC_URL,
} from "@config/arbitrum-governance";
import OZGovernor_ABI from "@data/OzGovernor_ABI.json";
import { getStateName } from "@lib/state-utils";

const VOTE_CAST_WITH_PARAMS_ABI = [
  "event VoteCastWithParams(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason, bytes params)",
];

const INITIAL_BLOCK_RANGE = 10_000_000;
const MIN_BLOCK_RANGE = 10_000;
const DEFAULT_SEARCH_FROM_BLOCK = 0;
const MAX_TRANSIENT_RETRIES = 3;
const STATE_REFRESH_CONCURRENCY = 8;

const FINALIZED_PROPOSAL_STATES = new Set<string>([
  "succeeded",
  "queued",
  "executed",
  "defeated",
  "canceled",
  "expired",
]);

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
  state?: string;
}

interface VoteHistoryFile {
  watermarkBlock: number;
  generatedAt: string;
  votes: VoteRecord[];
}

interface ProposalsIndexFile {
  watermarkBlock: number;
  generatedAt: string;
  proposals: ProposalIndexEntry[];
}

function readOptionalJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function voteKey(vote: {
  governorAddress: string;
  proposalId: string;
  voter: string;
}): string {
  return `${vote.governorAddress.toLowerCase()}:${vote.proposalId}:${vote.voter.toLowerCase()}`;
}

function proposalKey(proposal: {
  governorAddress: string;
  proposalId: string;
}): string {
  return `${proposal.governorAddress.toLowerCase()}:${proposal.proposalId}`;
}

function isFinalizedState(state: string | undefined): boolean {
  return !!state && FINALIZED_PROPOSAL_STATES.has(state);
}

function toStateNumber(state: unknown): number {
  if (ethers.BigNumber.isBigNumber(state)) return state.toNumber();
  return Number(state);
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

  const existingVotesFile = readOptionalJson<VoteHistoryFile>(votesPath);
  const existingProposalsFile =
    readOptionalJson<ProposalsIndexFile>(proposalsIndexPath);

  const previousVotesWatermark =
    existingVotesFile?.watermarkBlock ?? DEFAULT_SEARCH_FROM_BLOCK - 1;
  const previousProposalsWatermark =
    existingProposalsFile?.watermarkBlock ?? DEFAULT_SEARCH_FROM_BLOCK - 1;
  const startFromBlock =
    Math.min(previousVotesWatermark, previousProposalsWatermark) + 1;
  console.log(
    `incremental scan from block ${startFromBlock} ` +
      `(previous watermarks: votes=${previousVotesWatermark}, proposals=${previousProposalsWatermark})`
  );

  const allVotesByKey = new Map<string, VoteRecord>();
  for (const vote of existingVotesFile?.votes ?? []) {
    allVotesByKey.set(voteKey(vote), vote);
  }
  const allProposalsByKey = new Map<string, ProposalIndexEntry>();
  for (const proposal of existingProposalsFile?.proposals ?? []) {
    allProposalsByKey.set(proposalKey(proposal), proposal);
  }

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

    let governorNewProposals = 0;
    let governorNewVotes = 0;

    if (startFromBlock <= watermark) {
      for (
        let from = startFromBlock;
        from <= watermark;
        from += INITIAL_BLOCK_RANGE
      ) {
        const to = Math.min(from + INITIAL_BLOCK_RANGE - 1, watermark);

        const [proposalEvents, voteCastEvents, voteCastWithParamsEvents] =
          await Promise.all([
            queryRangeAdaptive(
              from,
              to,
              (f, t) =>
                governorContract.queryFilter(proposalCreatedFilter, f, t),
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
          const proposalId = args.proposalId.toString();
          const proposalState = getStateName(
            toStateNumber(await governorContract.state(proposalId))
          );
          const entry: ProposalIndexEntry = {
            governorAddress: governorAddressLower,
            proposalId,
            snapshotBlock: Number(args.startBlock.toString()),
            state: proposalState,
          };
          allProposalsByKey.set(proposalKey(entry), entry);
          governorNewProposals += 1;
        }

        for (const event of [...voteCastEvents, ...voteCastWithParamsEvents]) {
          const args = event.args;
          if (!args || args.voter === undefined) continue;
          const vote: VoteRecord = {
            governorAddress: governorAddressLower,
            proposalId: args.proposalId.toString(),
            voter: (args.voter as string).toLowerCase(),
            support: Number(args.support),
            weight: args.weight.toString(),
            blockNumber: event.blockNumber,
          };
          allVotesByKey.set(voteKey(vote), vote);
          governorNewVotes += 1;
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
    } else {
      console.log(`  no new blocks to scan since ${previousVotesWatermark}`);
    }

    const proposalsToRefresh: ProposalIndexEntry[] = [];
    for (const proposal of allProposalsByKey.values()) {
      if (proposal.governorAddress !== governorAddressLower) continue;
      if (isFinalizedState(proposal.state)) continue;
      proposalsToRefresh.push(proposal);
    }

    for (
      let i = 0;
      i < proposalsToRefresh.length;
      i += STATE_REFRESH_CONCURRENCY
    ) {
      const batch = proposalsToRefresh.slice(i, i + STATE_REFRESH_CONCURRENCY);
      const states = await Promise.all(
        batch.map((proposal) =>
          governorContract
            .state(proposal.proposalId)
            .then((raw: unknown) => getStateName(toStateNumber(raw)))
        )
      );
      for (let j = 0; j < batch.length; j += 1) {
        batch[j].state = states[j];
      }
    }

    console.log(
      `  added: ${governorNewProposals} proposals, ${governorNewVotes} votes; ` +
        `refreshed state for ${proposalsToRefresh.length} non-finalized proposals`
    );
  }

  const allProposals = Array.from(allProposalsByKey.values());
  const allVotes = Array.from(allVotesByKey.values());

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
