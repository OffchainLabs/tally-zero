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

export default function DelegateSearch() {
  const searchParams = useSearchParams();
  const [minPowerFilter, setMinPowerFilter] = useState<string>("");

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

  // Convert min power from ARB to wei (18 decimals) for filtering
  const minVotingPowerWei = useMemo(() => {
    if (!minPowerFilter || minPowerFilter === "") return undefined;
    try {
      const arbValue = parseFloat(minPowerFilter);
      if (isNaN(arbValue) || arbValue < 0) return undefined;
      // Convert ARB to wei
      const weiValue = BigNumber.from(10).pow(18).mul(Math.floor(arbValue));
      return weiValue.toString();
    } catch (error) {
      debug.delegates("invalid min power filter: %O", error);
      return undefined;
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
