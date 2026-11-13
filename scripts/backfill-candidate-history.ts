/**
 * Backfill the Tally registrations the export does not have.
 *
 * data/election-candidates.json keeps one record per address: each candidate's
 * latest registration. Candidates run again, and Tally still serves every
 * earlier registration on its public per-election candidate page
 * (/gov/arbitrum/council/security-council/election/N/round-1/candidate/0x…),
 * so this reads those pages for every indexed contender run the export lacks and
 * writes them to data/election-candidate-history.json, keyed by election.
 *
 *   --verify  re-derive the export's own records from Tally instead, and report
 *             any field that does not match. Run it before trusting the mapping.
 *
 * Usage: GOVERNANCE_INDEXER_URL=https://… tsx scripts/backfill-candidate-history.ts [--verify]
 */
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "data");
const EXPORT = path.join(DATA_DIR, "election-candidates.json");
const HISTORY = path.join(DATA_DIR, "election-candidate-history.json");
const TALLY =
  "https://www.tally.xyz/gov/arbitrum/council/security-council/election";
const INDEXER = process.env.GOVERNANCE_INDEXER_URL;

export type CandidateRecord = {
  name: string;
  title: string | null;
  address: string;
  twitter?: string | null;
  type: string;
  representative?: string | null;
  motivation: string | null;
  experience: string | null;
  skills: {
    canVerifySigning: boolean;
    golang: number;
    solidity: number;
    rust: number;
    javascript: number;
    cyberSecurity: string | null;
  };
  projects: string | null;
  country: string | null;
  registered_at?: string | null;
  electionIndex?: number | null;
};

type TallyCandidate = {
  account: { address: string; name: string | null; twitter: string | null };
  accountElectionMeta: {
    title: string | null;
    statement: string | null;
    hasRegistered: boolean;
  } | null;
};

/** Tally stores answers as entered, with markdown escapes; the export holds the plain text. */
const blank = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, "$1").trim();
  return text === "" ? null : text;
};
/** Ratings are free text ("10 (Code4rena members)", "7.5", "-"); the export keeps the whole number, 0 if none. */
const rating = (value: unknown): number => {
  // Only a leading number: prose answers ("…for Web3 applications") count as none.
  const number = /^\d+(\.\d+)?/.exec(blank(value) ?? "");
  return number ? Math.floor(Number(number[0])) : 0;
};

/**
 * Tally asks "individual or organization?" as free text ("Martin Azpiroz
 * (Individual)", "Organization - … is the representative."); the export holds
 * the normalized word.
 */
export function entityType(answer: unknown): string {
  const text = blank(answer);
  if (text === null) return "individual";
  return /organi[sz]ation|\bcompany\b|\bteam\b|\bfrom [A-Z]|\bto represent /i.test(
    text
  )
    ? "organization"
    : "individual";
}

/** Tally's registration form, mapped onto the export's field names. */
export function fromTally(candidate: TallyCandidate): CandidateRecord | null {
  const meta = candidate.accountElectionMeta;
  if (!meta?.hasRegistered || !meta.statement) return null;
  const statement = JSON.parse(meta.statement) as Record<string, unknown>;
  const answers = (statement.customQuestion ?? {}) as Record<string, unknown>;
  const twitter = blank(candidate.account.twitter);
  return {
    name: candidate.account.name ?? candidate.account.address,
    title: blank(meta.title),
    address: candidate.account.address,
    twitter: twitter ? `https://twitter.com/${twitter}` : null,
    type: entityType(answers.individualOrOrganization),
    representative: blank(answers.representativeName),
    motivation: blank(statement.motivationToSignUp),
    experience: blank(statement.relevantExperience),
    skills: {
      canVerifySigning: /^\s*yes/i.test(
        String(answers.independentlyVerifySigning ?? "")
      ),
      golang: rating(answers.proficiencyGolang),
      solidity: rating(answers.proficiencySolidity),
      rust: rating(answers.proficiencyRust),
      javascript: rating(answers.proficiencyJavascript),
      cyberSecurity: blank(answers.experienceCyberSecurity),
    },
    projects: blank(answers.projectsInvolved),
    country: blank(answers.countryBasedIn),
  };
}

async function tallyCandidate(
  electionIndex: number,
  address: string
): Promise<TallyCandidate | null> {
  const response = await fetch(
    `${TALLY}/${electionIndex}/round-1/candidate/${address}`,
    { headers: { "user-agent": "Mozilla/5.0" } }
  );
  if (!response.ok) return null;
  const html = await response.text();
  const data = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!data) return null;
  return (
    ((JSON.parse(data[1]) as { props: { pageProps: { candidate?: unknown } } })
      .props.pageProps.candidate as TallyCandidate | undefined) ?? null
  );
}

async function indexedRuns(): Promise<Map<string, number[]>> {
  if (!INDEXER) throw new Error("GOVERNANCE_INDEXER_URL is required");
  const response = await fetch(`${INDEXER}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `{ elections(limit: 100, orderBy: "createdAtTimestamp", orderDirection: "asc") {
        items { candidates(limit: 1000) { items { candidateAddress isContender } } }
      } }`,
    }),
  });
  const body = (await response.json()) as {
    data: {
      elections: {
        items: {
          candidates: {
            items: { candidateAddress: string; isContender: boolean }[];
          };
        }[];
      };
    };
  };
  // Creation order is the governor's election number (see assign-candidate-elections.ts).
  const runs = new Map<string, number[]>();
  body.data.elections.items.forEach((election, electionIndex) => {
    for (const candidate of election.candidates.items) {
      if (!candidate.isContender) continue;
      const address = candidate.candidateAddress.toLowerCase();
      runs.set(address, [...(runs.get(address) ?? []), electionIndex]);
    }
  });
  return runs;
}

/**
 * Compare content, not formatting: the export drops whitespace after some full
 * stops, keeps trailing spaces, stores "" for an empty answer, and was edited to
 * read "ArbitrumDAO" throughout.
 */
const squash = (text: string) =>
  text
    .replace(/\\[rnt]/g, "")
    .replace(/""/g, "null")
    .replace(/Arbitrum ?DAO/g, "ArbitrumDAO")
    .replace(/\\\\_/g, "_")
    .replace(/\s+/g, "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COMPARED = [
  "title",
  "type",
  "motivation",
  "experience",
  "projects",
  "country",
  "skills",
] as const;

async function verify(records: Record<string, CandidateRecord>) {
  let checked = 0;
  const mismatches: string[] = [];
  for (const [address, record] of Object.entries(records)) {
    if (record.electionIndex == null) continue;
    const fetched = await tallyCandidate(record.electionIndex, address);
    const mapped = fetched ? fromTally(fetched) : null;
    checked += 1;
    if (!mapped) {
      mismatches.push(`${address} #${record.electionIndex}: not on Tally`);
      continue;
    }
    for (const field of COMPARED) {
      // Line endings and runs of spaces differ between the two copies of the same text.
      const want = squash(JSON.stringify(record[field] ?? null));
      const got = squash(JSON.stringify(mapped[field] ?? null));
      if (want !== got) {
        let at = 0;
        while (at < want.length && want[at] === got[at]) at += 1;
        const from = Math.max(0, at - 20);
        mismatches.push(
          `${address} #${record.electionIndex} ${field}: at ${at}/${want.length} export …${want.slice(from, at + 40)} | tally …${got.slice(from, at + 40)}`
        );
      }
    }
    await sleep(300);
  }
  console.log(`verified ${checked} export records against Tally`);
  console.log(`mismatches: ${mismatches.length}`);
  const byField = new Map<string, number>();
  for (const line of mismatches) {
    const field = line.split(" ")[2]?.replace(":", "") ?? "?";
    byField.set(field, (byField.get(field) ?? 0) + 1);
  }
  console.log(`by field: ${JSON.stringify(Object.fromEntries(byField))}`);
  for (const line of mismatches) console.log(`  ${line}`);
}

async function backfill(records: Record<string, CandidateRecord>) {
  const exported = new Map(
    Object.entries(records).map(([address, record]) => [
      address.toLowerCase(),
      record.electionIndex ?? null,
    ])
  );
  const history: Record<string, Record<string, CandidateRecord>> = {};
  const missing: string[] = [];
  let fetched = 0;
  for (const [address, elections] of await indexedRuns()) {
    for (const electionIndex of elections) {
      if (exported.get(address) === electionIndex) continue;
      const candidate = await tallyCandidate(electionIndex, address);
      const record = candidate ? fromTally(candidate) : null;
      await sleep(300);
      if (!record) {
        missing.push(`${address} #${electionIndex}`);
        continue;
      }
      history[electionIndex] ??= {};
      history[electionIndex][record.address] = {
        ...record,
        registered_at: null,
        electionIndex,
      };
      fetched += 1;
    }
  }
  fs.writeFileSync(HISTORY, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`backfilled ${fetched} earlier registrations`);
  for (const [electionIndex, byAddress] of Object.entries(history)) {
    console.log(
      `  election ${electionIndex}: ${Object.keys(byAddress).length}`
    );
  }
  console.log(
    `indexed runs with no Tally registration: ${missing.join(", ") || "none"}`
  );
}

async function main() {
  const records = JSON.parse(fs.readFileSync(EXPORT, "utf-8")) as Record<
    string,
    CandidateRecord
  >;
  if (process.argv.includes("--verify")) await verify(records);
  else await backfill(records);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
