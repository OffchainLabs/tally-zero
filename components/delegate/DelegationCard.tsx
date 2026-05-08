"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { useAppKit } from "@reown/appkit/react";
import { CheckCircle2, Vote, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
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

import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { ARBITRUM_CHAIN_ID, ARB_TOKEN } from "@/config/arbitrum-governance";
import ERC20VotesABI from "@/data/ERC20Votes_ABI.json";
import { addressesEqual, isValidAddress } from "@/lib/address-utils";
import {
  type TallyAddressDisplayRecord,
  useAddressDisplayRecord,
} from "@/lib/delegate-cache";
import { getErrorMessage, getSimulationErrorMessage } from "@/lib/error-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";

const ARB_TOKEN_ABI = ERC20VotesABI as Abi;

interface DelegationCardProps {
  delegateAddress: string;
  delegateName: string;
}

export function DelegationCard({
  delegateAddress,
  delegateName,
}: DelegationCardProps) {
  const delegation = useArbDelegation({ delegateAddress, delegateName });

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Vote className="h-4 w-4 text-muted-foreground" />
          Delegate ARB
        </CardTitle>
        <CardDescription>{delegation.status}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {delegation.isConnected && (
          <DelegateBalance balanceLabel={delegation.balanceLabel} />
        )}

        <DelegationActionButton delegation={delegation} />

        <p className="text-xs text-muted-foreground">
          Delegation updates voting power only. Your ARB stays in your wallet.
        </p>
      </CardContent>
    </Card>
  );
}

function useArbDelegation({
  delegateAddress,
  delegateName,
}: DelegationCardProps) {
  const { open } = useAppKit();
  const { address: accountAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const {
    switchChain,
    isPending: isSwitchingChain,
    error: switchChainError,
  } = useSwitchChain();
  const [trackedTxHash, setTrackedTxHash] = useState<`0x${string}`>();

  const validDelegateAddress = isValidAddress(delegateAddress)
    ? (delegateAddress as `0x${string}`)
    : undefined;
  const accountReadAddress = accountAddress ?? zeroAddress;
  const isWrongNetwork = isConnected && chainId !== ARBITRUM_CHAIN_ID;

  const { data: balanceData, isLoading: isLoadingBalance } = useBalance({
    address: accountAddress,
    token: ARB_TOKEN.address,
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled: isConnected && !!accountAddress,
    },
  });
  const arbBalance = balanceData?.value;

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
  const isDelegatedToProfile = addressesEqual(
    currentDelegate,
    validDelegateAddress
  );
  const currentDelegateDisplayRecord = useAddressDisplayRecord(
    currentDelegate && !addressesEqual(currentDelegate, zeroAddress)
      ? currentDelegate
      : ""
  );
  const currentDelegateLabel = currentDelegate
    ? getDelegateLinkLabel(currentDelegate, currentDelegateDisplayRecord)
    : "";

  const {
    data: simulateData,
    error: simulateError,
    isError: isSimulateError,
    isFetching: isSimulating,
  } = useSimulateContract({
    address: ARB_TOKEN.address,
    abi: ARB_TOKEN_ABI,
    functionName: "delegate",
    args: validDelegateAddress ? [validDelegateAddress] : undefined,
    account: accountAddress,
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled:
        isConnected &&
        !!accountAddress &&
        !!validDelegateAddress &&
        !isWrongNetwork &&
        !isDelegatedToProfile,
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
    refetchCurrentDelegate();
  }, [isConfirmed, refetchCurrentDelegate, trackedTxHash]);

  useEffect(() => {
    if (!isSimulateError || !simulateError || isDelegatedToProfile) return;
    toast.error(getSimulationErrorMessage(simulateError), {
      id: "delegate-arb-simulation-error",
    });
  }, [isDelegatedToProfile, isSimulateError, simulateError]);

  useEffect(() => {
    if (!writeError || isUserRejectedError(writeError)) return;
    toast.error(getErrorMessage(writeError, "delegate ARB voting power"), {
      id: "delegate-arb-write-error",
    });
  }, [writeError]);

  useEffect(() => {
    if (!receiptError || isUserRejectedError(receiptError)) return;
    toast.error(getErrorMessage(receiptError, "confirm delegation"), {
      id: "delegate-arb-receipt-error",
    });
  }, [receiptError]);

  useEffect(() => {
    if (!switchChainError || isUserRejectedError(switchChainError)) return;
    toast.error(getErrorMessage(switchChainError, "switch network"), {
      id: "delegate-arb-switch-error",
    });
  }, [switchChainError]);

  const status = useMemo(() => {
    if (!isConnected) return "Connect a wallet to delegate ARB voting power.";
    if (!validDelegateAddress) return "Invalid delegate address.";
    if (isLoadingCurrentDelegate) return "Checking current delegation.";
    if (isDelegatedToProfile) {
      return (
        <>
          Currently delegated to{" "}
          <DelegateProfileLink address={validDelegateAddress}>
            {delegateName}
          </DelegateProfileLink>
          .
        </>
      );
    }
    if (currentDelegate && !addressesEqual(currentDelegate, zeroAddress)) {
      return (
        <>
          Currently delegated to{" "}
          <DelegateProfileLink address={currentDelegate}>
            {currentDelegateLabel}
          </DelegateProfileLink>
          .
        </>
      );
    }
    return "No active ARB delegate.";
  }, [
    currentDelegate,
    currentDelegateLabel,
    delegateName,
    isConnected,
    isDelegatedToProfile,
    isLoadingCurrentDelegate,
    validDelegateAddress,
  ]);

  const balanceLabel =
    isLoadingBalance || arbBalance === undefined
      ? "Loading"
      : `${formatVotingPower(arbBalance)} ARB`;
  const isBusy = isWriting || isConfirming || isSimulating || isSwitchingChain;
  const canDelegate =
    isConnected &&
    !isWrongNetwork &&
    !!simulateData?.request &&
    !!validDelegateAddress &&
    !isDelegatedToProfile &&
    !isBusy;

  function delegate() {
    if (!simulateData?.request || !canDelegate) return;

    writeContract(simulateData.request, {
      onSuccess: (hash) => {
        setTrackedTxHash(hash);
      },
      onError: () => {
        setTrackedTxHash(undefined);
      },
    });
  }

  function connect() {
    open({ view: "Connect" });
  }

  function switchToArbitrum() {
    switchChain({ chainId: ARBITRUM_CHAIN_ID });
  }

  return {
    balanceLabel,
    canDelegate,
    connect,
    delegate,
    isBusy,
    isConnected,
    isConfirming,
    isDelegatedToProfile,
    isSwitchingChain,
    isWriting,
    isWrongNetwork,
    status,
    switchToArbitrum,
  };
}

type DelegationState = ReturnType<typeof useArbDelegation>;

function getDelegateLinkLabel(
  address: string,
  displayRecord: TallyAddressDisplayRecord | undefined
): string {
  return displayRecord?.label || shortenAddress(address);
}

function DelegateProfileLink({
  address,
  children,
}: {
  address: string;
  children: ReactNode;
}) {
  return (
    <Link href={`/delegates/${address.toLowerCase()}`} className="underline">
      {children}
    </Link>
  );
}

function DelegateBalance({ balanceLabel }: { balanceLabel: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      Your balance:{" "}
      <span className="font-medium text-foreground">{balanceLabel}</span>
    </div>
  );
}

function DelegationActionButton({
  delegation,
}: {
  delegation: DelegationState;
}) {
  if (!delegation.isConnected) {
    return (
      <Button className="w-full" onClick={delegation.connect}>
        <Wallet className="mr-2 h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  if (delegation.isWrongNetwork) {
    return (
      <Button
        className="w-full"
        onClick={delegation.switchToArbitrum}
        disabled={delegation.isSwitchingChain}
      >
        {delegation.isSwitchingChain && (
          <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
        )}
        Switch to Arbitrum
      </Button>
    );
  }

  if (delegation.isDelegatedToProfile) {
    return (
      <Button className="w-full" variant="outline" disabled>
        <CheckCircle2 className="mr-2 h-4 w-4" />
        Delegated
      </Button>
    );
  }

  return (
    <Button
      className="w-full"
      onClick={delegation.delegate}
      disabled={!delegation.canDelegate}
    >
      {delegation.isBusy && (
        <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
      )}
      {getDelegateButtonLabel(delegation)}
    </Button>
  );
}

function getDelegateButtonLabel({
  isConfirming,
  isWriting,
}: Pick<DelegationState, "isConfirming" | "isWriting">): string {
  if (isConfirming) return "Confirming";
  if (isWriting) return "Delegating";
  return "Delegate to this address";
}

function isUserRejectedError(error: unknown): boolean {
  if (!error) return false;

  const message = getErrorMessage(error).toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  return (
    code === "4001" ||
    code === "ACTION_REJECTED" ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request") ||
    message.includes("request rejected") ||
    message.includes("denied transaction signature")
  );
}
