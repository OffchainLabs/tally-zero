"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@lib/utils";

import { Icons } from "@components/Icons";
import { SettingsSheet } from "@components/container/SettingsSheet";
import { buttonVariants } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";

const LoadingSkeleton = ({ compact = false }: { compact?: boolean }) => (
  <div className="inline-flex items-center justify-center transition-colors h-10 px-2 sm:px-4 py-2">
    <Skeleton
      className={cn(
        "h-[38px]",
        compact ? "w-[80px]" : "w-[120px] sm:w-[158px]"
      )}
    />
  </div>
);

export function ButtonNav() {
  const pathname = usePathname();
  const isAppPage = pathname !== "/";
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // AppKit uses Web Components that need to be registered before rendering
    const checkReady = () =>
      customElements.get("appkit-button") &&
      customElements.get("appkit-network-button");

    if (checkReady()) {
      setLoading(false);
      return;
    }

    const poll = setInterval(() => {
      if (checkReady()) {
        clearInterval(poll);
        setLoading(false);
      }
    }, 50);

    const timeout = setTimeout(() => {
      clearInterval(poll);
      setLoading(false);
    }, 2000);

    return () => {
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <nav className="flex-shrink-0">
      {isAppPage ? (
        <div className="flex items-center gap-1.5 sm:gap-2 glass-subtle rounded-xl p-2">
          <SettingsSheet />
          {loading ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <LoadingSkeleton compact />
              <LoadingSkeleton compact />
            </div>
          ) : (
            <>
              <appkit-network-button />
              <appkit-button />
            </>
          )}
        </div>
      ) : (
        <Link
          href="/explore"
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "px-3 sm:px-4 min-h-[44px] transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
          )}
        >
          <Icons.search className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Start exploring</span>
        </Link>
      )}
    </nav>
  );
}
