<p align="center">
	<h1 align="center"><b>TallyZero for ArbitrumDAO</b></h1>
<p align="center">
    Decentralized Governance Tracking for ArbitrumDAO
    <br />
    <br />
    <a href="https://github.com/withtally/tally-zero">Upstream</a>
    ·
    <a href="https://github.com/withtally/tally-zero/issues">Issues</a>
  </p>
</p>

# What is this

A fork of [TallyZero](https://github.com/withtally/tally-zero) purpose-built for **ArbitrumDAO** governance. It uses the [`@gzeoneth/gov-tracker`](https://github.com/gzeoneth/gov-tracker) SDK to track the full proposal lifecycle across L1 and L2, from voting through timelock execution and retryable ticket redemption.

## Key Features

- **Dual-governor support** — Core Governor (constitutional) and Treasury Governor (funding)
- **Full lifecycle tracking** — Tracks proposals through all stages: voting → L2 timelock → L1 challenge period → L1 timelock → retryable tickets → final execution
- **Security Council election support** — View and participate in Security Council member elections
- **RPC-direct governance data**. Proposals, delegates, lifecycle state, and Snapshot data are fetched directly from the blockchain or from CORS-enabled APIs. The only server-side code is a small first-party proxy used when importing a proposal description from the governance forum (which lacks CORS).
- **Bundled cache** — Ships with pre-built tracking checkpoints for instant resume without RPC calls
- **Delegate insights** — Pre-indexed delegate cache with voting power rankings

## Tech Stack

- Next.js 16 (App Router)
- TypeScript / React
- Ethers.js v5
- Wagmi v2 + Reown AppKit (wallet connection)
- @arbitrum/sdk (L1↔L2 message tracking)
- @gzeoneth/gov-tracker (proposal lifecycle + delegate indexing)
- TanStack Table + React Query
- Radix UI + Shadcn + Tailwind CSS

## Getting Started

```bash
# Install dependencies
yarn

# Create .env.local with your Reown (WalletConnect) project ID
echo 'NEXT_PUBLIC_REOWN_PROJECT_ID=<your-id>' > .env.local

# Start dev server
yarn dev
```

Get a project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/).

## Commands

```bash
yarn dev        # Development server (port 3000)
yarn build      # Production build
yarn lint       # ESLint with auto-fix
yarn test       # Lint + typecheck + Vitest
```

## Git hooks

Hooks are managed by [husky](https://typicode.github.io/husky/) and install
automatically when you run `pnpm install`.

- **pre-commit** runs `lint-staged` and `pnpm test` (lint, typecheck, Vitest).
- **pre-push** runs an AI branch review through
  [Claude Code](https://docs.claude.com/en/docs/claude-code/setup), using the
  shared skill at `.claude/skills/pre-push-review-branch/SKILL.md`. It compares
  your branch against the merge-base with `main`, reads the PR description when
  one exists, and writes `code-review-<branch>.md` (gitignored) to the repo
  root.

The pre-push review is **advisory**. It prints its verdict and never blocks a
push, and it skips itself silently if the `claude` CLI is not installed, so it
is optional for collaborators who do not use Claude Code.

```bash
pnpm review:branch                # run the review by hand
SKIP_CLAUDE_REVIEW=1 git push     # skip the review for one push
git push --no-verify              # skip every hook
```

Editing `.claude/skills/pre-push-review-branch/SKILL.md` changes the review
criteria for everyone on the next pull. The rest of `.claude/` stays gitignored
and personal.

## License

See upstream [TallyZero](https://github.com/withtally/tally-zero) repository.
