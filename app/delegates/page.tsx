import DelegateSearch from "@/components/container/DelegateSearch";
import { Suspense } from "react";

export const metadata = {
  title: "Delegates | Arbitrum Governance",
  description: "View voting power distribution across Arbitrum DAO delegates",
};

export default function DelegatesPage() {
  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Delegates</h1>
          <p className="text-muted-foreground">
            View voting power distribution across Arbitrum DAO delegates
          </p>
        </div>
        <Suspense fallback={<DelegateSearchSkeleton />}>
          <DelegateSearch />
        </Suspense>
      </div>
    </div>
  );
}

function DelegateSearchSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="floating-card glow-border h-24 animate-pulse"
          />
        ))}
      </div>
      {/* Toolbar skeleton */}
      <div className="glass-subtle backdrop-blur h-12 animate-pulse rounded-xl" />
      {/* Table skeleton */}
      <div className="glass h-96 animate-pulse rounded-2xl" />
    </div>
  );
}
