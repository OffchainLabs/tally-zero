"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { DeepLinkHandler } from "@/components/container/DeepLinkHandler";
import SearchSkeleton from "@/components/container/SearchSkeleton";
import { columns } from "@/components/table/ColumnsProposals";
import { DataTable } from "@/components/table/DataTable";

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMultiGovernorSearch } from "@/hooks/use-multi-governor-search";
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

  const { l2Rpc } = useRpcSettings();

  const daysToSearch =
    parseInt(searchParams.get("days") || "") ||
    storedDays ||
    DEFAULT_FORM_VALUES.daysToSearch;
  const rpcFromUrl = searchParams.get("rpc") || "";
  const customRpc = rpcFromUrl || l2Rpc;

  const { proposals, error, isSearching, isReconciling, rpcError, sourceInfo } =
    useMultiGovernorSearch({
      daysToSearch,
      enabled: true,
      customRpcUrl: customRpc || undefined,
      blockRange: storedBlockRange,
    });

  const validProposals = useMemo(
    () => proposals.filter((proposal) => proposal.id?.trim()),
    [proposals]
  );

  return (
    <div className="flex flex-col space-y-4">
      <section id="proposals-table">
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

        {!error && isSearching && (
          <>
            <SearchSkeleton />
            {sourceInfo && !sourceInfo.indexerAvailable && (
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Indexer unavailable, searching proposals via RPC...
              </p>
            )}
          </>
        )}

        {!error && !isSearching && (
          <>
            <DataTable
              isPaginated={true}
              columns={columns}
              data={validProposals}
            />
            {sourceInfo && (
              <p className="mt-2 text-xs text-muted-foreground text-center">
                {sourceInfo.indexerAvailable
                  ? `${sourceInfo.indexedCount} proposals from indexer${
                      sourceInfo.rpcFreshCount > 0
                        ? `, ${sourceInfo.rpcFreshCount} new via RPC`
                        : ""
                    }`
                  : `${sourceInfo.rpcFreshCount} proposals via RPC (indexer unavailable)`}
                {isReconciling && " · checking RPC for new proposals..."}
              </p>
            )}
            {rpcError && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 text-center">
                Could not reach the Arbitrum RPC to check for new proposals.
                Live vote data may be stale.
              </p>
            )}
            <DeepLinkHandler />
          </>
        )}
      </section>
    </div>
  );
}
