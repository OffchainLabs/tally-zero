// Same-origin SIWE client — all calls go through the /api/governance-indexer
// proxy (which relays cookies + body). Cookies flow automatically for
// same-origin requests, so the session is carried without extra config.
import type {
  ActAsResponse,
  CandidateProfileFields,
  CandidateProfileVersion,
  Draft,
  DraftFields,
  DraftSubmission,
  DraftSummary,
  ElectionSummary,
  KnownSafe,
  MeResponse,
  MyCandidateProfile,
  ProfileFields,
  ProfilePatchResult,
} from "./types";

const BASE = "/api/governance-indexer";

class SiweApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "SiweApiError";
  }
}

// Two error shapes reach this client: the indexer's nested
// `{ error: { code, message } }` (relayed verbatim by the proxy) and the
// proxy's own flat `{ error: string }` (503 unconfigured / 502 upstream). Read
// both so the indexer's precise message (wrong domain/chainId, not-a-delegate,
// rate-limited) actually surfaces instead of a bare HTTP status text.
function extractError(
  body: unknown,
  fallbackMessage: string
): { code: string; message: string } {
  const error = (body as { error?: unknown } | null)?.error;
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return {
      code: typeof code === "string" ? code : "error",
      message: typeof message === "string" ? message : fallbackMessage,
    };
  }
  if (typeof error === "string") return { code: "error", message: error };
  return { code: "error", message: fallbackMessage };
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  // A failing route can answer with Next's HTML error page rather than JSON, so
  // a parse failure must surface as the HTTP status, not a raw SyntaxError.
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    if (res.ok)
      throw new SiweApiError(res.status, "error", "Malformed response.");
  }
  if (!res.ok) {
    const { code, message } = extractError(body, res.statusText);
    throw new SiweApiError(res.status, code, message);
  }
  return body as T;
}

const json = { "content-type": "application/json" };

/**
 * Every call goes through here: one place that knows how to serialize a body,
 * set the content type, and turn a non-2xx into a SiweApiError.
 */
async function send<T>(
  path: string,
  method: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : json,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

// Election ids are `${governorAddress}:${proposalId}`, and draft share slugs are
// opaque — encode both so a colon or stray character can't reshape the path.
const seg = (value: string) => encodeURIComponent(value);

export const siweApi = {
  async nonce(): Promise<string> {
    const body = await send<{ nonce: string }>("/api/auth/nonce", "POST");
    return body.nonce;
  },

  async verify(message: string, signature: string): Promise<void> {
    await send<unknown>("/api/auth/verify", "POST", { message, signature });
  },

  // The first intentional exception to "non-2xx throws": being signed out is a
  // normal state for this call, not an error the caller should have to catch.
  async me(): Promise<MeResponse | null> {
    const res = await fetch(`${BASE}/api/me`);
    if (res.status === 401) return null;
    return parse<MeResponse>(res);
  },

  patchProfile(patch: Partial<ProfileFields>): Promise<ProfilePatchResult> {
    return send<ProfilePatchResult>("/api/me/profile", "PATCH", patch);
  },

  /**
   * Upload an avatar. Unlike the calls above this hits our own route (which
   * authorizes at the indexer, stores the image and commits the profile's
   * `picture`), but it shares the same error handling.
   */
  async uploadAvatar(file: File): Promise<{ url: string }> {
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body });
    return parse<{ url: string }>(res);
  },

  // 401 is the second intentional exception to "non-2xx throws": a server with
  // no session is the state sign-out was asking for, not a failure. Genuine
  // failures (the proxy's 503 unconfigured / 502 upstream, or a timeout) still
  // throw, so the caller can tell "you are signed out" from "we could not ask".
  async logout(): Promise<void> {
    const res = await fetch(`${BASE}/api/auth/logout`, { method: "POST" });
    if (res.status === 401) return;
    await parse<null>(res);
  },

  // GET /api/auth/session and GET /api/me/profile are deliberately not wrapped:
  // /api/me already returns the session envelope *and* the effective subject's
  // resolved profile in one call, so a wrapper for either would be surface with
  // no caller. Add them when something actually needs a thinner payload.

  // --- Acting as a Safe -----------------------------------------------------
  // The subject of every owned read/write is `actingAs ?? address`, so these
  // three calls change what the whole app is about. Callers must drop cached
  // subject-scoped data afterwards, and that is two steps rather than one:
  // invalidate siweKeys.me first (it carries the new subject), then
  // removeQueries(SUBJECT_SCOPE). See lib/siwe/keys.ts for why me is the
  // exception. The act-as hook in the next PR of this stack owns the sequence.

  async safes(): Promise<KnownSafe[]> {
    const body = await send<{ safes: KnownSafe[] }>("/api/auth/safes", "GET");
    return body.safes;
  },

  actAs(safeAddress: string): Promise<ActAsResponse> {
    return send<ActAsResponse>("/api/auth/act-as", "POST", { safeAddress });
  },

  stopActingAs(): Promise<ActAsResponse> {
    return send<ActAsResponse>("/api/auth/act-as", "DELETE");
  },

  // --- Proposal drafts ------------------------------------------------------

  async listDrafts(): Promise<DraftSummary[]> {
    const body = await send<{ drafts: DraftSummary[] }>(
      "/api/me/drafts",
      "GET"
    );
    return body.drafts;
  },

  createDraft(fields: DraftFields): Promise<Draft> {
    return send<Draft>("/api/me/drafts", "POST", fields);
  },

  // 404s for both "no such draft" and "not yours" — deliberately the same.
  getDraft(id: string): Promise<Draft> {
    return send<Draft>(`/api/me/drafts/${seg(id)}`, "GET");
  },

  // 409 not_editable once published; only `status: "draft"` accepts edits.
  patchDraft(id: string, patch: Partial<DraftFields>): Promise<Draft> {
    return send<Draft>(`/api/me/drafts/${seg(id)}`, "PATCH", patch);
  },

  async deleteDraft(id: string): Promise<void> {
    await send<null>(`/api/me/drafts/${seg(id)}`, "DELETE");
  },

  // Irreversible: freezes the draft to its author and mints the share slug.
  publishDraft(id: string): Promise<Draft> {
    return send<Draft>(`/api/me/drafts/${seg(id)}/publish`, "POST");
  },

  // Public — no session needed; the slug itself is the capability.
  getSharedDraft(slug: string): Promise<Draft> {
    return send<Draft>(`/api/drafts/shared/${seg(slug)}`, "GET");
  },

  // Any signed-in user may record the on-chain submission, not just the author.
  markSubmitted(slug: string, onchain: DraftSubmission): Promise<Draft> {
    return send<Draft>(
      `/api/drafts/shared/${seg(slug)}/submitted`,
      "POST",
      onchain
    );
  },

  // --- Elections + candidate profiles ---------------------------------------

  async listElections(): Promise<ElectionSummary[]> {
    const body = await send<{ elections: ElectionSummary[] }>(
      "/api/elections",
      "GET"
    );
    return body.elections;
  },

  getMyCandidateProfile(electionId: string): Promise<MyCandidateProfile> {
    return send<MyCandidateProfile>(
      `/api/me/candidate-profile/${seg(electionId)}`,
      "GET"
    );
  },

  // Appends an immutable version. 409 election_complete once the election ends.
  putCandidateProfile(
    electionId: string,
    fields: CandidateProfileFields
  ): Promise<CandidateProfileVersion> {
    return send<CandidateProfileVersion>(
      `/api/me/candidate-profile/${seg(electionId)}`,
      "PUT",
      fields
    );
  },

  // Public. Returns the bare version, not a wrapper object. For a completed
  // election this is frozen to the last version before closedAt.
  //
  // 404 is the third intentional exception to "non-2xx throws": the indexer
  // 404s a candidate who has never filed a profile, and on a public candidate
  // page that is the ordinary case rather than an error. Without this the
  // `| null` in the return type is unreachable and every caller writing
  // `if (!profile)` gets a rejection on the common path. Everything else throws.
  async getPublicCandidateProfile(
    electionId: string,
    address: string
  ): Promise<CandidateProfileVersion | null> {
    const res = await fetch(
      `${BASE}/api/elections/${seg(electionId)}/candidate-profiles/${seg(address)}`
    );
    if (res.status === 404) return null;
    return parse<CandidateProfileVersion>(res);
  },
};

export { SiweApiError };
