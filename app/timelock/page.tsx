import { TimelockOpsContainer } from "@/components/timelock";
import { Skeleton } from "@/components/ui/Skeleton";
import { Suspense } from "react";

export const metadata = {
  title: "Timelock Operations | Arbitrum Governance",
  description:
    "Track timelock operations on ArbitrumDAO that are not part of regular proposals. View Security Council operations and direct timelock executions.",
};

function TimelockSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export default function TimelockPage() {
  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Timelock Operations
          </h1>
          <p className="text-muted-foreground">
            Track timelock operations that are not part of regular governance
            proposals. This includes Security Council operations and direct
            timelock executions.
          </p>
        </div>

        <Suspense fallback={<TimelockSkeleton />}>
          <TimelockOpsContainer />
        </Suspense>
      </div>
    </div>
  );
}
