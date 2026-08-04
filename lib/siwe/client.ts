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

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new SiweApiError(
      res.status,
      body?.error ?? "error",
      body?.message ?? res.statusText
    );
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

  async logout(): Promise<void> {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST" });
  },
};

export { SiweApiError };
