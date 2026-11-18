/**
 * Stamp each record in data/election-candidates.json with the election it was
 * registered for.
 *
 * The Tally export keeps one record per address: the candidate's latest
 * registration. Contender pages are per election, so each record has to say
 * which election it describes, or a 2026 profile would be shown on the page of
 * a 2024 run. The election comes from `registered_at`; the indexer's contender
 * list for that election confirms it.
 *
 * Usage: GOVERNANCE_INDEXER_URL=https://… tsx scripts/assign-candidate-elections.ts
 */
import * as fs from "fs";
import * as path from "path";

import { electionIndexForRegistration } from "../lib/election-profile";

const DATA = path.join(__dirname, "..", "data", "election-candidates.json");
const INDEXER = process.env.GOVERNANCE_INDEXER_URL;

type Election = {
  id: string;
  createdAtTimestamp: string;
  candidates: { items: { candidateAddress: string; isContender: boolean }[] };
};

async function main() {
  if (!INDEXER) throw new Error("GOVERNANCE_INDEXER_URL is required");
  const response = await fetch(`${INDEXER}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `{ elections(limit: 100, orderBy: "createdAtTimestamp", orderDirection: "asc") {
        items { id createdAtTimestamp candidates(limit: 1000) { items { candidateAddress isContender } } }
      } }`,
    }),
  });
  const body = (await response.json()) as {
    data?: { elections: { items: Election[] } };
    errors?: unknown;
  };
  if (!body.data) throw new Error(`indexer: ${JSON.stringify(body.errors)}`);

  // The indexer holds every election since the governor was deployed, so
  // creation order is the governor's own election number.
  const elections = body.data.elections.items.map((election, index) => ({
    electionIndex: index,
    startedAt: new Date(
      Number(election.createdAtTimestamp) * 1000
    ).toISOString(),
    contenders: new Set(
      election.candidates.items
        .filter((candidate) => candidate.isContender)
        .map((candidate) => candidate.candidateAddress.toLowerCase())
    ),
  }));

  const records = JSON.parse(fs.readFileSync(DATA, "utf-8")) as Record<
    string,
    { registered_at?: string | null; electionIndex?: number | null }
  >;
  const unplaced: string[] = [];
  const unconfirmed: string[] = [];
  for (const [address, record] of Object.entries(records)) {
    const electionIndex = electionIndexForRegistration(
      record.registered_at ?? null,
      elections
    );
    record.electionIndex = electionIndex;
    if (electionIndex === null) {
      unplaced.push(address);
    } else if (
      !elections[electionIndex].contenders.has(address.toLowerCase())
    ) {
      unconfirmed.push(`${address} (election #${electionIndex})`);
    }
  }
  fs.writeFileSync(DATA, `${JSON.stringify(records, null, 2)}\n`);

  const counts = new Map<number | null, number>();
  for (const record of Object.values(records)) {
    const key = record.electionIndex ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log(`records: ${Object.keys(records).length}`);
  for (const [index, count] of [...counts].sort()) {
    console.log(`  election ${index ?? "unplaced"}: ${count}`);
  }
  console.log(`unplaced (no registered_at): ${unplaced.join(", ") || "none"}`);
  console.log(
    `placed but not an indexed contender there: ${unconfirmed.join(", ") || "none"}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
