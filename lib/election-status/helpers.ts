import type {
  ElectionProposalStatus,
  SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";

import { STORAGE_KEYS } from "@/config/storage-keys";
import { debug } from "@/lib/debug";

import type { CachedElectionData, LiveElectionResult } from "./types";
import { PHASE_RANK } from "./types";

// ---------------------------------------------------------------------------
// Phase tracking
// ---------------------------------------------------------------------------

/**
 * Correct an election's phase to VETTING_PERIOD when the nominee vote has
 * succeeded but the member election hasn't started yet.
 *
 * gov-tracker can miss this transition on forks (stale L1 block) or when
 * the member proposal ID is computed deterministically but state() returns
 * "Pending" for a proposal that doesn't exist yet.
 *
 * Returns true if the phase was corrected.
 */
export function correctVettingPeriod(
  election: ElectionProposalStatus
): boolean {
  if (
    election.nomineeProposalState === "Succeeded" &&
    !election.isInVettingPeriod &&
    (!election.memberProposalState ||
      election.memberProposalState === "Pending")
  ) {
    election.phase = "VETTING_PERIOD";
    election.isInVettingPeriod = true;
    return true;
  }
  return false;
}

/**
 * Prevent election phases from going backwards.
 *
 * Stores the furthest phase ever observed per election in localStorage.
 * If incoming data has an earlier phase (e.g. stale cache), clamp it
 * forward to the last known phase. If the phase advanced, persist it.
 */
export function preventPhaseRegression(
  elections: ElectionProposalStatus[]
): ElectionProposalStatus[] {
  const lastKnown = loadLastKnownPhases();
  let dirty = false;

  for (const election of elections) {
    const idx = election.electionIndex;
    const currentRank = PHASE_RANK[election.phase] ?? 0;
    const storedRank = lastKnown[idx] ?? 0;

    if (currentRank < storedRank) {
      const correctPhase = Object.entries(PHASE_RANK).find(
        ([, r]) => r === storedRank
      )?.[0];
      if (correctPhase) {
        debug.cache(
          "Election %d: phase %s behind last known %s, clamping forward",
          idx,
          election.phase,
          correctPhase
        );
        election.phase = correctPhase as ElectionProposalStatus["phase"];
        if (correctPhase === "VETTING_PERIOD") {
          election.isInVettingPeriod = true;
        }
      }
    } else if (currentRank > storedRank) {
      lastKnown[idx] = currentRank;
      dirty = true;
    }
  }

  if (dirty) {
    saveLastKnownPhases(lastKnown);
  }

  return elections;
}

function loadLastKnownPhases(): Record<number, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ELECTION_LAST_KNOWN_PHASE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLastKnownPhases(phases: Record<number, number>): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.ELECTION_LAST_KNOWN_PHASE,
      JSON.stringify(phases)
    );
  } catch {
    // localStorage full or unavailable; non-fatal
  }
}

// ---------------------------------------------------------------------------
// Error detection
// ---------------------------------------------------------------------------

export function isCorsOrNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("cors") ||
    msg.includes("access-control-allow-origin") ||
    msg.includes("blocked by cors")
  );
}

// ---------------------------------------------------------------------------
// Data building helpers
// ---------------------------------------------------------------------------

/**
 * Build nominee details from raw contender/nominee lists when
 * getNomineeElectionDetails fails (e.g. on forks).
 */
export function buildNomineeDetailsFallback(
  proposalId: string,
  electionIndex: number,
  contenders: {
    address: string;
    registeredAtBlock: number;
    registrationTxHash: string;
  }[],
  nominees: {
    address: string;
    votesReceived: { toString(): string };
    isExcluded: boolean;
    nominatedAtBlock?: number;
    excludedAtBlock?: number;
    exclusionTxHash?: string;
  }[],
  targetNomineeCount: number
): SerializableNomineeDetails {
  const serializedNominees = nominees.map((n) => ({
    address: n.address,
    votesReceived: n.votesReceived.toString(),
    isExcluded: n.isExcluded,
    nominatedAtBlock: n.nominatedAtBlock,
    excludedAtBlock: n.excludedAtBlock,
    exclusionTxHash: n.exclusionTxHash,
  }));

  return {
    proposalId,
    electionIndex,
    contenders: contenders.map((c) => ({
      address: c.address,
      registeredAtBlock: c.registeredAtBlock,
      registrationTxHash: c.registrationTxHash,
    })),
    nominees: serializedNominees,
    compliantNominees: serializedNominees.filter((n) => !n.isExcluded),
    excludedNominees: serializedNominees.filter((n) => n.isExcluded),
    quorumThreshold: "0",
    targetNomineeCount,
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Merge live results into the cached elections array.
 * Live results replace stale cached versions by election index.
 */
export function mergeResults(
  cached: CachedElectionData,
  liveResults: (LiveElectionResult | null)[]
): CachedElectionData {
  const elections = [...cached.elections];
  const nomineeDetails = { ...cached.nomineeDetails };
  const memberDetails = { ...cached.memberDetails };

  for (const result of liveResults) {
    if (!result) continue;

    const existingIdx = elections.findIndex(
      (e) => e.electionIndex === result.index
    );
    if (existingIdx !== -1) {
      elections[existingIdx] = result.status;
    } else {
      elections.push(result.status);
    }
    if (result.nominee) nomineeDetails[result.index] = result.nominee;
    if (result.member) memberDetails[result.index] = result.member;
  }

  elections.sort((a, b) => a.electionIndex - b.electionIndex);

  return { elections, nomineeDetails, memberDetails };
}
