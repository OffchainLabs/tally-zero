import { Skeleton } from "@/components/ui/Skeleton";

export function ProposalPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-64" />
          </div>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
