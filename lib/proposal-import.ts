/**
 * Import proposal descriptions from the Arbitrum governance forum or Snapshot.
 *
 * Runs in the browser. The forum lacks CORS headers, so forum requests go
 * through our first-party Route Handler at /api/forum/topic, which is the
 * only reason this app has any server-side code at all. Snapshot exposes
 * CORS-enabled GraphQL, so those calls stay direct.
 *
 * Snapshot URLs come in two flavours:
 *   - off-chain (classic Snapshot):  snapshot.box/#/s:<ens>/proposal/<0x...>
 *   - on-chain (Snapshot X / Box):  snapshot.box/#/<chain>:<governor>/proposal/<decimalId>
 * We detect which by inspecting the "space" segment and route to the correct
 * GraphQL endpoint.
 */

import { getAddress, isAddress } from "viem";

import { getGovernorType, type GovernorType } from "@/config/governors";

export type ProposalImportSource = "forum" | "snapshot";

export interface ProposalImportResult {
  title: string;
  body: string;
  markdown: string;
  /**
   * Best guess at which Arbitrum governor the imported proposal targets.
   * Derived from (in order): the Snapshot.box on-chain governor address,
   * then keyword matches in the title and body ("non-constitutional" wins
   * over "constitutional" because it is a strict superstring).
   */
  suggestedGovernor?: GovernorType;
}

const FORUM_HOST = "forum.arbitrum.foundation";
const SNAPSHOT_HOSTS = new Set(["snapshot.box", "snapshot.org"]);
const SNAPSHOT_HUB_GRAPHQL = "https://hub.snapshot.org/graphql";
const SNAPSHOT_BOX_GRAPHQL = "https://api.snapshot.box/graphql";

const FORUM_PROXY_ENDPOINT = "/api/forum/topic";

function detectGovernorFromText(text: string): GovernorType | undefined {
  const lower = text.toLowerCase();
  if (
    lower.includes("non-constitutional") ||
    lower.includes("nonconstitutional")
  ) {
    return "treasury";
  }
  if (lower.includes("constitutional")) {
    return "core";
  }
  return undefined;
}

function buildImportResult(
  title: string,
  body: string,
  options?: { governorAddress?: string }
): ProposalImportResult {
  const trimmedBody = body.trim();
  const markdown = trimmedBody
    ? `# ${title}\n\n${trimmedBody}\n`
    : `# ${title}\n`;

  const fromAddress = options?.governorAddress
    ? getGovernorType(options.governorAddress)
    : undefined;
  const suggestedGovernor =
    fromAddress ?? detectGovernorFromText(`${title}\n${trimmedBody}`);

  return {
    title,
    body: trimmedBody,
    markdown,
    suggestedGovernor,
  };
}

function parseUrl(input: string, onBad: string): URL {
  try {
    return new URL(input.trim());
  } catch {
    throw new Error(onBad);
  }
}

export interface ForumTarget {
  topicId: number;
}

export function parseForumUrl(input: string): ForumTarget {
  const url = parseUrl(input, "Enter a valid forum URL.");
  if (url.hostname !== FORUM_HOST) {
    throw new Error(`Expected a ${FORUM_HOST} URL.`);
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "t" || segments.length < 3) {
    throw new Error("Not a recognizable forum topic URL.");
  }
  const topicId = Number(segments[2]);
  if (!Number.isInteger(topicId) || topicId <= 0) {
    throw new Error("Could not read a topic id from that URL.");
  }
  return { topicId };
}

export async function fetchForumDescription(
  input: string
): Promise<ProposalImportResult> {
  const { topicId } = parseForumUrl(input);

  const res = await safeFetch(
    `${FORUM_PROXY_ENDPOINT}?id=${topicId}`,
    "Could not reach the forum."
  );
  // Our handler always responds with JSON. A non-JSON response means the
  // request never reached it (missing deployment, route misconfigured, etc.).
  // Surface that distinctly from a real topic 404.
  const isJson = (res.headers.get("content-type") ?? "").includes(
    "application/json"
  );
  if (!isJson) {
    throw new Error("Forum proxy endpoint is not responding.");
  }
  if (res.status === 404) {
    throw new Error("Forum topic not found.");
  }
  if (!res.ok) {
    throw new Error(`Forum request failed (${res.status}).`);
  }

  let payload: { title?: unknown; body?: unknown };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    throw new Error("Forum response was not valid JSON.");
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) {
    throw new Error("Forum topic has no first-post content.");
  }
  return buildImportResult(title || `Arbitrum Forum Topic ${topicId}`, body);
}

export type SnapshotTarget =
  | { kind: "offchain"; proposalId: string }
  | { kind: "onchain"; governorAddress: string; proposalId: string };

export function parseSnapshotUrl(input: string): SnapshotTarget {
  const url = parseUrl(input, "Enter a valid Snapshot URL.");
  if (!SNAPSHOT_HOSTS.has(url.hostname)) {
    throw new Error("Expected a snapshot.box or snapshot.org URL.");
  }
  // Snapshot is a hash-routed SPA, so the id usually lives in the fragment.
  // Accept the path form too for resilience.
  const candidates = [
    url.hash.startsWith("#") ? url.hash.slice(1) : "",
    url.pathname,
  ];
  for (const candidate of candidates) {
    const parts = candidate.replace(/^\/+/, "").split("/");
    const proposalIdx = parts.indexOf("proposal");
    if (proposalIdx <= 0) continue;

    const spaceSegment = parts[proposalIdx - 1];
    const proposalSegment = parts[proposalIdx + 1]?.split(/[?#]/)[0];
    if (!spaceSegment || !proposalSegment) continue;

    if (spaceSegment.startsWith("s:")) {
      return { kind: "offchain", proposalId: proposalSegment };
    }

    const colonIdx = spaceSegment.indexOf(":");
    if (colonIdx === -1) continue;
    let governorAddress = spaceSegment.slice(colonIdx + 1);
    if (isAddress(governorAddress)) {
      governorAddress = getAddress(governorAddress);
    }
    return {
      kind: "onchain",
      governorAddress,
      proposalId: proposalSegment,
    };
  }
  throw new Error("Could not read a proposal id from that URL.");
}

export async function fetchSnapshotDescription(
  input: string
): Promise<ProposalImportResult> {
  const target = parseSnapshotUrl(input);
  if (target.kind === "offchain") {
    return fetchSnapshotOffchain(target.proposalId);
  }
  return fetchSnapshotOnchain(target.governorAddress, target.proposalId);
}

async function fetchSnapshotOffchain(
  proposalId: string
): Promise<ProposalImportResult> {
  const data = await snapshotGraphql<{
    proposal: { title?: unknown; body?: unknown } | null;
  }>(SNAPSHOT_HUB_GRAPHQL, {
    query: "query Proposal($id: String!) { proposal(id: $id) { title body } }",
    variables: { id: proposalId },
  });
  const proposal = data.proposal;
  if (!proposal) {
    throw new Error("Snapshot proposal not found.");
  }
  return buildSnapshotResult(proposal.title, proposal.body);
}

async function fetchSnapshotOnchain(
  governorAddress: string,
  proposalId: string
): Promise<ProposalImportResult> {
  const compositeId = `${governorAddress}/${proposalId}`;
  const data = await snapshotGraphql<{
    proposal: {
      metadata?: { title?: unknown; body?: unknown } | null;
    } | null;
  }>(SNAPSHOT_BOX_GRAPHQL, {
    query:
      "query Proposal($id: String!) { proposal(id: $id) { metadata { title body } } }",
    variables: { id: compositeId },
  });
  const metadata = data.proposal?.metadata;
  if (!metadata) {
    throw new Error("Snapshot proposal not found.");
  }
  return buildSnapshotResult(metadata.title, metadata.body, {
    governorAddress,
  });
}

async function snapshotGraphql<T>(
  endpoint: string,
  body: { query: string; variables: Record<string, unknown> }
): Promise<T> {
  const res = await safeFetch(endpoint, "Could not reach Snapshot.", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Snapshot request failed (${res.status}).`);
  }
  let payload: {
    data?: T;
    errors?: Array<{ message?: string; extensions?: { code?: string } }>;
  };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    throw new Error("Snapshot response was not valid JSON.");
  }
  if (payload.errors && payload.errors.length > 0) {
    const first = payload.errors[0];
    if (first?.message?.startsWith("Row not found")) {
      throw new Error("Snapshot proposal not found.");
    }
    throw new Error(first?.message ?? "Snapshot returned an error.");
  }
  if (!payload.data) {
    throw new Error("Snapshot returned no data.");
  }
  return payload.data;
}

function buildSnapshotResult(
  rawTitle: unknown,
  rawBody: unknown,
  options?: { governorAddress?: string }
): ProposalImportResult {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!title && !body) {
    throw new Error("Snapshot proposal has no content.");
  }
  return buildImportResult(title || "Snapshot Proposal", body, options);
}

export async function importProposalDescription(
  source: ProposalImportSource,
  url: string
): Promise<ProposalImportResult> {
  if (source === "forum") return fetchForumDescription(url);
  return fetchSnapshotDescription(url);
}

/**
 * Identify which import source a pasted URL targets, based on hostname alone.
 * Returns null if the string isn't a parseable URL or the hostname doesn't
 * match either known source.
 */
export function detectSourceFromUrl(
  input: string
): ProposalImportSource | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.hostname === FORUM_HOST) return "forum";
  if (SNAPSHOT_HOSTS.has(url.hostname)) return "snapshot";
  return null;
}

async function safeFetch(
  url: string,
  networkErrorMessage: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(networkErrorMessage);
  }
}
