# Plan: `use-election-status.ts` cleanup and refactoring

## Overview

The hook is 890 lines with a 280-line monolith (`fetchDefault`), duplicated correction logic, and unclear naming. This plan breaks it into focused, testable pieces.

## 1. Rename "high water mark" to "last known phase"

The concept is: "remember the furthest phase we've ever seen for each election, and never go backwards." The name "high water mark" (HWM) is not intuitive.

**Rename to:** `lastKnownPhase` / `LastKnownPhaseMap`

- `PHASE_RANK` stays (it's descriptive)
- `loadPhaseHwm` -> `loadLastKnownPhases`
- `savePhaseHwm` -> `saveLastKnownPhases`
- `enforcePhaseMonotonicity` -> `preventPhaseRegression`
- `ELECTION_PHASE_HWM` storage key -> `ELECTION_LAST_KNOWN_PHASE`
- All variable names: `hwm` -> `lastKnown`, comments updated

## 2. Extract `correctVettingPeriod` helper

The same 6-line vetting period correction appears **3 times** (fetchWithOverrides line 342, cached data line 462, live data line 527). Extract to:

```ts
/** Correct phase to VETTING_PERIOD when nominee voting succeeded but member election hasn't started. */
function correctVettingPeriod(election: ElectionProposalStatus): boolean;
```

Returns `true` if corrected, for logging. Apply it everywhere with a one-liner.

## 3. Split `fetchDefault` into smaller functions

`fetchDefault` (lines 420-706) does too many things in one scope. Split into:

### a. `loadCachedElections(tracker)`

- Load checkpoints, filter NOT_STARTED, extract nominee/member details
- Apply vetting correction
- Return `{ elections, nomineeDetails, memberDetails }`

### b. `fetchLiveElection(index, l2Provider, cachedPhase, cachedNominee, cachedMember)`

- Fetch single election status from RPC
- Apply vetting correction
- Resolve nominee details (cached vs fresh vs fallback)
- Enrich contender votes
- Resolve member details (cached vs fresh)
- Return `{ status, nominee, member }` or `null`

This replaces the 100-line `uncachedIndices.map(async (i) => { ... })` closure.

### c. `fetchOverallStatus(l2Provider, l1Provider)`

- Run `checkElectionStatus` with the fork-fallback synthesis logic
- Call `setStatus`

This replaces the `checkElectionStatus(...).then(...).catch(...)` block (lines 654-682).

### d. `mergeResults(cachedElections, liveResults, cachedNominee, cachedMember)`

- Merge live results into cached array
- Sort
- Return merged elections and details maps

The refactored `fetchDefault` becomes a coordinator:

```ts
const fetchDefault = useCallback(async () => {
  const { tracker, l2Provider, l1Provider } = await getTracker();

  // 1. Show cached data instantly on first load
  const cached = await loadCachedElections(tracker);
  if (cached.elections.length > 0 && !initialLoadDoneRef.current) {
    setAllElections(preventPhaseRegression(cached.elections));
    // ... set details maps
    initialLoadDoneRef.current = true;
  }

  // 2. Fetch live data for non-completed elections
  const electionCount = await getElectionCount(l2Provider);
  const completedIndices = new Set(cached.elections.filter(...).map(...));
  const indicesToFetch = range(electionCount).filter(i => !completedIndices.has(i));

  const [liveResults] = await Promise.all([
    Promise.all(indicesToFetch.map(i =>
      fetchLiveElection(i, l2Provider, cached.phaseByIndex.get(i), ...)
    )),
    fetchOverallStatus(l2Provider, l1Provider),
  ]);

  // 3. Merge and render
  const merged = mergeResults(cached, liveResults);
  setAllElections(preventPhaseRegression(merged.elections));
  // ... set details maps
}, [...]);
```

## 4. Simplify the nominee details fallback

Lines 564-608 manually construct a `SerializableNomineeDetails` object when `getNomineeElectionDetails` fails. This is fragile and couples us to the shape of that type. Extract to:

```ts
function buildNomineeDetailsFallback(
  proposalId: string,
  electionIndex: number,
  contenders: Contender[],
  nominees: NomineeWithVotes[],
  targetNomineeCount: number
): SerializableNomineeDetails;
```

## 5. File structure after refactoring

Group the file top-to-bottom:

```
1. Imports
2. Types (NomineeElectionDetails, MemberElectionDetails)
3. Constants (PHASE_RANK)
4. Pure helpers (correctVettingPeriod, preventPhaseRegression, isCorsOrNetworkError)
5. Async helpers (enrichContenderVotes, buildNomineeDetailsFallback)
6. Data fetching functions (loadCachedElections, fetchLiveElection, fetchOverallStatus, mergeResults)
7. Interfaces (UseElectionStatusOptions, UseElectionStatusResult)
8. The hook (useElectionStatus)
```

## Non-goals

- Not changing external behavior or the hook's public API
- Not moving code to separate files (the helpers are tightly coupled to this hook's data flow, splitting across files would just scatter related logic)
- Not touching components that consume this hook
