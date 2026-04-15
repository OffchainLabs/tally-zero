"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { DeepLinkHandler } from "@/components/container/DeepLinkHandler";
import RpcStatus from "@/components/container/RpcStatus";
import { columns } from "@/components/table/ColumnsProposals";
import { DataTable } from "@/components/table/DataTable";
import { Progress } from "@/components/ui/Progress";

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMultiGovernorSearch } from "@/hooks/use-multi-governor-search";
import { useRpcHealthOrchestration } from "@/hooks/use-rpc-health-orchestration";
import { useRpcSettings } from "@/hooks/use-rpc-settings";

export default function Search() {
  const searchParams = useSearchParams();

  const [storedDays] = useLocalStorage<number>(
    STORAGE_KEYS.DAYS_TO_SEARCH,
    DEFAULT_FORM_VALUES.daysToSearch
  );
  const [storedBlockRange] = useLocalStorage<number>(
    STORAGE_KEYS.BLOCK_RANGE,
    DEFAULT_FORM_VALUES.blockRange
  );

  const { l1Rpc, l2Rpc, isHydrated: rpcSettingsHydrated } = useRpcSettings();

  const daysToSearch =
    parseInt(searchParams.get("days") || "") ||
    storedDays ||
    DEFAULT_FORM_VALUES.daysToSearch;
  const rpcFromUrl = searchParams.get("rpc") || "";
  const customRpc = rpcFromUrl || l2Rpc;

  const customRpcUrls = useMemo(
    () => ({
      arb1: customRpc,
      l1: l1Rpc,
    }),
    [customRpc, l1Rpc]
  );

  const { autoStarted, rpcHealthy, handleRpcHealthChecked } =
    useRpcHealthOrchestration();

  const { proposals, progress, error, isProviderReady, cacheInfo } =
    useMultiGovernorSearch({
      daysToSearch,
      enabled: autoStarted && rpcHealthy === true,
      customRpcUrl: customRpc || undefined,
      blockRange: storedBlockRange,
    });

  const progressMessage = useMemo(() => {
    if (progress === 0) return "Connecting to Arbitrum...";
    if (progress < 70) {
      if (cacheInfo?.cacheUsed && cacheInfo.cachedCount > 0) {
        return `Using ${cacheInfo.cachedCount} cached proposals, fetching new... ${Math.round(progress)}%`;
      }
      return `Searching proposals... ${Math.round(progress)}%`;
    }
    if (progress < 80) return "Processing proposals...";
    if (progress < 90) return "Refreshing active proposals...";
    return "Finalizing...";
  }, [progress, cacheInfo]);

  return (
    <div className="flex flex-col space-y-4">
      <section id="proposals-table">
        {rpcHealthy === false && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="glass rounded-2xl p-6 max-w-md border-red-200/50 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-red-600 dark:text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-red-600 dark:text-red-400">
                  Cannot connect to Arbitrum RPC. Please check your connection
                  or try a different RPC URL in settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {rpcHealthy === true && autoStarted && progress < 100 && !error && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="glass rounded-2xl p-8 w-full max-w-lg space-y-6">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-arb-blue/20 to-arb-teal/20 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-arb-blue dark:text-arb-teal animate-pulse"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-arb-blue/20 to-arb-teal/20 blur-sm animate-pulse" />
                </div>
              </div>
              <div className="space-y-3">
                <Progress
                  value={progress}
                  variant="glass"
                  indicatorVariant="gradient"
                />
                <p className="text-sm text-muted-foreground text-center">
                  {progressMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="glass rounded-2xl p-6 max-w-md border-red-200/50 dark:border-red-800/50">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-red-600 dark:text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                    Something went wrong
                  </h4>
                  <p className="text-sm text-red-600/80 dark:text-red-400/80">
                    {error.message}. Please try again.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {progress === 100 && !error && (
          <>
            <DataTable isPaginated={true} columns={columns} data={proposals} />
            {cacheInfo && cacheInfo.loaded && (
              <p className="mt-2 text-xs text-muted-foreground text-center">
                {cacheInfo.cacheUsed
                  ? `${cacheInfo.cachedCount} from cache, ${cacheInfo.freshCount} fetched fresh`
                  : `${cacheInfo.freshCount} proposals fetched from RPC`}
              </p>
            )}
            <DeepLinkHandler />
          </>
        )}
      </section>

      <RpcStatus
        customUrls={customRpcUrls}
        onHealthChecked={handleRpcHealthChecked}
        autoCheck={rpcSettingsHydrated}
      />
    </div>
  );
}
