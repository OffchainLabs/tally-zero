"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { CheckCircle2, CircleX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type Abi } from "viem";
import {
  useAccount,
  useChainId,
  useSimulateContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { proposalSchema } from "@/config/schema";
import { isValidAddress } from "@/lib/address-utils";
import {
  getErrorMessage,
  getProposalCancelSimulationErrorMessage,
  isUserRejectedError,
} from "@/lib/error-utils";
import { buildCancelArgs } from "@/lib/proposal-cancel-utils";
import { getProposalCancelVisibility } from "@/lib/proposal-cancel-visibility";

const GOVERNOR_CANCEL_ABI = [
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "calldatas", type: "bytes[]" },
      { name: "descriptionHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

type ProposalForCancellation = ReturnType<typeof proposalSchema.parse>;

interface ProposalCancelCardProps {
  proposal: ProposalForCancellation;
  onCanceled?: () => void;
}

interface ProposalCancelButtonLabelInput {
  isConfirmed: boolean;
  isConfirming: boolean;
  isSimulating: boolean;
  isSwitchingChain: boolean;
  isWriting: boolean;
}

export function ProposalCancelCard({
  proposal,
  onCanceled,
}: ProposalCancelCardProps) {
  const { address: accountAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const {
    switchChain,
    isPending: isSwitchingChain,
    error: switchChainError,
  } = useSwitchChain();
  const [trackedTxHash, setTrackedTxHash] = useState<`0x${string}`>();
  const [replacementErrorMessage, setReplacementErrorMessage] = useState<
    string | null
  >(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const notifiedConfirmedHashRef = useRef<`0x${string}` | undefined>(undefined);

  const visibility = getProposalCancelVisibility({
    accountAddress,
    governorAddress: proposal.contractAddress,
    isConnected,
    proposer: proposal.proposer,
    state: proposal.state,
  });
  const cancelArgs = useMemo(() => buildCancelArgs(proposal), [proposal]);
  const governorAddress = isValidAddress(proposal.contractAddress)
    ? (proposal.contractAddress as `0x${string}`)
    : undefined;
  const isWrongNetwork = isConnected && chainId !== ARBITRUM_CHAIN_ID;
  const shouldSimulate =
    visibility === "cancel" &&
    !isWrongNetwork &&
    cancelArgs !== null &&
    !!governorAddress;

  const {
    data: simulateData,
    error: simulateError,
    isError: isSimulateError,
    isFetching: isSimulating,
  } = useSimulateContract({
    address: governorAddress,
    abi: GOVERNOR_CANCEL_ABI,
    functionName: "cancel",
    args: shouldSimulate && cancelArgs ? cancelArgs : undefined,
    account: shouldSimulate ? accountAddress : undefined,
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled: shouldSimulate,
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
        setReplacementErrorMessage(
          "Proposal cancellation transaction was cancelled in your wallet."
        );
        toast.error("Proposal cancellation transaction was cancelled.");
        return;
      }

      setTrackedTxHash(transactionReceipt.transactionHash);
      setReplacementErrorMessage(null);
      toast(
        reason === "repriced"
          ? "Proposal cancellation gas fee was updated."
          : "Proposal cancellation transaction was replaced."
      );
    },
  });

  useEffect(() => {
    if (!isConfirmed || !trackedTxHash) return;
    if (notifiedConfirmedHashRef.current === trackedTxHash) return;

    notifiedConfirmedHashRef.current = trackedTxHash;
    toast.success("Proposal canceled.");
    onCanceled?.();
  }, [isConfirmed, onCanceled, trackedTxHash]);

  useEffect(() => {
    if (!isSimulateError || !simulateError || visibility !== "cancel") return;
    toast.error(getProposalCancelSimulationErrorMessage(simulateError), {
      id: "proposal-cancel-simulation-error",
    });
  }, [isSimulateError, simulateError, visibility]);

  useEffect(() => {
    if (!writeError || isUserRejectedError(writeError)) return;
    toast.error(getErrorMessage(writeError, "cancel proposal"), {
      id: "proposal-cancel-write-error",
    });
  }, [writeError]);

  useEffect(() => {
    if (!receiptError) return;
    toast.error(
      getErrorMessage(receiptError, "confirm proposal cancellation"),
      {
        id: "proposal-cancel-receipt-error",
      }
    );
  }, [receiptError]);

  useEffect(() => {
    if (!switchChainError || isUserRejectedError(switchChainError)) return;
    toast.error(getErrorMessage(switchChainError, "switch network"), {
      id: "proposal-cancel-switch-error",
    });
  }, [switchChainError]);

  if (visibility === "hidden") {
    return null;
  }

  const isBusy = isWriting || isConfirming || isSwitchingChain;
  const simulationErrorMessage =
    isSimulateError && simulateError
      ? getProposalCancelSimulationErrorMessage(simulateError)
      : null;
  const canCancel =
    visibility === "cancel" &&
    !!simulateData?.request &&
    !isBusy &&
    !isSimulating &&
    !isSimulateError &&
    !isConfirmed;

  function switchToArbitrum() {
    switchChain({ chainId: ARBITRUM_CHAIN_ID });
  }

  function cancelProposal() {
    if (!simulateData?.request || !canCancel) return;

    setConfirmOpen(false);
    setReplacementErrorMessage(null);
    writeContract(simulateData.request, {
      onSuccess: (hash) => {
        setTrackedTxHash(hash);
      },
      onError: () => {
        setTrackedTxHash(undefined);
      },
    });
  }

  return (
    <Card
      variant="glass"
      className="rounded-2xl border border-destructive/30 shadow-lg shadow-black/5"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleX className="h-4 w-4 text-destructive" />
          Proposal Cancellation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isWrongNetwork ? (
          <Button
            className="w-full"
            onClick={switchToArbitrum}
            disabled={isSwitchingChain}
          >
            {isSwitchingChain && (
              <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Switch to Arbitrum
          </Button>
        ) : isConfirmed ? (
          <Button className="w-full" variant="outline" disabled>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Proposal Canceled
          </Button>
        ) : (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button
                className="w-full"
                variant="destructive"
                disabled={!canCancel}
              >
                {(isWriting || isConfirming || isSimulating) && (
                  <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                )}
                {getProposalCancelButtonLabel({
                  isConfirmed,
                  isConfirming,
                  isSimulating,
                  isSwitchingChain,
                  isWriting,
                })}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel proposal?</DialogTitle>
                <DialogDescription>
                  Only the proposal creator can cancel during the pending period
                  before voting starts. This transaction cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Proposal id:{" "}
                <span className="font-mono text-foreground break-all">
                  {proposal.id}
                </span>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Keep Proposal</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={cancelProposal}
                  disabled={!canCancel}
                >
                  Cancel Proposal
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {isSimulating && (
          <p className="text-xs text-muted-foreground">
            Checking cancellation transaction.
          </p>
        )}
        {simulationErrorMessage && (
          <p className="text-xs text-destructive">{simulationErrorMessage}</p>
        )}
        {replacementErrorMessage && (
          <p className="text-xs text-destructive">{replacementErrorMessage}</p>
        )}
        {receiptError && (
          <p className="text-xs text-destructive">
            {getErrorMessage(receiptError, "confirm proposal cancellation")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function getProposalCancelButtonLabel({
  isConfirmed,
  isConfirming,
  isSimulating,
  isSwitchingChain,
  isWriting,
}: ProposalCancelButtonLabelInput): string {
  if (isConfirmed) return "Proposal Canceled";
  if (isConfirming) return "Confirming";
  if (isWriting) return "Canceling";
  if (isSwitchingChain) return "Switching";
  if (isSimulating) return "Checking";
  return "Cancel Proposal";
}
