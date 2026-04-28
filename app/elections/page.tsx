import ElectionPageClient from "./ElectionPageClient";

export const metadata = {
  title: "Security Council Elections | Arbitrum Governance",
  description:
    "Track Security Council elections on ArbitrumDAO. View election status, nominees, and voting results.",
};

export default function ElectionsPage() {
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

        <ElectionPageClient />
      </div>
    </div>
  );
}
