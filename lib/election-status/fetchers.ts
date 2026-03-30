import {
  checkElectionStatus,
  createTracker,
  getContenders,
  getElectionCount,
  getElectionStatus,
  getMemberElectionDetails,
  getNomineeElectionDetails,
  getNomineesWithVotes,
  nomineeElectionGovernorReadAbi,
  serializeMemberDetails,
  serializeNomineeDetails,
  type ElectionProposalStatus,
  type ElectionStatus,
  type SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";
import { Contract } from "ethers";

import { debug } from "@/lib/debug";

import { buildNomineeDetailsFallback, correctVettingPeriod } from "./helpers";
import type {
  CachedElectionData,
  L2Provider,
  LiveElectionResult,
  MemberElectionDetails,
  NomineeElectionDetails,
} from "./types";
import { DEFAULT_NOMINEE_GOVERNOR } from "./types";

// ---------------------------------------------------------------------------
// Contender vote enrichment
// ---------------------------------------------------------------------------

/**
 * Fetch votesReceived for each contender from the nominee governor contract.
 * Merges results into the nominees array so the UI can display per-contender vote progress.
 */
export async function enrichContenderVotes(
  details: SerializableNomineeDetails,
  provider: L2Provider,
  governorAddress?: string
): Promise<SerializableNomineeDetails> {
  const contract = new Contract(
    governorAddress ?? DEFAULT_NOMINEE_GOVERNOR,
    nomineeElectionGovernorReadAbi,
    provider
  );

  const existingAddresses = new Set(
    details.nominees.map((n) => n.address.toLowerCase())
  );

  const missing = details.contenders.filter(
    (c) => !existingAddresses.has(c.address.toLowerCase())
  );

  if (missing.length === 0) return details;

  const votes = await Promise.all(
    missing.map(async (c) => {
      try {
        const v = await contract.votesReceived(details.proposalId, c.address);
        return { address: c.address, votesReceived: v.toString() as string };
      } catch {
        return { address: c.address, votesReceived: "0" };
      }
    })
  );

  return {
    ...details,
    nominees: [
      ...details.nominees,
      ...votes.map((v) => ({
        address: v.address,
        votesReceived: v.votesReceived,
        isExcluded: false,
      })),
    ],
  };
}

// ---------------------------------------------------------------------------
// Cache loading
// ---------------------------------------------------------------------------

/**
 * Load elections from the gov-tracker checkpoint cache (no RPC needed).
 * Applies vetting period correction to each loaded election.
 */
export async function loadCachedElections(
  tracker: ReturnType<typeof createTracker>
): Promise<CachedElectionData> {
  const MAX_ELECTIONS = 10;
  const elections: ElectionProposalStatus[] = [];
  const nomineeDetails: Record<number, NomineeElectionDetails> = {};
  const memberDetails: Record<number, MemberElectionDetails> = {};

  const checkpointResults = await Promise.all(
    Array.from({ length: MAX_ELECTIONS }, (_, i) =>
      tracker
        .getElectionCheckpoint(i)
        .then((checkpoint) => ({ index: i, checkpoint }))
    )
  );

  for (const { index: i, checkpoint } of checkpointResults) {
    if (checkpoint && checkpoint.status.phase !== "NOT_STARTED") {
      debug.cache(
        "Election %d loaded from cache: %s",
        i,
        checkpoint.status.phase
      );
      elections.push(checkpoint.status);
      if (checkpoint.nomineeDetails) {
        nomineeDetails[i] = checkpoint.nomineeDetails;
      }
      if (checkpoint.memberDetails) {
        memberDetails[i] = checkpoint.memberDetails;
      }
    }
  }

  for (const election of elections) {
    if (correctVettingPeriod(election)) {
      debug.cache(
        "Election %d: corrected cached phase to VETTING_PERIOD",
        election.electionIndex
      );
    }
  }

  return { elections, nomineeDetails, memberDetails };
}

// ---------------------------------------------------------------------------
// Live election fetching
// ---------------------------------------------------------------------------

/**
 * Fetch a single election's live status and details from RPC.
 *
 * Decides whether to reuse cached nominee/member details based on which
 * phases have immutable data vs. data that still changes (vote counts).
 */
export async function fetchLiveElection(
  index: number,
  l2Provider: L2Provider,
  cachedPhase: string | undefined,
  cachedNominee: NomineeElectionDetails,
  cachedMember: MemberElectionDetails
): Promise<LiveElectionResult | null> {
  try {
    const liveStatus = await getElectionStatus(l2Provider, index);

    if (correctVettingPeriod(liveStatus)) {
      debug.app(
        "Election %d: corrected phase to VETTING_PERIOD (nominee Succeeded, member state=%s)",
        index,
        liveStatus.memberProposalState ?? "null"
      );
    }

    debug.app("Election %d fetched live: %s", index, liveStatus.phase);

    const nominee = await resolveNomineeDetails(
      index,
      l2Provider,
      liveStatus,
      cachedPhase,
      cachedNominee
    );

    const member = await resolveMemberDetails(
      index,
      l2Provider,
      cachedPhase,
      cachedMember
    );

    return { index, status: liveStatus, nominee, member };
  } catch (err) {
    debug.app("Election %d live fetch failed: %O", index, err);
    return null;
  }
}

/**
 * Resolve nominee details for an election, choosing between cached data,
 * fresh RPC fetch, or a manual fallback from contender/nominee lists.
 */
async function resolveNomineeDetails(
  index: number,
  l2Provider: L2Provider,
  liveStatus: ElectionProposalStatus,
  cachedPhase: string | undefined,
  cachedNominee: NomineeElectionDetails
): Promise<NomineeElectionDetails> {
  const contendersImmutable =
    cachedPhase === "VETTING_PERIOD" ||
    cachedPhase === "MEMBER_ELECTION" ||
    cachedPhase === "PENDING_EXECUTION";

  let nd: NomineeElectionDetails = null;

  if (cachedNominee && contendersImmutable) {
    nd = cachedNominee;
    debug.app(
      "Election %d: reusing cached nominee details (%s), refreshing votes",
      index,
      cachedPhase
    );
  } else {
    const raw = await getNomineeElectionDetails(index, l2Provider).catch(
      () => null
    );
    if (raw) {
      nd = serializeNomineeDetails(raw);
    } else if (liveStatus.nomineeProposalId) {
      nd = await fetchNomineeDetailsFallback(
        index,
        l2Provider,
        liveStatus.nomineeProposalId,
        liveStatus.targetNomineeCount
      );
    }
  }

  if (nd && nd.contenders.length > 0) {
    try {
      nd = await enrichContenderVotes(nd, l2Provider);
    } catch (err) {
      debug.app(
        "Failed to enrich contender votes for election %d: %O",
        index,
        err
      );
    }
  }

  return nd;
}

/**
 * Fallback: build nominee details from raw contender/nominee lists
 * when getNomineeElectionDetails is unavailable.
 */
async function fetchNomineeDetailsFallback(
  index: number,
  l2Provider: L2Provider,
  proposalId: string,
  targetNomineeCount: number
): Promise<NomineeElectionDetails> {
  const [contenders, nominees] = await Promise.all([
    getContenders(proposalId, l2Provider).catch(() => []),
    getNomineesWithVotes(proposalId, l2Provider).catch(() => []),
  ]);

  if (contenders.length === 0 && nominees.length === 0) return null;

  return buildNomineeDetailsFallback(
    proposalId,
    index,
    contenders,
    nominees,
    targetNomineeCount
  );
}

/**
 * Resolve member details, reusing cached data when vote counts are frozen.
 */
async function resolveMemberDetails(
  index: number,
  l2Provider: L2Provider,
  cachedPhase: string | undefined,
  cachedMember: MemberElectionDetails
): Promise<MemberElectionDetails> {
  if (cachedMember && cachedPhase === "PENDING_EXECUTION") {
    debug.app(
      "Election %d: reusing cached member details (%s)",
      index,
      cachedPhase
    );
    return cachedMember;
  }

  try {
    const raw = await getMemberElectionDetails(index, l2Provider);
    return raw ? serializeMemberDetails(raw) : null;
  } catch (err) {
    debug.app("Member details failed for election %d: %O", index, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Overall status
// ---------------------------------------------------------------------------

/**
 * Fetch overall election status (count, cohort, timing).
 * On forks, L1 block lookup often fails; synthesize a minimal status
 * from the election count so the UI doesn't show an error.
 */
export async function fetchOverallStatus(
  l2Provider: L2Provider,
  l1Provider: L2Provider,
  setStatus: (s: ElectionStatus) => void
): Promise<void> {
  try {
    const electionStatus = await checkElectionStatus(l2Provider, l1Provider);
    setStatus(electionStatus);
    debug.app(
      "Election status: count=%d, canCreate=%s",
      electionStatus.electionCount,
      electionStatus.canCreateElection
    );
  } catch (err) {
    debug.app("checkElectionStatus failed (non-fatal): %O", err);
    try {
      const count = await getElectionCount(l2Provider);
      setStatus({
        electionCount: count,
        cohort: (count % 2) as 0 | 1,
        nextElectionTimestamp: 0,
        currentL1Timestamp: 0,
        canCreateElection: false,
        secondsUntilElection: 0,
        timeUntilElection: "Unknown",
      });
      debug.app("Synthesized partial election status (count=%d)", count);
    } catch {
      debug.app("Failed to synthesize election status");
    }
  }
}
