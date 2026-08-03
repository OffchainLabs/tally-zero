import { CurrentCouncilOverview } from "@/components/election/CurrentCouncilOverview";
import { getCachedSecurityCouncilSnapshot } from "@/lib/security-council/server";
import { getCachedElectionAddressDisplayRecords } from "@/lib/tally-data/server";
import ElectionPageClient from "./ElectionPageClient";

export const dynamic = "force-static";
export const revalidate = false;

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
        cohorts. Elections occur every 6 months, alternating between cohorts.
      </p>

      <CurrentCouncilOverview council={council} />

      <ElectionPageClient initialDisplayRecords={initialDisplayRecords} />
    </div>
  );
}
