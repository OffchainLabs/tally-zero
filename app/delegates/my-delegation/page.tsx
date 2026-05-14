import { Suspense } from "react";

import { MyDelegationPanel } from "@/components/container/MyDelegationPanel";

export const metadata = {
  title: "My Delegation | Arbitrum Governance",
  description:
    "View and change your ARB voting power delegation on ArbitrumDAO.",
};

export default function MyDelegationPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">My Delegation</h1>
        <p className="text-muted-foreground">
          Manage who casts your ARB voting power.
        </p>
      </div>
      <Suspense fallback={<MyDelegationSkeleton />}>
        <MyDelegationPanel />
      </Suspense>
    </div>
  );
}

function MyDelegationSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="glass-subtle backdrop-blur h-48 animate-pulse rounded-2xl" />
      <div className="glass-subtle backdrop-blur h-48 animate-pulse rounded-2xl" />
      <div className="glass-subtle backdrop-blur h-56 animate-pulse rounded-2xl md:col-span-2" />
    </div>
  );
}
