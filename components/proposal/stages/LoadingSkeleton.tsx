"use client";

import { memo } from "react";

export const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="relative w-7 h-7 rounded-full glass-subtle backdrop-blur overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="relative h-4 w-32 glass-subtle backdrop-blur rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
            </div>
            <div className="relative h-3 w-48 glass-subtle backdrop-blur rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
