import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { TallyDelegate } from "@/types/tally-delegate";

const cjsRequire = createRequire(import.meta.url);

type GovernorCheckpointInput = {
  type: "governor";
  governorAddress: string;
  proposalId: string;
  creationTxHash: string;
};

type BundledCheckpoint = {
  input?: { type?: string } & Partial<GovernorCheckpointInput>;
  [key: string]: unknown;
};

type BundledCacheJson = Record<string, BundledCheckpoint>;

type DelegateIndexEntry = {
  name: string;
  picture: string | null;
};

type CandidateData = {
  name?: string;
  title?: string;
  address?: string;
  twitter?: string;
  type?: string;
  representative?: string;
  motivation?: string;
  experience?: string;
  skills?: unknown;
  projects?: string;
  country?: string;
  registered_at?: string;
};

type DelegateSearchMetadata = {
  name: string | null;
  ens: string | null;
};

type VoteHistoryFile = {
  watermarkBlock: number;
  generatedAt: string;
  votes: Array<{
    governorAddress: string;
    proposalId: string;
    voter: string;
    support: number;
    weight: string;
    blockNumber: number;
  }>;
};

type ProposalsIndexFile = {
  watermarkBlock: number;
  generatedAt: string;
  proposals: Array<{
    governorAddress: string;
    proposalId: string;
    snapshotBlock: number;
    state?: string | number | null;
    proposer?: string | null;
    description?: string | null;
  }>;
};

type ProposalVoteSummary = {
  proposalId: string;
  governorAddress: string;
  support: number;
  voterCount: number;
  weightTotal: bigint;
};

type ProposalVoteSummarySource = {
  proposalId: string;
  governorAddress: string;
  support: number;
  weight: string;
};

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "public", "tally-data");
const outputDbFilename = "db.sqlite";
const outputDbPath = path.join(outputDir, outputDbFilename);
const manifestPath = path.join(outputDir, "manifest.json");
const avatarMapPath = path.join(rootDir, "data", "avatar-map.json");

const delegateFiles = [
  "delegates-1.json",
  "delegates-2.json",
  "delegates-3.json",
];
const candidateFiles = [
  "election-candidates.json",
  "election-5-candidates.json",
];
const DEFAULT_MIN_VOTING_POWER = BigInt("10000000000000000000");
const VALID_PROPOSAL_STATES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
] as const;

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function readOptionalJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value: unknown): string {
  return sqlValue(JSON.stringify(value ?? null));
}

function toSearchSubstringTerms(values: Array<string | null | undefined>) {
  const terms = new Set<string>();

  for (const value of values) {
    for (const token of (value ?? "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((part) => part.length >= 2)) {
      for (let index = 0; index <= token.length - 2; index += 1) {
        terms.add(token.slice(index));
      }
    }
  }

  return Array.from(terms).join(" ");
}

function normalizeProposalState(
  state: string | number | null | undefined
): string | null {
  if (state === undefined || state === null) return null;

  const normalized = String(state).toLowerCase();
  return (
    VALID_PROPOSAL_STATES.find((value) => value.toLowerCase() === normalized) ??
    null
  );
}

async function writeSql(stdin: NodeJS.WritableStream, sql: string) {
  if (!stdin.write(sql)) {
    await once(stdin, "drain");
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  // Build away from the production-facing path so failed builds preserve it.
  const temporaryOutputDir = fs.mkdtempSync(path.join(outputDir, ".db-build-"));
  const temporaryDbPath = path.join(temporaryOutputDir, outputDbFilename);
  let sqlite: ReturnType<typeof spawn> | null = null;

  try {
    sqlite = spawn("sqlite3", [temporaryDbPath], {
      stdio: ["pipe", "inherit", "inherit"],
    });

    if (!sqlite.stdin) {
      throw new Error("sqlite3 stdin was not available");
    }

    let delegateCount = 0;
    let delegateIndexCount = 0;
    let delegateLabelCount = 0;
    let delegateSearchCount = 0;
    let delegateSearchSubstringCount = 0;
    let delegateListCount = 0;
    let delegateListAvatarCount = 0;
    let candidateCount = 0;
    let delegateAvatarCount = 0;
    let delegateIndexAvatarCount = 0;
    let proposalVoteSummaryCount = 0;
    let proposalCheckpointCount = 0;
    const avatarMap = readOptionalJson<Record<string, string>>(
      avatarMapPath,
      {}
    );
    const delegateAddresses = new Set<string>();
    const metadataSearchAddresses = new Set<string>();
    const delegateMetadataByAddressLower = new Map<
      string,
      DelegateSearchMetadata
    >();
    const candidateAddresses = new Set<string>();

    await writeSql(
      sqlite.stdin,
      `
pragma journal_mode = delete;
pragma page_size = 4096;
pragma synchronous = off;
pragma temp_store = memory;

create table delegates (
  address_lower text primary key,
  id text not null,
  address text not null,
  ens text,
  name text,
  bio text,
  twitter text,
  picture text,
  votes_count text not null,
  delegators_count integer not null,
  is_prioritized integer not null,
  labels_json text not null,
  delegate_eligibility_json text
);

create table delegate_statements (
  address_lower text primary key,
  statement text,
  statement_summary text,
  is_seeking_delegation integer not null
);

create table delegate_index (
  address_lower text primary key,
  name text not null,
  picture text
);

create table delegate_labels (
  address_lower text primary key,
  label text not null
);

create virtual table delegate_search using fts5(
  address_lower unindexed,
  address unindexed,
  name,
  ens,
  label,
  tokenize = 'unicode61'
);

create virtual table delegate_search_substrings using fts5(
  address_lower unindexed,
  terms,
  tokenize = 'unicode61'
);

create table delegate_list (
  rank integer primary key,
  address_lower text not null unique,
  address text not null,
  voting_power text not null,
  delegators_count integer not null,
  is_prioritized integer not null,
  ens text,
  name text,
  picture text,
  known_label text
);

create table election_candidates (
  address_lower text primary key,
  address text not null,
  name text not null,
  title text,
  twitter text,
  type text,
  representative text,
  motivation text,
  experience text,
  skills_json text not null,
  projects text,
  country text,
  registered_at text
);

create table delegate_votes (
  voter_lower text not null,
  proposal_id text not null,
  governor_address text not null,
  support integer not null,
  weight text not null,
  block_number integer not null,
  primary key (voter_lower, proposal_id, governor_address)
) without rowid;

create table proposal_vote_summary (
  proposal_id text not null,
  governor_address text not null,
  support integer not null,
  voter_count integer not null,
  weight_total text not null,
  primary key (proposal_id, governor_address, support)
) without rowid;

create table proposals_index (
  proposal_id text not null,
  governor_address text not null,
  snapshot_block integer not null,
  state text,
  proposer text,
  description text,
  primary key (proposal_id, governor_address)
) without rowid;

create table proposal_checkpoints (
  tx_hash text primary key,
  governor_address text not null,
  proposal_id text not null,
  checkpoint_json text not null
) without rowid;

create table build_metadata (
  key text primary key,
  value text not null
);

begin;
`
    );

    for (const filename of delegateFiles) {
      const delegates = readJson<TallyDelegate[]>(`data/${filename}`);
      for (const delegate of delegates) {
        const address = delegate.account.address;
        const addressLower = address.toLowerCase();
        const accountEns = delegate.account.ens?.trim();
        const accountName = delegate.account.name?.trim();
        const picture = avatarMap[addressLower] ?? delegate.account.picture;
        delegateAddresses.add(addressLower);
        delegateMetadataByAddressLower.set(addressLower, {
          name: accountName || null,
          ens: accountEns || null,
        });
        if (
          accountName ||
          (accountEns && !accountEns.toLowerCase().startsWith("0x"))
        ) {
          metadataSearchAddresses.add(addressLower);
        }
        if (BigInt(delegate.votesCount) >= DEFAULT_MIN_VOTING_POWER) {
          delegateListCount += 1;
          if (picture) {
            delegateListAvatarCount += 1;
          }
        }

        await writeSql(
          sqlite.stdin,
          `insert or replace into delegates values (${[
            sqlValue(addressLower),
            sqlValue(delegate.id),
            sqlValue(address),
            sqlValue(delegate.account.ens || null),
            sqlValue(delegate.account.name || null),
            sqlValue(delegate.account.bio || null),
            sqlValue(delegate.account.twitter || null),
            sqlValue(picture),
            sqlValue(delegate.votesCount),
            sqlValue(delegate.delegatorsCount),
            sqlValue(delegate.isPrioritized),
            sqlJson(delegate.labels),
            sqlJson(delegate.delegateEligibility),
          ].join(",")});\n`
        );
        if (picture) {
          delegateAvatarCount += 1;
        }

        await writeSql(
          sqlite.stdin,
          `insert or replace into delegate_statements values (${[
            sqlValue(addressLower),
            sqlValue(delegate.statement.statement || null),
            sqlValue(delegate.statement.statementSummary || null),
            sqlValue(delegate.statement.isSeekingDelegation),
          ].join(",")});\n`
        );
        delegateCount += 1;
      }
    }

    const delegateIndex = readJson<Record<string, DelegateIndexEntry>>(
      "data/delegate-index.json"
    );
    const indexByAddressLower = new Map<string, DelegateIndexEntry>();
    for (const [address, entry] of Object.entries(delegateIndex)) {
      const addressLower = address.toLowerCase();
      const entryWithAvatar = {
        ...entry,
        picture: avatarMap[addressLower] ?? entry.picture,
      };
      indexByAddressLower.set(addressLower, entryWithAvatar);
      await writeSql(
        sqlite.stdin,
        `insert or replace into delegate_index values (${[
          sqlValue(addressLower),
          sqlValue(entry.name),
          sqlValue(entryWithAvatar.picture),
        ].join(",")});\n`
      );
      if (entryWithAvatar.picture) {
        delegateIndexAvatarCount += 1;
      }
      delegateIndexCount += 1;
    }

    const delegateLabels = readJson<{
      delegates: Record<string, string>;
    }>("data/delegate-labels.json");
    for (const [address, label] of Object.entries(delegateLabels.delegates)) {
      await writeSql(
        sqlite.stdin,
        `insert or replace into delegate_labels values (${[
          sqlValue(address.toLowerCase()),
          sqlValue(label),
        ].join(",")});\n`
      );
      delegateLabelCount += 1;
    }

    const labelByAddressLower = new Map(
      Object.entries(delegateLabels.delegates).map(([address, label]) => [
        address.toLowerCase(),
        label,
      ])
    );
    const searchAddresses = new Set([
      ...metadataSearchAddresses,
      ...indexByAddressLower.keys(),
      ...labelByAddressLower.keys(),
    ]);
    for (const addressLower of searchAddresses) {
      if (!delegateAddresses.has(addressLower)) continue;

      const entry = indexByAddressLower.get(addressLower);
      const metadata = delegateMetadataByAddressLower.get(addressLower);
      const label = labelByAddressLower.get(addressLower) ?? null;
      await writeSql(
        sqlite.stdin,
        `insert into delegate_search (address_lower, address, name, ens, label)
select ${[
          sqlValue(addressLower),
          "address",
          `coalesce(${sqlValue(entry?.name ?? null)}, name)`,
          "ens",
          sqlValue(label),
        ].join(",")}
from delegates
where address_lower = ${sqlValue(addressLower)};\n`
      );

      const substringTerms = toSearchSubstringTerms([
        entry?.name ?? metadata?.name,
        metadata?.ens,
        label,
      ]);
      if (substringTerms) {
        await writeSql(
          sqlite.stdin,
          `insert into delegate_search_substrings (address_lower, terms) values (${[
            sqlValue(addressLower),
            sqlValue(substringTerms),
          ].join(",")});\n`
        );
        delegateSearchSubstringCount += 1;
      }

      delegateSearchCount += 1;
    }

    await writeSql(
      sqlite.stdin,
      `
insert into delegate_list (
  rank,
  address_lower,
  address,
  voting_power,
  delegators_count,
  is_prioritized,
  ens,
  name,
  picture,
  known_label
)
select
  row_number() over (order by length(d.votes_count) desc, d.votes_count desc),
  d.address_lower,
  d.address,
  d.votes_count,
  d.delegators_count,
  d.is_prioritized,
  d.ens,
  d.name,
  d.picture,
  l.label
from delegates d
left join delegate_labels l on l.address_lower = d.address_lower
where length(d.votes_count) > length('10000000000000000000')
  or (
    length(d.votes_count) = length('10000000000000000000')
    and d.votes_count >= '10000000000000000000'
  );\n`
    );
    for (const filename of candidateFiles) {
      if (!fs.existsSync(path.join(rootDir, "data", filename))) {
        continue;
      }
      const candidates = readJson<Record<string, CandidateData>>(
        `data/${filename}`
      );
      for (const [key, candidate] of Object.entries(candidates)) {
        const address = candidate.address ?? key;
        candidateAddresses.add(address.toLowerCase());
        await writeSql(
          sqlite.stdin,
          `insert or replace into election_candidates values (${[
            sqlValue(address.toLowerCase()),
            sqlValue(address),
            sqlValue(candidate.name ?? ""),
            sqlValue(candidate.title ?? null),
            sqlValue(candidate.twitter ?? null),
            sqlValue(candidate.type ?? null),
            sqlValue(candidate.representative ?? null),
            sqlValue(candidate.motivation ?? null),
            sqlValue(candidate.experience ?? null),
            sqlJson(candidate.skills ?? null),
            sqlValue(candidate.projects ?? null),
            sqlValue(candidate.country ?? null),
            sqlValue(candidate.registered_at ?? null),
          ].join(",")});\n`
        );
      }
    }
    candidateCount = candidateAddresses.size;

    const votesFile = readJson<VoteHistoryFile>("data/votes.json");
    const proposalsIndexFile = readJson<ProposalsIndexFile>(
      "data/proposals-index.json"
    );
    const votesWatermarkBlock = Math.min(
      votesFile.watermarkBlock,
      proposalsIndexFile.watermarkBlock
    );

    for (const proposal of proposalsIndexFile.proposals) {
      const governorAddress = proposal.governorAddress.toLowerCase();
      const proposalState = normalizeProposalState(proposal.state);
      const proposer = proposal.proposer
        ? proposal.proposer.toLowerCase()
        : null;
      const description = proposal.description ?? null;

      await writeSql(
        sqlite.stdin,
        `insert or replace into proposals_index values (${[
          sqlValue(proposal.proposalId),
          sqlValue(governorAddress),
          sqlValue(proposal.snapshotBlock),
          sqlValue(proposalState),
          sqlValue(proposer),
          sqlValue(description),
        ].join(",")});\n`
      );
    }

    const bundledCachePath = cjsRequire.resolve(
      "@gzeoneth/gov-tracker/bundled-cache.json"
    );
    const bundledCache = JSON.parse(
      fs.readFileSync(bundledCachePath, "utf8")
    ) as BundledCacheJson;
    for (const [key, checkpoint] of Object.entries(bundledCache)) {
      if (!key.startsWith("tx:")) continue;
      const input = checkpoint.input;
      if (
        !input ||
        input.type !== "governor" ||
        !input.creationTxHash ||
        !input.governorAddress ||
        !input.proposalId
      ) {
        continue;
      }

      const txHash = input.creationTxHash.toLowerCase();
      const governorAddress = input.governorAddress.toLowerCase();
      await writeSql(
        sqlite.stdin,
        `insert or replace into proposal_checkpoints values (${[
          sqlValue(txHash),
          sqlValue(governorAddress),
          sqlValue(input.proposalId),
          sqlJson(checkpoint),
        ].join(",")});\n`
      );
      proposalCheckpointCount += 1;
    }

    const proposalVoteSummary = new Map<string, ProposalVoteSummary>();
    const proposalVoteSummarySources = new Map<
      string,
      ProposalVoteSummarySource
    >();
    for (const vote of votesFile.votes) {
      const governorAddress = vote.governorAddress.toLowerCase();
      proposalVoteSummarySources.set(
        [vote.voter.toLowerCase(), vote.proposalId, governorAddress].join(":"),
        {
          proposalId: vote.proposalId,
          governorAddress,
          support: vote.support,
          weight: vote.weight,
        }
      );

      await writeSql(
        sqlite.stdin,
        `insert or replace into delegate_votes values (${[
          sqlValue(vote.voter.toLowerCase()),
          sqlValue(vote.proposalId),
          sqlValue(governorAddress),
          sqlValue(vote.support),
          sqlValue(vote.weight),
          sqlValue(vote.blockNumber),
        ].join(",")});\n`
      );
    }

    for (const vote of proposalVoteSummarySources.values()) {
      const summaryKey = [
        vote.proposalId,
        vote.governorAddress,
        String(vote.support),
      ].join(":");
      const summary = proposalVoteSummary.get(summaryKey);
      if (summary) {
        summary.voterCount += 1;
        summary.weightTotal += BigInt(vote.weight);
      } else {
        proposalVoteSummary.set(summaryKey, {
          proposalId: vote.proposalId,
          governorAddress: vote.governorAddress,
          support: vote.support,
          voterCount: 1,
          weightTotal: BigInt(vote.weight),
        });
      }
    }

    for (const summary of proposalVoteSummary.values()) {
      await writeSql(
        sqlite.stdin,
        `insert or replace into proposal_vote_summary values (${[
          sqlValue(summary.proposalId),
          sqlValue(summary.governorAddress),
          sqlValue(summary.support),
          sqlValue(summary.voterCount),
          sqlValue(summary.weightTotal.toString()),
        ].join(",")});\n`
      );
      proposalVoteSummaryCount += 1;
    }

    await writeSql(
      sqlite.stdin,
      `insert or replace into build_metadata values (${[
        sqlValue("delegate_votes_watermark_block"),
        sqlValue(String(votesWatermarkBlock)),
      ].join(",")});\n`
    );

    await writeSql(
      sqlite.stdin,
      `
commit;

create index delegates_name_idx on delegates(name collate nocase);
create index delegates_ens_idx on delegates(ens collate nocase);
create index delegates_prioritized_idx on delegates(is_prioritized, delegators_count);
create index delegate_index_name_idx on delegate_index(name collate nocase);
create index delegate_list_voting_power_idx on delegate_list(rank, voting_power);
create index election_candidates_name_idx on election_candidates(name collate nocase);
create index delegate_votes_voter_idx on delegate_votes(voter_lower);
create index delegate_votes_proposal_idx on delegate_votes(proposal_id, governor_address);
create index delegate_votes_proposal_support_weight_idx on delegate_votes(proposal_id, governor_address, support, length(weight) desc, weight desc);
create index proposal_checkpoints_proposal_idx on proposal_checkpoints(proposal_id, governor_address);

analyze;
vacuum;
`
    );
    sqlite.stdin.end();

    const [code] = await once(sqlite, "exit");
    if (code !== 0) {
      throw new Error(`sqlite3 exited with code ${code}`);
    }

    const sizeBytes = fs.statSync(temporaryDbPath).size;
    fs.renameSync(temporaryDbPath, outputDbPath);

    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          version: 1,
          generatedAt: new Date().toISOString(),
          databaseUrl: "/tally-data/db.sqlite",
          pageSize: 4096,
          sizeBytes,
          tables: {
            delegates: delegateCount,
            delegateAvatars: delegateAvatarCount,
            delegateIndex: delegateIndexCount,
            delegateIndexAvatars: delegateIndexAvatarCount,
            delegateLabels: delegateLabelCount,
            delegateSearch: delegateSearchCount,
            delegateSearchSubstrings: delegateSearchSubstringCount,
            delegateList: delegateListCount,
            delegateListAvatars: delegateListAvatarCount,
            electionCandidates: candidateCount,
            delegateVotes: votesFile.votes.length,
            proposalVoteSummary: proposalVoteSummaryCount,
            proposalsIndex: proposalsIndexFile.proposals.length,
            proposalCheckpoints: proposalCheckpointCount,
          },
          delegateVotesWatermarkBlock: votesWatermarkBlock,
        },
        null,
        2
      )}\n`
    );

    console.log(
      JSON.stringify(
        {
          database: path.relative(rootDir, outputDbPath),
          manifest: path.relative(rootDir, manifestPath),
          sizeBytes,
          delegates: delegateCount,
          delegateAvatars: delegateAvatarCount,
          delegateIndex: delegateIndexCount,
          delegateIndexAvatars: delegateIndexAvatarCount,
          delegateLabels: delegateLabelCount,
          delegateSearch: delegateSearchCount,
          delegateSearchSubstrings: delegateSearchSubstringCount,
          delegateList: delegateListCount,
          delegateListAvatars: delegateListAvatarCount,
          electionCandidates: candidateCount,
          delegateVotes: votesFile.votes.length,
          proposalVoteSummary: proposalVoteSummaryCount,
          proposalsIndex: proposalsIndexFile.proposals.length,
          proposalCheckpoints: proposalCheckpointCount,
          delegateVotesWatermarkBlock: votesWatermarkBlock,
        },
        null,
        2
      )
    );
  } finally {
    if (sqlite && sqlite.exitCode === null && !sqlite.killed) {
      sqlite.stdin?.destroy();
      sqlite.kill();
    }
    fs.rmSync(temporaryOutputDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
