import { Skeleton } from "@components/ui/Skeleton";

export default function SearchSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="glass rounded-2xl p-8 w-full max-w-lg space-y-6">
        {/* Icon placeholder */}
        <div className="flex items-center justify-center">
          <div className="relative">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 blur-sm animate-pulse" />
          </div>
        </div>

        {/* Progress bar placeholder */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-full rounded-full" />
          <div className="flex justify-center">
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
    </div>
  );
}
