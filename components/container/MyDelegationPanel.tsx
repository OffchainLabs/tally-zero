"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { useAppKit } from "@reown/appkit/react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, UserCheck, Vote, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type Abi, zeroAddress } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useSimulateContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { MyDelegatorsList } from "@/components/container/MyDelegatorsList";
import {
  getDelegateButtonLabel,
  getDelegateLinkLabel,
} from "@/components/delegate/DelegationCard";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { ARBITRUM_CHAIN_ID, ARB_TOKEN } from "@/config/arbitrum-governance";
import ERC20VotesABI from "@/data/ERC20Votes_ABI.json";
import { myDelegatorsQueryKey } from "@/hooks/use-my-delegators";
import { useRpcSettings } from "@/hooks/use-rpc-settings";
import { addressesEqual, isValidAddress } from "@/lib/address-utils";
import { useAddressDisplayRecord } from "@/lib/delegate-cache";
import {
  getErrorMessage,
  getSimulationErrorMessage,
  isUserRejectedError,
} from "@/lib/error-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";

const ARB_TOKEN_ABI = ERC20VotesABI as Abi;

const GET_VOTES_ABI = [
  {
    name: "getVotes",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

type RefetchFn = () => unknown;

export function refreshMyDelegationData({
  accountAddress,
  l2Rpc,
  queryClient,
  refetchCurrentDelegate,
  refetchVotingPower,
}: {
  accountAddress: string | undefined;
  l2Rpc: string;
  queryClient: Pick<QueryClient, "invalidateQueries">;
  refetchCurrentDelegate: RefetchFn;
  refetchVotingPower: RefetchFn;
}): void {
  const refreshes = [
    Promise.resolve(refetchCurrentDelegate()),
    Promise.resolve(refetchVotingPower()),
  ];

  if (accountAddress) {
    refreshes.push(
      Promise.resolve(
        queryClient.invalidateQueries({
          queryKey: myDelegatorsQueryKey(accountAddress, l2Rpc),
          exact: true,
        })
      )
    );
  }

  void Promise.allSettled(refreshes);
}

export function MyDelegationPanel() {
  const { open } = useAppKit();
  const queryClient = useQueryClient();
  const { l2Rpc } = useRpcSettings();
  const { address: accountAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const {
    switchChain,
    isPending: isSwitchingChain,
    error: switchChainError,
  } = useSwitchChain();

  const [targetAddress, setTargetAddress] = useState("");
  const [debouncedTarget, setDebouncedTarget] = useState("");
  const [trackedTxHash, setTrackedTxHash] = useState<`0x${string}`>();

  const isWrongNetwork = isConnected && chainId !== ARBITRUM_CHAIN_ID;
  const accountReadAddress = accountAddress ?? zeroAddress;

  const { data: balanceData, isLoading: isLoadingBalance } = useBalance({
    address: accountAddress,
    token: ARB_TOKEN.address,
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled: isConnected && !!accountAddress,
    },
  });
  const arbBalance = balanceData?.value;
  const hasZeroArbBalance = arbBalance === BigInt(0);

  const {
    data: votingPower,
    isPending: isVotingPowerPending,
    isError: isVotingPowerError,
    refetch: refetchVotingPower,
  } = useReadContract({
    address: ARB_TOKEN.address,
    abi: GET_VOTES_ABI,
    functionName: "getVotes",
    args: [accountReadAddress],
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled: isConnected && !!accountAddress,
    },
  });

  const {
    data: rawCurrentDelegate,
    isLoading: isLoadingCurrentDelegate,
    refetch: refetchCurrentDelegate,
  } = useReadContract({
    address: ARB_TOKEN.address,
    abi: ARB_TOKEN_ABI,
    functionName: "delegates",
    args: [accountReadAddress],
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled: isConnected && !!accountAddress,
    },
  });
  const currentDelegate = rawCurrentDelegate as `0x${string}` | undefined;
  const hasActiveDelegate = !!(
    currentDelegate && !addressesEqual(currentDelegate, zeroAddress)
  );
  const currentDelegateDisplayRecord = useAddressDisplayRecord(
    hasActiveDelegate ? (currentDelegate as string) : ""
  );
  const currentDelegateLabel = currentDelegate
    ? getDelegateLinkLabel(currentDelegate, currentDelegateDisplayRecord)
    : "";

  const trimmedTarget = targetAddress.trim();
  const isTargetValid = isValidAddress(trimmedTarget);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedTarget(trimmedTarget);
    }, 400);
    return () => clearTimeout(handle);
  }, [trimmedTarget]);

  const isDebouncedTargetValid = isValidAddress(debouncedTarget);
  const targetForSimulation = isDebouncedTargetValid
    ? (debouncedTarget as `0x${string}`)
    : undefined;
  const isSameAsCurrent =
    isDebouncedTargetValid && addressesEqual(debouncedTarget, currentDelegate);
  const isPreparing = isTargetValid && trimmedTarget !== debouncedTarget;

  const {
    data: simulateData,
    error: simulateError,
    isError: isSimulateError,
    isFetching: isSimulating,
  } = useSimulateContract({
    address: ARB_TOKEN.address,
    abi: ARB_TOKEN_ABI,
    functionName: "delegate",
    args: targetForSimulation ? [targetForSimulation] : undefined,
    account: accountAddress,
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled:
        isConnected &&
        !!accountAddress &&
        !!targetForSimulation &&
        !isWrongNetwork &&
        !hasZeroArbBalance &&
        !isSameAsCurrent,
    },
  });

  const {
    error: writeError,
    isPending: isWriting,
    writeContract,
  } = useWriteContract();

  const {
    error: receiptError,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    chainId: ARBITRUM_CHAIN_ID,
    hash: trackedTxHash,
    onReplaced: ({ reason, transactionReceipt }) => {
      if (reason === "cancelled") {
        setTrackedTxHash(undefined);
        toast.error("Delegation transaction was cancelled.");
        return;
      }
      setTrackedTxHash(transactionReceipt.transactionHash);
      toast(
        reason === "repriced"
          ? "Delegation transaction gas fee was updated."
          : "Delegation transaction was replaced."
      );
    },
  });

  useEffect(() => {
    if (!isConfirmed || !trackedTxHash) return;
    toast.success("ARB voting power delegated.");
    refreshMyDelegationData({
      accountAddress,
      l2Rpc,
      queryClient,
      refetchCurrentDelegate,
      refetchVotingPower,
    });
    setTrackedTxHash(undefined);
  }, [
    accountAddress,
    isConfirmed,
    l2Rpc,
    queryClient,
    refetchCurrentDelegate,
    refetchVotingPower,
    trackedTxHash,
  ]);

  useEffect(() => {
    if (!isSimulateError || !simulateError) return;
    toast.error(getSimulationErrorMessage(simulateError), {
      id: "my-delegation-simulation-error",
    });
  }, [isSimulateError, simulateError]);

  useEffect(() => {
    if (!writeError || isUserRejectedError(writeError)) return;
    toast.error(getErrorMessage(writeError, "delegate ARB voting power"), {
      id: "my-delegation-write-error",
    });
  }, [writeError]);

  useEffect(() => {
    if (!receiptError || isUserRejectedError(receiptError)) return;
    toast.error(getErrorMessage(receiptError, "confirm delegation"), {
      id: "my-delegation-receipt-error",
    });
  }, [receiptError]);

  useEffect(() => {
    if (!switchChainError || isUserRejectedError(switchChainError)) return;
    toast.error(getErrorMessage(switchChainError, "switch network"), {
      id: "my-delegation-switch-error",
    });
  }, [switchChainError]);

  const balanceLabel = useMemo(() => {
    if (!isConnected) return "—";
    if (isLoadingBalance || arbBalance === undefined) return "Loading";
    return `${formatVotingPower(arbBalance)} ARB`;
  }, [arbBalance, isConnected, isLoadingBalance]);

  const votingPowerLabel = useMemo(() => {
    if (!isConnected) return "—";
    if (isVotingPowerError) return "Unavailable";
    if (isVotingPowerPending || votingPower === undefined) return "Loading";
    return `${formatVotingPower(votingPower)} ARB`;
  }, [isConnected, isVotingPowerError, isVotingPowerPending, votingPower]);

  const isBusy = isWriting || isConfirming || isSimulating || isSwitchingChain;
  const canDelegate =
    isConnected &&
    !isWrongNetwork &&
    !!simulateData?.request &&
    !!targetForSimulation &&
    trimmedTarget === debouncedTarget &&
    !hasZeroArbBalance &&
    !isSameAsCurrent &&
    !isBusy;

  const handleConnect = () => open({ view: "Connect" });
  const handleSwitchToArbitrum = () =>
    switchChain({ chainId: ARBITRUM_CHAIN_ID });

  const handleDelegate = () => {
    if (!simulateData?.request || !canDelegate) return;
    writeContract(simulateData.request, {
      onSuccess: (hash) => setTrackedTxHash(hash),
      onError: () => setTrackedTxHash(undefined),
    });
  };

  const useSelfAsTarget = () => {
    if (!accountAddress) return;
    setTargetAddress(accountAddress);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            Wallet
          </CardTitle>
          <CardDescription>
            {isConnected
              ? "Connected to your wallet."
              : "Connect a wallet to manage your delegation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isConnected && accountAddress ? (
            <>
              <KeyValueRow
                label="Address"
                value={
                  <span className="font-mono" title={accountAddress}>
                    {shortenAddress(accountAddress, 6)}
                  </span>
                }
              />
              <KeyValueRow label="ARB Balance" value={balanceLabel} />
              <KeyValueRow label="Voting Power" value={votingPowerLabel} />
              {isWrongNetwork && (
                <Button
                  className="w-full"
                  onClick={handleSwitchToArbitrum}
                  disabled={isSwitchingChain}
                >
                  {isSwitchingChain && (
                    <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Switch to Arbitrum
                </Button>
              )}
            </>
          ) : (
            <Button className="w-full" onClick={handleConnect}>
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
          )}
        </CardContent>
      </Card>

      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4 text-muted-foreground" />
            Current Delegate
          </CardTitle>
          <CardDescription>
            {isConnected
              ? "Who currently holds your ARB voting power."
              : "Connect a wallet to view your current delegate."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isConnected && (
            <p className="text-sm text-muted-foreground">Not connected.</p>
          )}
          {isConnected && isLoadingCurrentDelegate && (
            <p className="text-sm text-muted-foreground">
              Checking current delegation.
            </p>
          )}
          {isConnected && !isLoadingCurrentDelegate && !hasActiveDelegate && (
            <p className="text-sm text-muted-foreground">
              No active ARB delegate. Your voting power is not active until you
              delegate (to yourself or someone else).
            </p>
          )}
          {isConnected && hasActiveDelegate && currentDelegate && (
            <div className="space-y-2">
              <KeyValueRow
                label="Delegated to"
                value={
                  <Link
                    href={`/delegates/${currentDelegate.toLowerCase()}`}
                    className="text-primary hover:underline"
                  >
                    {currentDelegateLabel}
                  </Link>
                }
              />
              <KeyValueRow
                label="Address"
                value={
                  <span className="font-mono" title={currentDelegate}>
                    {shortenAddress(currentDelegate, 6)}
                  </span>
                }
              />
              {addressesEqual(currentDelegate, accountAddress) && (
                <p className="text-xs text-muted-foreground">
                  You are self-delegated.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="glass" className="md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Vote className="h-4 w-4 text-muted-foreground" />
            Change Delegate
          </CardTitle>
          <CardDescription>
            Delegate your ARB voting power to any address. Your ARB stays in
            your wallet; only voting power moves.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="target-delegate">Delegate address</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="target-delegate"
                type="text"
                placeholder="0x..."
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canDelegate) {
                    e.preventDefault();
                    handleDelegate();
                  }
                }}
                className="font-mono text-sm"
                disabled={!isConnected || isBusy}
              />
              <Button
                type="button"
                variant="outline"
                onClick={useSelfAsTarget}
                disabled={!isConnected || isBusy || !accountAddress}
              >
                Use my address
              </Button>
              {!isConnected ? (
                <Button type="button" onClick={handleConnect}>
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect Wallet
                </Button>
              ) : isWrongNetwork ? (
                <Button
                  type="button"
                  onClick={handleSwitchToArbitrum}
                  disabled={isSwitchingChain}
                >
                  {isSwitchingChain && (
                    <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Switch to Arbitrum
                </Button>
              ) : isSameAsCurrent ? (
                <Button type="button" variant="outline" disabled>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Already Delegated
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleDelegate}
                  disabled={!canDelegate}
                >
                  {(isBusy || isPreparing) && (
                    <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isBusy
                    ? getDelegateButtonLabel({ isConfirming, isWriting })
                    : isTargetValid
                      ? `Delegate to ${shortenAddress(trimmedTarget, 4)}`
                      : "Delegate"}
                </Button>
              )}
            </div>
            {targetAddress && !isTargetValid && (
              <p className="text-xs text-destructive">
                Enter a valid Ethereum address.
              </p>
            )}
            {isSameAsCurrent && (
              <p className="text-xs text-muted-foreground">
                This is already your current delegate.
              </p>
            )}
          </div>

          {isConnected &&
            !isWrongNetwork &&
            hasZeroArbBalance &&
            !isLoadingBalance && (
              <p className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Get some ARB tokens if you want to participate in governance and
                delegate your voting power.
              </p>
            )}
        </CardContent>
      </Card>

      {isConnected && accountAddress && (
        <MyDelegatorsList delegateAddress={accountAddress} />
      )}
    </div>
  );
}

function KeyValueRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
