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
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Security Council Elections
          </h1>
          <p className="text-muted-foreground">
            The Arbitrum Security Council consists of 12 members split into two
            cohorts. Elections occur every 6 months, alternating between
            cohorts.
          </p>
        </div>

        <CurrentCouncilOverview council={council} />

        <ElectionPageClient initialDisplayRecords={initialDisplayRecords} />
      </div>
    </div>
  );
}
