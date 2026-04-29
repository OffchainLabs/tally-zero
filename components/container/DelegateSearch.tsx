"use client";

import { BigNumber } from "ethers";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import RpcStatus from "@/components/container/RpcStatus";
import {
  DelegateStatsCards,
  DelegatesTable,
  SnapshotBlockNotice,
} from "@/components/container/delegate";
import { useDelegateSearch } from "@/hooks/use-delegate-search";
import { useRpcHealthOrchestration } from "@/hooks/use-rpc-health-orchestration";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { debug } from "@/lib/debug";

const ARB_DECIMALS = BigNumber.from(10).pow(18);
const MIN_DELEGATE_POWER_ARB = 5000;
const MIN_DELEGATE_POWER_WEI = BigNumber.from(MIN_DELEGATE_POWER_ARB)
  .mul(ARB_DECIMALS)
  .toString();
const MIN_POWER_PATTERN = /^\d+(?:\.\d+)?$/;

export default function DelegateSearch() {
  const searchParams = useSearchParams();
  const [minPowerFilter, setMinPowerFilter] = useState<string>(
    String(MIN_DELEGATE_POWER_ARB)
  );

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

  // Always enforce a 5000 ARB minimum, while still allowing the UI to raise it.
  const minVotingPowerWei = useMemo(() => {
    const trimmedMinPowerFilter = minPowerFilter.trim();
    if (!trimmedMinPowerFilter) return MIN_DELEGATE_POWER_WEI;

    if (!MIN_POWER_PATTERN.test(trimmedMinPowerFilter)) {
      debug.delegates("invalid min power filter: %s", trimmedMinPowerFilter);
      return MIN_DELEGATE_POWER_WEI;
    }

    try {
      const requestedWholeArb = BigNumber.from(
        trimmedMinPowerFilter.split(".")[0] || "0"
      );
      const effectiveArb = requestedWholeArb.lt(MIN_DELEGATE_POWER_ARB)
        ? BigNumber.from(MIN_DELEGATE_POWER_ARB)
        : requestedWholeArb;

      return effectiveArb.mul(ARB_DECIMALS).toString();
    } catch (error) {
      debug.delegates("invalid min power filter: %O", error);
      return MIN_DELEGATE_POWER_WEI;
    }
  }, [minPowerFilter]);

  const {
    delegates,
    totalVotingPower,
    totalSupply,
    error,
    isLoading,
    cacheStats,
    snapshotBlock,
    refreshVisibleDelegates,
  } = useDelegateSearch({
    enabled: autoStarted && rpcHealthy === true,
    customRpcUrl: customRpc || undefined,
    minVotingPower: minVotingPowerWei,
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
      {delegates.length > 0 && !error && (
        <DelegateStatsCards
          delegateCount={delegates.length}
          totalVotingPower={totalVotingPower}
          totalSupply={totalSupply}
          delegatedPercentage={delegatedPercentage}
        />
      )}

      {snapshotBlock > 0 && cacheStats && (
        <SnapshotBlockNotice
          snapshotBlock={snapshotBlock}
          cacheAge={cacheStats.age}
        />
      )}

      <DelegatesTable
        delegates={delegates}
        totalVotingPower={totalVotingPower}
        isLoading={isLoading}
        error={error}
        rpcHealthy={rpcHealthy}
        minPowerFloor={MIN_DELEGATE_POWER_ARB}
        onMinPowerChange={setMinPowerFilter}
        onVisibleRowsChange={handleVisibleRowsChange}
      />

      <RpcStatus
        customUrls={customRpcUrls}
        onHealthChecked={handleRpcHealthChecked}
        autoCheck={rpcSettingsHydrated}
      />
    </div>
  );
}
