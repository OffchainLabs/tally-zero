// Dev keys from the local governance testnode (standard anvil mnemonic; the
// canonical list lives in the indexer's packages/testnode/src/constants.ts).
//
// Specs are allocated distinct keys because the indexer's SIWE tables live in a
// single shared `app` Postgres schema that is NOT namespaced by PONDER_SCHEMA —
// two specs sharing a key would collide on the same owned_profile / draft rows.
export const DEV_WALLETS = {
  /** 601M ARB. Profile + act-as owner. */
  profile: {
    key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  },
  /** 400M ARB. Second Safe owner, and the non-author draft submitter. */
  second: {
    key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  },
  /** 100M ARB. Drafts. */
  drafts: {
    key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  },
  /** 50M ARB. Candidate profiles. */
  candidates: {
    key: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  },
  /**
   * ZERO voting power — holds 1M ARB but has delegated all of it away, so the
   * indexer's delegatedVotesCount is 0. This is the only key that can exercise
   * the avatar gate's 403 not_delegate branch.
   */
  noVotingPower: {
    key: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
    address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
  },
} as const;

export type DevWallet = (typeof DEV_WALLETS)[keyof typeof DEV_WALLETS];
