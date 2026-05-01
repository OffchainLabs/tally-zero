"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { Skeleton } from "@/components/ui/Skeleton";
import {
  primeAddressDisplayRecordCache,
  type TallyAddressDisplayRecord,
} from "@/lib/tally-data/client";

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

const ElectionContainer = dynamic(
  () =>
    import("@/components/election").then((mod) => ({
      default: mod.ElectionContainer,
    })),
  { ssr: false, loading: () => <ElectionSkeleton /> }
);

interface ElectionPageClientProps {
  initialDisplayRecords: TallyAddressDisplayRecord[];
}

export default function ElectionPageClient({
  initialDisplayRecords,
}: ElectionPageClientProps) {
  useMemo(() => {
    primeAddressDisplayRecordCache(initialDisplayRecords);
  }, [initialDisplayRecords]);

  return <ElectionContainer />;
}
