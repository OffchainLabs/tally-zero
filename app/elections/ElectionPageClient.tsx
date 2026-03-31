"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/Skeleton";

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

export default function ElectionPageClient() {
  return <ElectionContainer />;
}
