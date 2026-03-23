#!/usr/bin/env tsx
/**
 * Fetch Security Council election candidate profiles from on-chain data + Tally.xyz
 *
 * Writes a single flat file: data/candidates.json
 * The cron job merges new candidates into the existing file over time.
 *
 * Usage:
 *   npx tsx scripts/fetch-candidates.ts                # fetch latest active election
 *   npx tsx scripts/fetch-candidates.ts --election 5   # fetch specific election
 */

import {
  getContenders,
  getElectionCount,
  getElectionStatus,
  getNomineeElectionDetails,
  serializeNomineeDetails,
  type SerializableContender,
  type SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";
import { ethers } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TechnicalSkills {
  solidity: number | null;
  javascript: number | null;
  rust: number | null;
  golang: number | null;
  cybersecurityYears: number | null;
}

interface CandidateProfile {
  address: string;
  name: string | null;
  bio: string | null;
  picture: string | null;
  entityType: string | null;
  country: string | null;
  motivation: string | null;
  qualifications: string | null;
  projectsInvolved: string | null;
  technicalSkills: TechnicalSkills | null;
  registeredAtBlock: number;
  registrationTxHash: string;
  delegateLabel: string | null;
  tallyProfileUrl: string;
  arbiscanUrl: string;
}

interface CandidatesFile {
  updatedAt: string;
  candidates: Record<string, CandidateProfile>;
}

const OUTPUT_PATH = join(process.cwd(), "data/candidates.json");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { electionIndex?: number } {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--election");
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    if (Number.isNaN(n) || n < 0) {
      console.error("--election must be a non-negative integer");
      process.exit(1);
    }
    return { electionIndex: n };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Existing data
// ---------------------------------------------------------------------------

function loadExisting(): CandidatesFile {
  if (!existsSync(OUTPUT_PATH)) {
    return { updatedAt: "", candidates: {} };
  }
  try {
    return JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
  } catch {
    return { updatedAt: "", candidates: {} };
  }
}

// ---------------------------------------------------------------------------
// Delegate labels (fallback names)
// ---------------------------------------------------------------------------

function loadDelegateLabels(): Map<string, string> {
  const raw = readFileSync(
    join(process.cwd(), "data/delegate-labels.json"),
    "utf-8"
  );
  const data = JSON.parse(raw) as { delegates: Record<string, string> };
  const map = new Map<string, string>();
  for (const [addr, label] of Object.entries(data.delegates)) {
    map.set(addr.toLowerCase(), label);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tally page scraping via __NEXT_DATA__
// ---------------------------------------------------------------------------

function getTallyProfileUrl(electionIndex: number, address: string): string {
  return `https://www.tally.xyz/gov/arbitrum/council/security-council/election/${electionIndex}/round-1/candidate/${address}`;
}

function extractNextData(html: string): Record<string, unknown> | null {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function dig(obj: unknown, path: string): unknown {
  let current = obj;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

interface TallyProfileData {
  name: string | null;
  bio: string | null;
  picture: string | null;
  entityType: string | null;
  country: string | null;
  motivation: string | null;
  qualifications: string | null;
  projectsInvolved: string | null;
  technicalSkills: TechnicalSkills | null;
}

function parseTallyProfile(
  nextData: Record<string, unknown>
): TallyProfileData {
  const candidate = dig(nextData, "props.pageProps.candidate") as
    | Record<string, unknown>
    | undefined;
  if (!candidate) return emptyProfile();

  const account = candidate.account as Record<string, unknown> | undefined;
  const electionMeta = candidate.accountElectionMeta as
    | Record<string, unknown>
    | undefined;

  let statement: Record<string, unknown> | undefined;
  const rawStatement = electionMeta?.statement;
  if (typeof rawStatement === "string") {
    try {
      statement = JSON.parse(rawStatement);
    } catch {
      statement = undefined;
    }
  } else if (typeof rawStatement === "object" && rawStatement !== null) {
    statement = rawStatement as Record<string, unknown>;
  }

  const customQ = statement?.customQuestion as
    | Record<string, unknown>
    | undefined;

  let technicalSkills: TechnicalSkills | null = null;
  if (customQ) {
    technicalSkills = {
      solidity: num(customQ.proficiencySolidity),
      javascript: num(customQ.proficiencyJavascript),
      rust: num(customQ.proficiencyRust),
      golang: num(customQ.proficiencyGolang),
      cybersecurityYears: num(customQ.experienceCyberSecurity),
    };
  }

  return {
    name: str(dig(electionMeta, "title")) ?? str(account?.name) ?? null,
    bio: str(account?.bio) ?? str(account?.description) ?? null,
    picture: str(account?.picture) ?? null,
    entityType: str(customQ?.individualOrOrganization) ?? null,
    country: str(customQ?.countryBasedIn) ?? null,
    motivation: str(statement?.motivationToSignUp) ?? null,
    qualifications: str(statement?.relevantExperience) ?? null,
    projectsInvolved: str(customQ?.projectsInvolved) ?? null,
    technicalSkills,
  };
}

function emptyProfile(): TallyProfileData {
  return {
    name: null,
    bio: null,
    picture: null,
    entityType: null,
    country: null,
    motivation: null,
    qualifications: null,
    projectsInvolved: null,
    technicalSkills: null,
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

async function fetchTallyProfile(url: string): Promise<TallyProfileData> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; tally-zero-candidate-fetcher/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      console.warn(`  HTTP ${response.status} for ${url}`);
      return emptyProfile();
    }
    const html = await response.text();
    const nextData = extractNextData(html);
    if (!nextData) {
      console.warn(`  No __NEXT_DATA__ found for ${url}`);
      return emptyProfile();
    }
    return parseTallyProfile(nextData);
  } catch (err) {
    console.warn(`  Fetch error for ${url}:`, (err as Error).message);
    return emptyProfile();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { electionIndex: requestedIndex } = parseArgs();

  const rpcUrl = process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
  console.log(`Using RPC: ${rpcUrl}`);

  const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);

  // Determine election index
  let electionIndex: number;
  if (requestedIndex !== undefined) {
    electionIndex = requestedIndex;
    console.log(`Fetching election ${electionIndex} (requested)`);
  } else {
    const count = await getElectionCount(provider);
    electionIndex = count - 1;
    console.log(
      `Found ${count} elections, fetching latest: election ${electionIndex}`
    );
  }

  // Get contenders from chain
  // Uses the same fallback pattern as hooks/use-election-status.ts:298-323
  console.log("Querying on-chain contender data...");
  let serialized: SerializableNomineeDetails;

  const raw = await getNomineeElectionDetails(electionIndex, provider).catch(
    (err: Error) => {
      console.warn(`getNomineeElectionDetails failed: ${err.message}`);
      return null;
    }
  );

  if (raw) {
    serialized = serializeNomineeDetails(raw);
  } else {
    console.log("Falling back to getContenders via election status...");
    const status = await getElectionStatus(provider, electionIndex);
    if (!status.nomineeProposalId) {
      console.error(`No nominee proposal ID for election ${electionIndex}`);
      process.exit(1);
    }
    const contenders = await getContenders(status.nomineeProposalId, provider);
    serialized = {
      proposalId: status.nomineeProposalId,
      electionIndex,
      contenders: contenders.map((c) => ({
        address: c.address,
        registeredAtBlock: c.registeredAtBlock,
        registrationTxHash: c.registrationTxHash,
      })),
      nominees: [],
      compliantNominees: [],
      excludedNominees: [],
      quorumThreshold: "0",
      targetNomineeCount: status.targetNomineeCount,
    };
  }

  console.log(`Found ${serialized.contenders.length} contenders on-chain`);

  // Load existing data and delegate labels
  const existing = loadExisting();
  const delegateLabels = loadDelegateLabels();

  let added = 0;
  let updated = 0;

  for (let i = 0; i < serialized.contenders.length; i++) {
    const contender: SerializableContender = serialized.contenders[i];
    const key = contender.address.toLowerCase();
    const label = delegateLabels.get(key) ?? null;

    console.log(
      `[${i + 1}/${serialized.contenders.length}] ${label ?? contender.address}`
    );

    const tallyUrl = getTallyProfileUrl(electionIndex, contender.address);
    const profile = await fetchTallyProfile(tallyUrl);

    const entry: CandidateProfile = {
      address: contender.address,
      name: profile.name,
      bio: profile.bio,
      picture: profile.picture,
      entityType: profile.entityType,
      country: profile.country,
      motivation: profile.motivation,
      qualifications: profile.qualifications,
      projectsInvolved: profile.projectsInvolved,
      technicalSkills: profile.technicalSkills,
      registeredAtBlock: contender.registeredAtBlock,
      registrationTxHash: contender.registrationTxHash,
      delegateLabel: label,
      tallyProfileUrl: tallyUrl,
      arbiscanUrl: `https://arbiscan.io/address/${contender.address}`,
    };

    if (existing.candidates[key]) {
      updated++;
    } else {
      added++;
    }
    existing.candidates[key] = entry;

    // Rate-limit: 1 second between requests
    if (i < serialized.contenders.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Write merged output
  existing.updatedAt = new Date().toISOString();
  writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2) + "\n");

  const total = Object.keys(existing.candidates).length;
  console.log(`\nDone! ${OUTPUT_PATH}`);
  console.log(`  ${added} added, ${updated} updated, ${total} total`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
