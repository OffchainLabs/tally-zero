// Same-origin SIWE client — all calls go through the /api/governance-indexer
// proxy (which relays cookies + body). Cookies flow automatically for
// same-origin requests, so the session is carried without extra config.
import type { MeResponse, ProfileFields, ProfilePatchResult } from "./types";

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

export const siweApi = {
  async nonce(): Promise<string> {
    const res = await fetch(`${BASE}/api/auth/nonce`, { method: "POST" });
    const body = await parse<{ nonce: string }>(res);
    return body.nonce;
  },

  async verify(message: string, signature: string): Promise<void> {
    const res = await fetch(`${BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    await parse<unknown>(res);
  },

  async me(): Promise<MeResponse | null> {
    const res = await fetch(`${BASE}/api/me`);
    if (res.status === 401) return null;
    return parse<MeResponse>(res);
  },

  async patchProfile(
    patch: Partial<ProfileFields>
  ): Promise<ProfilePatchResult> {
    const res = await fetch(`${BASE}/api/me/profile`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    return parse<ProfilePatchResult>(res);
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

  async logout(): Promise<void> {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST" });
  },
};

export { SiweApiError };
