# Plan: Map delegates.json to delegate list + delegate profile page

## Context

- `data/delegates.json` has 437K entries (203MB) with rich profile data: name, bio, twitter, picture, statement, delegatorsCount, votesCount, isSeekingDelegation
- The delegates table currently uses `DelegateInfo` from gov-tracker cache (address + votingPower only)
- Need to: (a) surface delegates.json data in the table, (b) create a profile page at `/delegates/[address]`

## Key constraint

delegates.json is 203MB, so it **cannot** be imported in client components. All reads must be server-side.

## Plan

### 1. Define a `TallyDelegate` type

File: `types/tally-delegate.ts`

Matches the delegates.json entry shape:

```ts
interface TallyDelegate {
  id: string;
  votesCount: string;
  delegatorsCount: number;
  isPrioritized: boolean;
  account: {
    address: string;
    ens: string;
    name: string;
    bio: string;
    twitter: string;
    picture: string | null;
  };
  statement: {
    statement: string;
    statementSummary: string;
    isSeekingDelegation: boolean;
  };
  labels: string[];
  delegateEligibility: unknown;
}
```

### 2. Server-side data utility

File: `lib/tally-delegate-data.ts`

- `getTallyDelegate(address: string): TallyDelegate | null` - finds a delegate by address
- `getAllTallyAddresses(): string[]` - returns all addresses (for generateStaticParams)
- Reads delegates.json via `require()` at module level (server-only, fine for build time / SSR)

### 3. Build-time name index for client use

File: `scripts/build-delegate-index.ts` (run as part of build)
Output: `data/delegate-index.json` (~49K entries with names, maps address to name + picture only, ~2MB)

This smaller file can be safely imported in client components for table display.

Update `lib/delegate-cache.ts`:

- `getDelegateLabel()` falls back to delegate-index.json name when delegate-labels.json has no entry

### 4. Update table columns to link to profile page

File: `components/table/ColumnsDelegates.tsx`

- Wrap address display in a Next.js `Link` to `/delegates/{address}`
- Show name from enhanced `getDelegateLabel()` (which now checks both sources)

### 5. Create delegate profile page

File: `app/delegates/[address]/page.tsx`

- Server component (like contender page)
- `generateStaticParams()` from gov-tracker cache addresses (delegates with voting power)
- Loads full delegate data from `getTallyDelegate(address)`
- Back link to `/delegates`

### 6. Create DelegateProfile component

File: `components/delegate/DelegateProfile.tsx`

- Client component receiving serialized delegate data as props
- Shows: avatar, name, bio, twitter link, explorer link, statement, delegators count, voting power
- Fallback for addresses not in delegates.json (just explorer link, like ContenderProfile pattern)
- Uses same card/glass styling as the rest of the app

## Files touched

| File                                      | Change                                                |
| ----------------------------------------- | ----------------------------------------------------- |
| `types/tally-delegate.ts`                 | New: type definition                                  |
| `lib/tally-delegate-data.ts`              | New: server-side delegate lookup                      |
| `scripts/build-delegate-index.ts`         | New: build script for client-side name index          |
| `data/delegate-index.json`                | New: generated small lookup (address to name+picture) |
| `lib/delegate-cache.ts`                   | Update: enhance getDelegateLabel with index fallback  |
| `components/table/ColumnsDelegates.tsx`   | Update: link addresses to profile page                |
| `components/delegate/DelegateProfile.tsx` | New: profile display component                        |
| `app/delegates/[address]/page.tsx`        | New: profile route                                    |
