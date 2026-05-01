"use client";

import {
  createDbWorker,
  type SqliteStats,
  type WorkerHttpvfs,
} from "sql.js-httpvfs";

import { loadManifest } from "@/lib/tally-data/manifest";
import type {
  TallyAddressDisplayRecord,
  TallyCandidateSummary,
  TallyDataClient,
  TallyDataManifest,
  TallyDataStats,
  TallyDelegateListItem,
  TallyDelegateListResult,
  TallyDelegateProfile,
  TallyDelegateSearchResult,
  TallyDelegateSummary,
  TallyElectionCandidate,
} from "@/lib/tally-data/types";

const DEFAULT_CHUNK_SIZE = 4096;
const MAX_BATCH_SIZE = 800;
const DEFAULT_MIN_VOTING_POWER = "10000000000000000000";
const ARB_TOTAL_SUPPLY = "10000000000000000000000000000";
const LOCAL_STORAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getLocalStoragePrefix(manifest: TallyDataManifest): string {
  return `tally-zero:sqlite:${manifest.schemaVersion}:${manifest.sizeBytes}:`;
}

let workerPromise: Promise<WorkerHttpvfs> | null = null;
let localStoragePrefix: string | null = null;
let localStoragePrefixPromise: Promise<string> | null = null;
let sweepDone = false;

function sweepStaleLocalStorage(currentPrefix: string): void {
  if (sweepDone) return;
  sweepDone = true;
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (
        key &&
        key.startsWith("tally-zero:sqlite:") &&
        !key.startsWith(currentPrefix)
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage is best-effort (private browsing, quota, etc.).
  }
}

async function getLocalStoragePrefixAsync(): Promise<string> {
  if (localStoragePrefix !== null) return localStoragePrefix;
  localStoragePrefixPromise ??= loadManifest()
    .then((manifest) => {
      const prefix = getLocalStoragePrefix(manifest);
      localStoragePrefix = prefix;
      sweepStaleLocalStorage(prefix);
      return prefix;
    })
    .catch((err) => {
      localStoragePrefixPromise = null;
      throw err;
    });
  return localStoragePrefixPromise;
}

type DelegateRow = {
  id: string;
  address: string;
  ens: string | null;
  name: string | null;
  bio: string | null;
  twitter: string | null;
  picture: string | null;
  votes_count: string;
  delegators_count: number;
  is_prioritized: number;
  labels_json: string;
  delegate_eligibility_json: string | null;
  statement: string | null;
  statement_summary: string | null;
  is_seeking_delegation: number | null;
  known_label: string | null;
};

type DelegateSummaryRow = {
  address: string;
  ens: string | null;
  name: string | null;
  picture: string | null;
  known_label: string | null;
};

type CandidateSummaryRow = {
  address: string;
  name: string;
  title: string | null;
  type: string | null;
};

type CandidateRow = CandidateSummaryRow & {
  twitter: string | null;
  representative: string | null;
  motivation: string | null;
  experience: string | null;
  skills_json: string;
  projects: string | null;
  country: string | null;
  registered_at: string | null;
};

type LocalStorageEntry<T> = {
  createdAt: number;
  value: T;
};

type StoredDelegateListItem = [
  address: `0x${string}`,
  votingPower: string,
  ens: string | null,
  name: string | null,
  picture: string | null,
  knownLabel: string | null,
  delegatorsCount: number,
  isPrioritized: boolean,
];

type StoredDelegateListResult = {
  d: StoredDelegateListItem[];
  tvp: string;
  ts: string;
};

async function getWorker(): Promise<WorkerHttpvfs> {
  if (typeof window === "undefined") {
    throw new Error("The Tally data SQLite adapter can only run in a browser.");
  }

  if (workerPromise) return workerPromise;

  const manifest = await loadManifest();
  // Cache the prefix once the manifest is in hand so synchronous helpers
  // downstream of getWorker() can read it without re-awaiting.
  localStoragePrefix = getLocalStoragePrefix(manifest);
  sweepStaleLocalStorage(localStoragePrefix);

  const cacheBust = manifest.cacheBust;
  const virtualFilename = `tally-zero-${cacheBust}.sqlite`;

  const databaseConfig = {
    from: "inline" as const,
    virtualFilename,
    config: {
      serverMode: "full" as const,
      requestChunkSize: DEFAULT_CHUNK_SIZE,
      cacheBust,
      url: manifest.databaseUrl,
    },
  };

  // Reset workerPromise on init failure so subsequent callers retry instead
  // of awaiting a permanently-rejected promise.
  workerPromise = createDbWorker(
    [databaseConfig],
    new URL("sql.js-httpvfs/dist/sqlite.worker.js", import.meta.url).toString(),
    new URL("sql.js-httpvfs/dist/sql-wasm.wasm", import.meta.url).toString()
  ).catch((err) => {
    workerPromise = null;
    throw err;
  });

  return workerPromise;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function uniqueNormalizedAddresses(addresses: string[]): string[] {
  return Array.from(
    new Set(
      addresses.filter(Boolean).map((address) => normalizeAddress(address))
    )
  );
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

async function queryRows<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const worker = await getWorker();
  if (params.length === 0) {
    return (await worker.db.query(sql)) as T[];
  }
  return (await worker.db.query(sql, params)) as T[];
}

function getLocalStorageKey(prefix: string, key: string): string {
  return `${prefix}${key}`;
}

function readLocalStorage<T>(prefix: string, key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const fullKey = getLocalStorageKey(prefix, key);
    const raw = window.localStorage.getItem(fullKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as LocalStorageEntry<T>;
    if (Date.now() - parsed.createdAt > LOCAL_STORAGE_MAX_AGE_MS) {
      window.localStorage.removeItem(fullKey);
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
}

function writeLocalStorage<T>(prefix: string, key: string, value: T): void {
  if (typeof window === "undefined") return;

  try {
    const entry: LocalStorageEntry<T> = {
      createdAt: Date.now(),
      value,
    };
    window.localStorage.setItem(
      getLocalStorageKey(prefix, key),
      JSON.stringify(entry)
    );
  } catch {
    // localStorage is best-effort; query results are still usable without it.
  }
}

function readDelegateListLocalStorage(
  prefix: string,
  key: string
): TallyDelegateListResult | null {
  const stored = readLocalStorage<StoredDelegateListResult>(prefix, key);
  if (!stored) return null;

  return {
    delegates: stored.d.map(
      ([
        address,
        votingPower,
        ens,
        name,
        picture,
        knownLabel,
        delegatorsCount,
        isPrioritized,
      ]) => ({
        address,
        votingPower,
        ens,
        name,
        picture,
        knownLabel,
        displayName: knownLabel ?? name ?? ens ?? null,
        votesCount: votingPower,
        delegatorsCount,
        isPrioritized,
      })
    ),
    totalVotingPower: stored.tvp,
    totalSupply: stored.ts,
  };
}

function writeDelegateListLocalStorage(
  prefix: string,
  key: string,
  result: TallyDelegateListResult
): void {
  writeLocalStorage<StoredDelegateListResult>(prefix, key, {
    d: result.delegates.map((delegate) => [
      delegate.address,
      delegate.votingPower,
      delegate.ens,
      delegate.name,
      delegate.picture,
      delegate.knownLabel,
      delegate.delegatorsCount,
      delegate.isPrioritized,
    ]),
    tvp: result.totalVotingPower,
    ts: result.totalSupply,
  });
}

async function queryAddressBatches<T>(
  addresses: string[],
  buildSql: (placeholderSql: string) => string
): Promise<T[]> {
  const normalized = uniqueNormalizedAddresses(addresses);
  const rows: T[] = [];

  for (let i = 0; i < normalized.length; i += MAX_BATCH_SIZE) {
    const batch = normalized.slice(i, i + MAX_BATCH_SIZE);
    if (batch.length === 0) continue;
    rows.push(
      ...(await queryRows<T>(buildSql(placeholders(batch.length)), ...batch))
    );
  }

  return rows;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toFtsPrefixQuery(query: string): string {
  return query
    .trim()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
    .map((term) => `${term.replaceAll('"', '""')}*`)
    .join(" ");
}

function decimalGteSql(columnName: string): string {
  return `(length(${columnName}) > length(?) or (length(${columnName}) = length(?) and ${columnName} >= ?))`;
}

function toDelegate(row: DelegateRow): TallyDelegateProfile {
  return {
    id: row.id,
    votesCount: row.votes_count,
    delegatorsCount: row.delegators_count,
    isPrioritized: Boolean(row.is_prioritized),
    account: {
      address: row.address,
      ens: row.ens ?? "",
      name: row.name ?? "",
      bio: row.bio ?? "",
      twitter: row.twitter ?? "",
      picture: row.picture,
    },
    statement: {
      statement: row.statement ?? "",
      statementSummary: row.statement_summary ?? "",
      isSeekingDelegation: Boolean(row.is_seeking_delegation),
    },
    labels: parseJson<string[]>(row.labels_json, []),
    delegateEligibility: parseJson<unknown>(
      row.delegate_eligibility_json,
      null
    ),
    knownLabel: row.known_label,
  };
}

function toDelegateSummary(row: DelegateSummaryRow): TallyDelegateSummary {
  const displayName = row.known_label ?? row.name ?? row.ens ?? null;
  return {
    address: row.address as `0x${string}`,
    ens: row.ens,
    name: row.name,
    picture: row.picture,
    knownLabel: row.known_label,
    displayName,
  };
}

function toDelegateListItem(
  row: DelegateSummaryRow & {
    votes_count: string;
    delegators_count: number;
    is_prioritized: number;
  }
): TallyDelegateListItem {
  const summary = toDelegateSummary(row);
  return {
    ...summary,
    address: summary.address as `0x${string}`,
    votesCount: row.votes_count,
    votingPower: row.votes_count,
    delegatorsCount: row.delegators_count,
    isPrioritized: Boolean(row.is_prioritized),
  };
}

function toCandidate(row: CandidateRow): TallyElectionCandidate {
  return {
    address: row.address,
    name: row.name,
    title: row.title,
    twitter: row.twitter,
    type: row.type,
    representative: row.representative,
    motivation: row.motivation,
    experience: row.experience,
    skills: parseJson<unknown>(row.skills_json, null),
    projects: row.projects,
    country: row.country,
    registeredAt: row.registered_at,
  };
}

function mapByAddress<T extends { address: string }>(
  rows: T[]
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(normalizeAddress(row.address), row);
  }
  return map;
}

export class SqliteTallyDataClient implements TallyDataClient {
  async getDelegateList(
    minVotingPower = DEFAULT_MIN_VOTING_POWER
  ): Promise<TallyDelegateListResult> {
    const [prefix, manifest] = await Promise.all([
      getLocalStoragePrefixAsync(),
      loadManifest(),
    ]);
    const cacheKey = `delegate-list:${minVotingPower}`;
    const cached = readDelegateListLocalStorage(prefix, cacheKey);
    if (cached) return cached;

    const rows = await queryRows<
      DelegateSummaryRow & {
        votes_count: string;
        delegators_count: number;
        is_prioritized: number;
      }
    >(
      `
select
  d.address,
  d.ens,
  d.name,
  d.picture,
  d.voting_power as votes_count,
  d.delegators_count,
  d.is_prioritized,
  d.known_label
from delegate_list d
where ${decimalGteSql("d.voting_power")}
order by d.rank
`,
      minVotingPower,
      minVotingPower,
      minVotingPower
    );

    const delegates = rows.map(toDelegateListItem);
    const result: TallyDelegateListResult = {
      delegates,
      // Sum across every tracked delegate (>=1 ARB), not the filtered view,
      // so the headline figure does not collapse when the user raises the
      // display-side minimum power.
      totalVotingPower: manifest.totalVotingPower,
      totalSupply: ARB_TOTAL_SUPPLY,
    };

    writeDelegateListLocalStorage(prefix, cacheKey, result);
    return result;
  }

  async getDelegate(address: string): Promise<TallyDelegateProfile | null> {
    const prefix = await getLocalStoragePrefixAsync();
    const cacheKey = `delegate:${normalizeAddress(address)}`;
    const cached = readLocalStorage<TallyDelegateProfile | null>(
      prefix,
      cacheKey
    );
    if (cached) return cached;

    const rows = await queryRows<DelegateRow>(
      `
select
  d.*,
  s.statement,
  s.statement_summary,
  s.is_seeking_delegation,
  l.label as known_label
from delegates d
left join delegate_statements s on s.address_lower = d.address_lower
left join delegate_labels l on l.address_lower = d.address_lower
where d.address_lower = ?
limit 1
`,
      normalizeAddress(address)
    );

    const delegate = rows[0] ? toDelegate(rows[0]) : null;
    writeLocalStorage(prefix, cacheKey, delegate);
    return delegate;
  }

  async getDelegateSummaries(
    addresses: string[]
  ): Promise<Map<string, TallyDelegateSummary>> {
    const prefix = await getLocalStoragePrefixAsync();
    const normalized = uniqueNormalizedAddresses(addresses);
    const cachedRows = new Map<string, TallyDelegateSummary>();
    const missing: string[] = [];

    for (const address of normalized) {
      const cached = readLocalStorage<TallyDelegateSummary>(
        prefix,
        `delegate-summary:${address}`
      );
      if (cached) {
        cachedRows.set(address, cached);
      } else {
        missing.push(address);
      }
    }

    const rows = await queryAddressBatches<DelegateSummaryRow>(
      missing,
      (addressPlaceholders) => `
select
  d.address,
  d.ens,
  d.name,
  d.picture,
  l.label as known_label
from delegates d
left join delegate_labels l on l.address_lower = d.address_lower
where d.address_lower in (${addressPlaceholders})
`
    );
    const fetchedRows = rows.map(toDelegateSummary);
    for (const row of fetchedRows) {
      const address = normalizeAddress(row.address);
      cachedRows.set(address, row);
      writeLocalStorage(prefix, `delegate-summary:${address}`, row);
    }

    return cachedRows;
  }

  async searchDelegates(
    query: string,
    limit = 1000
  ): Promise<TallyDelegateSearchResult[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const ftsQuery = toFtsPrefixQuery(normalizedQuery);
    if (!ftsQuery) return [];
    const prefix = await getLocalStoragePrefixAsync();
    const cacheKey = `delegate-search:${normalizedQuery}:${limit}`;
    const cached = readLocalStorage<TallyDelegateSearchResult[]>(
      prefix,
      cacheKey
    );
    if (cached) return cached;

    const rows = await queryRows<
      DelegateSummaryRow & {
        votes_count: string;
        delegators_count: number;
        is_prioritized: number;
      }
    >(
      `
with metadata_matches(address_lower) as (
  select address_lower
  from delegate_search
  where delegate_search match ?
  union
  select address_lower
  from delegate_search_substrings
  where delegate_search_substrings match ?
)
select
  d.address,
  d.ens,
  d.name,
  d.picture,
  d.votes_count,
  d.delegators_count,
  d.is_prioritized,
  l.label as known_label
from delegates d
join metadata_matches on metadata_matches.address_lower = d.address_lower
left join delegate_labels l on l.address_lower = d.address_lower
order by d.is_prioritized desc, d.delegators_count desc, d.name collate nocase
limit ?
`,
      ftsQuery,
      ftsQuery,
      limit
    );

    const delegates = rows.map((row) => {
      const item = toDelegateListItem(row);
      return {
        address: item.address,
        ens: item.ens,
        name: item.name,
        picture: item.picture,
        knownLabel: item.knownLabel,
        displayName: item.displayName,
        votesCount: item.votesCount,
        delegatorsCount: item.delegatorsCount,
        isPrioritized: item.isPrioritized,
      };
    });
    writeLocalStorage(prefix, cacheKey, delegates);
    return delegates;
  }

  async getCandidate(address: string): Promise<TallyElectionCandidate | null> {
    const rows = await queryRows<CandidateRow>(
      `
select
  address,
  name,
  title,
  twitter,
  type,
  representative,
  motivation,
  experience,
  skills_json,
  projects,
  country,
  registered_at
from election_candidates
where address_lower = ?
limit 1
`,
      normalizeAddress(address)
    );

    return rows[0] ? toCandidate(rows[0]) : null;
  }

  async getCandidateSummaries(
    addresses: string[]
  ): Promise<Map<string, TallyCandidateSummary>> {
    const rows = await queryAddressBatches<CandidateSummaryRow>(
      addresses,
      (addressPlaceholders) => `
select address, name, title, type
from election_candidates
where address_lower in (${addressPlaceholders})
`
    );
    return mapByAddress(rows);
  }

  async getAddressDisplayRecords(
    addresses: string[]
  ): Promise<Map<string, TallyAddressDisplayRecord>> {
    const normalized = uniqueNormalizedAddresses(addresses);
    const [candidates, delegates] = await Promise.all([
      this.getCandidateSummaries(normalized),
      this.getDelegateSummaries(normalized),
    ]);
    const records = new Map<string, TallyAddressDisplayRecord>();

    for (const addressLower of normalized) {
      const candidate = candidates.get(addressLower);
      if (candidate) {
        records.set(addressLower, {
          address: candidate.address,
          label: candidate.name,
          title: candidate.title,
          picture: null,
          profileUrl: `/elections/contender/${candidate.address.toLowerCase()}`,
          source: "candidate",
        });
        continue;
      }

      const delegate = delegates.get(addressLower);
      if (delegate?.displayName || delegate?.picture) {
        records.set(addressLower, {
          address: delegate.address,
          label: delegate.displayName,
          title: null,
          picture: delegate.picture,
          profileUrl: null,
          source: "delegate",
        });
        continue;
      }

      records.set(addressLower, {
        address: addressLower,
        label: null,
        title: null,
        picture: null,
        profileUrl: null,
        source: "address",
      });
    }

    return records;
  }

  async getStats(): Promise<TallyDataStats> {
    const worker = await getWorker();
    const rows = (await worker.db.query(`
select
  (select count(*) from delegates) as delegates,
  (select count(*) from delegate_index) as delegate_index,
  (select count(*) from delegate_labels) as delegate_labels,
  (select count(*) from delegate_search) as delegate_search,
  (select count(*) from election_candidates) as election_candidates
`)) as {
      delegates: number;
      delegate_index: number;
      delegate_labels: number;
      delegate_search: number;
      election_candidates: number;
    }[];
    const httpvfs: SqliteStats | null = await worker.worker.getStats();
    const counts = rows[0];

    return {
      delegates: counts.delegates,
      delegateIndex: counts.delegate_index,
      delegateLabels: counts.delegate_labels,
      delegateSearch: counts.delegate_search,
      electionCandidates: counts.election_candidates,
      httpvfs,
    };
  }
}
