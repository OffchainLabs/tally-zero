import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/Skeleton";

const ElectionContainer = dynamic(
  () =>
    import("@/components/election").then((mod) => ({
      default: mod.ElectionContainer,
    })),
  { ssr: false, loading: () => <ElectionSkeleton /> }
);

export const metadata = {
  title: "Security Council Elections | Arbitrum Governance",
  description:
    "Track Security Council elections on Arbitrum DAO. View election status, nominees, and voting results.",
};

function ElectionSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

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

        <ElectionContainer />
      </div>
    </div>
  );
}
