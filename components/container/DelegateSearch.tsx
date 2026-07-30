"use client";

import { BigNumber } from "ethers";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import RpcStatus from "@/components/container/RpcStatus";
import {
  DelegateStatsCards,
  DelegatesTable,
} from "@/components/container/delegate";
import {
  DELEGATE_MIN_VOTING_POWER_ARB,
  DELEGATE_MIN_VOTING_POWER_WEI,
} from "@/config/delegates";
import { useDelegateSearch } from "@/hooks/use-delegate-search";
import { useRpcHealthOrchestration } from "@/hooks/use-rpc-health-orchestration";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { debug } from "@/lib/debug";

const ARB_DECIMALS = BigNumber.from(10).pow(18);
const MIN_POWER_PATTERN = /^\d+(?:\.\d+)?$/;

export default function DelegateSearch() {
  const searchParams = useSearchParams();
  const [minPowerFilter, setMinPowerFilter] = useState<string>(
    String(DELEGATE_MIN_VOTING_POWER_ARB)
  );
  const [delegateSearchFilter, setDelegateSearchFilter] = useState<string>("");

  const { l1Rpc, l2Rpc, isHydrated: rpcSettingsHydrated } = useRpcSettings();

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

  // Never drop below the eligibility threshold, while still letting the UI
  // raise it. Anything under it is not a delegate as far as this app counts.
  const minVotingPowerWei = useMemo(() => {
    const trimmedMinPowerFilter = minPowerFilter.trim();
    if (!trimmedMinPowerFilter) return DELEGATE_MIN_VOTING_POWER_WEI;

    if (!MIN_POWER_PATTERN.test(trimmedMinPowerFilter)) {
      debug.delegates("invalid min power filter: %s", trimmedMinPowerFilter);
      return DELEGATE_MIN_VOTING_POWER_WEI;
    }

    try {
      const requestedWholeArb = BigNumber.from(
        trimmedMinPowerFilter.split(".")[0] || "0"
      );
      const effectiveArb = requestedWholeArb.lt(DELEGATE_MIN_VOTING_POWER_ARB)
        ? BigNumber.from(DELEGATE_MIN_VOTING_POWER_ARB)
        : requestedWholeArb;

      return effectiveArb.mul(ARB_DECIMALS).toString();
    } catch (error) {
      debug.delegates("invalid min power filter: %O", error);
      return DELEGATE_MIN_VOTING_POWER_WEI;
    }
  }, [minPowerFilter]);

  const {
    delegates,
    eligibleDelegateCount,
    totalVotingPower,
    totalSupply,
    error,
    isLoading,
    pageIndex,
    pageSize,
    rowCount,
    setPagination,
    sorting,
    setSorting,
    sortOrder,
    setSortOrder,
    refreshVisibleDelegates,
    refreshedAddresses,
  } = useDelegateSearch({
    enabled: autoStarted && rpcHealthy === true,
    customRpcUrl: customRpc || undefined,
    minVotingPower: minVotingPowerWei,
    addressFilter: delegateSearchFilter,
  });

  // Calculate delegated percentage
  const delegatedPercentage = useMemo(() => {
    if (!totalVotingPower || !totalSupply || totalSupply === "0") {
      return "0.00";
    }
    try {
      const votingPowerBN = BigNumber.from(totalVotingPower);
      const totalSupplyBN = BigNumber.from(totalSupply);
      const percentage =
        (parseFloat(votingPowerBN.toString()) /
          parseFloat(totalSupplyBN.toString())) *
        100;
      return percentage.toFixed(2);
    } catch (error) {
      debug.delegates("error calculating delegated percentage: %O", error);
      return "0.00";
    }
  }, [totalVotingPower, totalSupply]);

  // Handle visible rows change for refreshing voting power
  const handleVisibleRowsChange = useCallback(
    (addresses: string[]) => {
      if (autoStarted && rpcHealthy === true) {
        refreshVisibleDelegates(addresses);
      }
    },
    [autoStarted, rpcHealthy, refreshVisibleDelegates]
  );

  return (
    <div className="flex flex-col space-y-4">
      {eligibleDelegateCount > 0 && !error && (
        <DelegateStatsCards
          delegateCount={eligibleDelegateCount}
          totalVotingPower={totalVotingPower}
          totalSupply={totalSupply}
        />
      )}

      <DelegatesTable
        delegates={delegates}
        totalVotingPower={totalVotingPower}
        isLoading={isLoading}
        error={error}
        rpcHealthy={rpcHealthy}
        minPowerFloor={DELEGATE_MIN_VOTING_POWER_ARB}
        refreshedAddresses={refreshedAddresses}
        pageIndex={pageIndex}
        pageSize={pageSize}
        rowCount={rowCount}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        onSearchChange={setDelegateSearchFilter}
        onMinPowerChange={setMinPowerFilter}
        onVisibleRowsChange={handleVisibleRowsChange}
      />

      <RpcStatus
        customUrls={customRpcUrls}
        onHealthChecked={handleRpcHealthChecked}
        autoCheck={rpcSettingsHydrated}
        hidden
      />
    </div>
  );
}
