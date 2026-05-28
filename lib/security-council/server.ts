import "server-only";

import {
  ADDRESSES,
  ELECTION_TIMING,
  NOMINEE_ELECTION_GOVERNOR_ABI,
  SECURITY_COUNCIL_MANAGER_ABI,
} from "@gzeoneth/gov-tracker";
import { unstable_cache } from "next/cache";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { arbitrum } from "viem/chains";

import { ARBITRUM_RPC_URL } from "@/config/arbitrum-governance";
import { TARGET_COHORT_SIZE } from "@/config/security-council";
import { SECONDS_PER_DAY } from "@/lib/date-utils";
import { debug } from "@/lib/debug";
import { getCachedElectionAddressDisplayRecords } from "@/lib/tally-data/server";

class SecurityCouncilSnapshotError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SecurityCouncilSnapshotError";
  }
}

export interface CouncilMember {
  address: string;
  label: string | null;
  title: string | null;
  profileUrl: string | null;
}

export interface SecurityCouncilSnapshot {
  firstCohort: CouncilMember[];
  secondCohort: CouncilMember[];
  firstCohortTermEnd: number | null;
  secondCohortTermEnd: number | null;
}

const scManagerAbi = parseAbi(SECURITY_COUNCIL_MANAGER_ABI);
const nomineeGovernorAbi = parseAbi(NOMINEE_ELECTION_GOVERNOR_ABI);

async function fetchSecurityCouncilSnapshot(): Promise<SecurityCouncilSnapshot> {
  try {
    const client = createPublicClient({
      chain: arbitrum,
      transport: http(ARBITRUM_RPC_URL, { retryCount: 2, retryDelay: 1000 }),
    });

    const scManagerAddress = ADDRESSES.SECURITY_COUNCIL_MANAGER as Address;
    const nomineeGovernorAddress =
      ADDRESSES.ELECTION_NOMINEE_GOVERNOR as Address;

    const [firstCohortRaw, secondCohortRaw, electionCountRaw] =
      await Promise.all([
        client.readContract({
          address: scManagerAddress,
          abi: scManagerAbi,
          functionName: "getFirstCohort",
        }),
        client.readContract({
          address: scManagerAddress,
          abi: scManagerAbi,
          functionName: "getSecondCohort",
        }),
        client.readContract({
          address: nomineeGovernorAddress,
          abi: nomineeGovernorAbi,
          functionName: "electionCount",
        }),
      ]);

    const firstAddresses = [...(firstCohortRaw as readonly Address[])];
    const secondAddresses = [...(secondCohortRaw as readonly Address[])];
    const electionCount = Number(electionCountRaw as bigint);

    if (firstAddresses.length !== TARGET_COHORT_SIZE) {
      debug.app(
        "Security Council: first cohort returned %d members (expected %d)",
        firstAddresses.length,
        TARGET_COHORT_SIZE
      );
    }
    if (secondAddresses.length !== TARGET_COHORT_SIZE) {
      debug.app(
        "Security Council: second cohort returned %d members (expected %d)",
        secondAddresses.length,
        TARGET_COHORT_SIZE
      );
    }

    const firstNextElection =
      electionCount % 2 === 0 ? electionCount : electionCount + 1;
    const secondNextElection =
      electionCount % 2 === 1 ? electionCount : electionCount + 1;

    // Term ends when the post-election upgrade is fully executed and the new
    // cohort is installed: voting period + L2 constitutional timelock (8d) +
    // L2->L1 challenge period (~6.4d) + L1 timelock (3d).
    const L2_CONSTITUTIONAL_TIMELOCK_SECONDS = 8 * SECONDS_PER_DAY;
    const L2_TO_L1_CHALLENGE_PERIOD_SECONDS = 45818 * 12;
    const L1_TIMELOCK_SECONDS = 3 * SECONDS_PER_DAY;
    const electionWindowSeconds =
      ELECTION_TIMING.TOTAL_ELECTION_DAYS * SECONDS_PER_DAY +
      L2_CONSTITUTIONAL_TIMELOCK_SECONDS +
      L2_TO_L1_CHALLENGE_PERIOD_SECONDS +
      L1_TIMELOCK_SECONDS;

    const readNextStart = (electionIndex: number): Promise<number | null> =>
      client
        .readContract({
          address: nomineeGovernorAddress,
          abi: nomineeGovernorAbi,
          functionName: "electionToTimestamp",
          args: [BigInt(electionIndex)],
        })
        .then((v) => Number(v as bigint))
        .catch(() => null);

    const [firstNextTs, secondNextTs, displayRecords] = await Promise.all([
      readNextStart(firstNextElection),
      readNextStart(secondNextElection),
      getCachedElectionAddressDisplayRecords(),
    ]);

    const displayMap = new Map(
      displayRecords.map((record) => [record.address.toLowerCase(), record])
    );

    const enrich = (address: string): CouncilMember => {
      const record = displayMap.get(address.toLowerCase());
      return {
        address,
        label: record?.label ?? null,
        title: record?.title ?? null,
        profileUrl: record?.profileUrl ?? null,
      };
    };

    return {
      firstCohort: firstAddresses.map(enrich),
      secondCohort: secondAddresses.map(enrich),
      firstCohortTermEnd:
        firstNextTs !== null ? firstNextTs + electionWindowSeconds : null,
      secondCohortTermEnd:
        secondNextTs !== null ? secondNextTs + electionWindowSeconds : null,
    };
  } catch (err) {
    debug.app("Failed to fetch Security Council snapshot: %O", err);
    const detail = err instanceof Error ? err.message : String(err);
    throw new SecurityCouncilSnapshotError(
      `Failed to fetch Security Council snapshot from ${ARBITRUM_RPC_URL}: ${detail}`,
      { cause: err }
    );
  }
}

export const getCachedSecurityCouncilSnapshot = unstable_cache(
  fetchSecurityCouncilSnapshot,
  ["tally-zero-security-council-snapshot-v2"],
  { revalidate: false }
);
