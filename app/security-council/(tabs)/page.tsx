import Link from "next/link";

import { CurrentCouncilOverview } from "@/components/election/CurrentCouncilOverview";
import { KeyRotationInfo } from "@/components/security-council/KeyRotationInfo";
import { ELECTION_IMPROVEMENTS_PROPOSAL_ID } from "@/config/security-council";
import { describeElectionCadence } from "@/lib/security-council/helpers";
import { getCachedSecurityCouncilSnapshot } from "@/lib/security-council/server";
import { getCachedElectionAddressDisplayRecords } from "@/lib/tally-data/server";
import ElectionPageClient from "./ElectionPageClient";

export const dynamic = "force-static";

/**
 * Refresh hourly: the council roster, term ends and election cadence are all
 * read from chain and change without a redeploy.
 */
export const revalidate = 3600;

export const metadata = {
  title: "Security Council Elections | Arbitrum Governance",
  description:
    "Track Security Council elections on ArbitrumDAO. View election status, nominees, and voting results.",
};

export default async function ElectionsPage() {
  const [initialDisplayRecords, council] = await Promise.all([
    getCachedElectionAddressDisplayRecords(),
    getCachedSecurityCouncilSnapshot(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        The Arbitrum Security Council consists of 12 members split into two
        cohorts. {describeElectionCadence(council.electionCadenceMonths)}{" "}
        Elections through March 2026 ran every 6 months on one-year terms;{" "}
        <Link
          href={`/proposal/${ELECTION_IMPROVEMENTS_PROPOSAL_ID}`}
          className="text-foreground underline underline-offset-2 transition-colors hover:text-primary"
        >
          Security Council Election Process Improvements
        </Link>
        , executed by the DAO, moved them to a yearly cadence each March,
        lowered the nominee qualification threshold, and let members and
        candidates rotate their own signing keys.
      </p>

      <CurrentCouncilOverview council={council} />

      <KeyRotationInfo />

      <ElectionPageClient initialDisplayRecords={initialDisplayRecords} />
    </div>
  );
}
