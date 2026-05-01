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
- **RPC-direct governance data**. Proposals, delegates, lifecycle state, and Snapshot data are fetched directly from the blockchain or from CORS-enabled APIs. Server-side code is limited to a forum-import proxy and a thin proxy for the SQLite delegate database (see "Data layer" below).
- **Bundled rank cache** — Ships with a pre-computed gov-tracker delegate rank snapshot for instant lookups without RPC calls
- **Delegate insights** — Delegate profiles, voting power rankings, and election candidates served from a SQLite-over-HTTP database

## Tech Stack

- Next.js 16 (App Router)
- TypeScript / React
- Ethers.js v5
- Wagmi v2 + Reown AppKit (wallet connection)
- @arbitrum/sdk (L1↔L2 message tracking)
- @gzeoneth/gov-tracker (proposal lifecycle + delegate indexing)
- TanStack Table + React Query
- Radix UI + Shadcn + Tailwind CSS
- sql.js-httpvfs (browser SQLite over HTTP range requests)

## Data layer

Tally Zero pulls data from three sources, in increasing freshness:

1. **Bundled gov-tracker cache** (`@gzeoneth/gov-tracker/delegate-cache.json`). Pre-computed delegate ranks and snapshot block. Ships with the JS bundle. Used for instant rank lookups without RPC calls.
2. **SQLite over HTTP** (`/tally-data/tally-zero.sqlite`). A ~200 MB SQLite database hosted on Vercel Blob and queried in the browser via `sql.js-httpvfs`. Only the byte ranges needed for a query are fetched (typically a few hundred KB per page). Used for delegate profiles, election candidates, and address display records.
3. **On-chain RPC**. Live state. Used for current voting power, vote tallies, and transaction submission.

### Build inputs (not shipped to clients)

- `data/delegates-*.json` (~145 MB). Raw delegate dumps from Tally's API. Read by `pnpm sqlite:build`.
- `data/avatar-map.json` (gitignored, ~625 KB). Mirrored delegate avatars. Regenerate with `pnpm avatars:upload`. Read by `pnpm sqlite:build`.
- `data/delegate-index.json`, `data/delegate-labels.json`, `data/election-*-candidates.json`. Additional inputs to the SQLite build.

### Workflows

- `pnpm sqlite:build`. Produces `public/tally-data/tally-zero.sqlite` and `public/tally-data/manifest.json` from the inputs above.
- `pnpm avatars:upload`. Regenerates `data/avatar-map.json` by mirroring delegate avatars to governance blob storage.
- `pnpm sqlite:deploy`. Builds (if needed), uploads the SQLite to Vercel Blob, and updates the production env var. Run this when delegate or election data changes.

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

## License

See upstream [TallyZero](https://github.com/withtally/tally-zero) repository.
