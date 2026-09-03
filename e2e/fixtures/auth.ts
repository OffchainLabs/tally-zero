import { resolve } from "node:path";

import { DEV_WALLETS } from "./wallets";

/**
 * Wallets that get a pre-authenticated browser state in the `setup` project.
 *
 * Signing in costs a nonce, and POST /api/auth/nonce is rate-limited to 10 per
 * minute per IP — with every test sharing one IP. Signing in per *test* made a
 * six-test suite fail on back-to-back runs (measured: 7x 201, then sustained
 * 429) while every test passed in isolation. Signing in once per *wallet* keeps
 * nonce spend flat as the suite grows: this map is the budget, so adding an
 * entry costs one nonce per run and adding a test costs none.
 *
 * DEV_WALLETS.signOut is deliberately absent. A session that gets signed out is
 * spent, so pre-authenticating that wallet would put it through the handshake on
 * every run and quietly undo the reuse this map exists for.
 */
export const AUTH_WALLETS = {
  profile: DEV_WALLETS.profile,
  second: DEV_WALLETS.second,
  drafts: DEV_WALLETS.drafts,
  candidates: DEV_WALLETS.candidates,
  noVotingPower: DEV_WALLETS.noVotingPower,
} as const;

export type AuthWalletName = keyof typeof AUTH_WALLETS;

/** Storage-state path for a pre-authenticated wallet. Gitignored. */
export function authFile(name: AuthWalletName): string {
  return resolve(__dirname, "..", ".auth", `${name}.json`);
}
