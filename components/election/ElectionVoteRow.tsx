"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useEstimateGas,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";

import type { PreparedTransaction } from "@gzeoneth/gov-tracker";
import { prepareNomineeElectionVote } from "@gzeoneth/gov-tracker";

import { ReloadIcon } from "@radix-ui/react-icons";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { utils as ethersUtils } from "ethers";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { getSimulationErrorMessage } from "@/lib/error-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";

type PrepareVoteFn = (
  proposalId: string,
  target: string,
  votes: string,
  reason: string,
  governorAddress: string,
  chainId?: number
) => PreparedTransaction;

interface ElectionVoteRowProps {
  proposalId: string;
  targetAddress: string;
  governorAddress: `0x${string}`;
  chainId?: number;
  availableVotes: bigint | undefined;
  onVoteSuccess: () => void;
  infoSlot?: React.ReactNode;
  bypassSimulation?: boolean;
  prepareVote?: PrepareVoteFn;
}

export function ElectionVoteRow({
  proposalId,
  targetAddress,
  governorAddress,
  chainId,
  availableVotes,
  onVoteSuccess,
  infoSlot,
  bypassSimulation = false,
  prepareVote = prepareNomineeElectionVote,
}: ElectionVoteRowProps): React.ReactElement {
  const [amount, setAmount] = useState("");
  const label = getDelegateLabel(targetAddress);
  const explorerUrl = getAddressExplorerUrl(targetAddress);

  const voteAmountWei = useMemo(() => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return undefined;
    try {
      return ethersUtils.parseEther(amount).toBigInt();
    } catch {
      return undefined;
    }
  }, [amount]);

  const prepared = useMemo(() => {
    if (!voteAmountWei) return undefined;
    return prepareVote(
      proposalId,
      targetAddress,
      voteAmountWei.toString(),
      "",
      governorAddress,
      chainId
    );
  }, [
    proposalId,
    targetAddress,
    voteAmountWei,
    governorAddress,
    chainId,
    prepareVote,
  ]);

  const { error: estimateError, isError: isEstimateError } = useEstimateGas({
    to: prepared?.to,
    data: prepared?.data,
    query: { enabled: !!prepared },
  });

  const simulationErrorMessage = useMemo(() => {
    if (!isEstimateError || !estimateError) return null;
    return getSimulationErrorMessage(estimateError);
  }, [isEstimateError, estimateError]);

  const {
    data: txHash,
    isPending: isWriting,
    sendTransaction,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const onVoteSuccessRef = useRef(onVoteSuccess);
  onVoteSuccessRef.current = onVoteSuccess;

  useEffect(() => {
    if (isConfirmed) {
      toast(`Vote confirmed for ${label || shortenAddress(targetAddress)}`);
      setAmount("");
      onVoteSuccessRef.current();
    }
  }, [isConfirmed, label, targetAddress]);

  const handleVote = useCallback(() => {
    if (!prepared) return;
    if (!isEstimateError || bypassSimulation) {
      sendTransaction({
        to: prepared.to,
        data: prepared.data,
      });
    }
  }, [prepared, isEstimateError, bypassSimulation, sendTransaction]);

  const exceedsAvailable =
    voteAmountWei !== undefined &&
    availableVotes !== undefined &&
    voteAmountWei > availableVotes;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {label ? (
            <span className="text-sm font-medium truncate">{label}</span>
          ) : (
            <span className="font-mono text-xs">
              {shortenAddress(targetAddress)}
            </span>
          )}
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {infoSlot}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            placeholder="Amount (ARB)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            variant="glass"
            className="h-8 text-sm pr-12"
            min="0"
            step="any"
          />
          {availableVotes !== undefined && availableVotes > BigInt(0) && (
            <button
              type="button"
              onClick={() =>
                setAmount(ethersUtils.formatEther(availableVotes.toString()))
              }
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary hover:text-primary/80 font-medium"
            >
              Max
            </button>
          )}
        </div>
        {isWriting || isConfirming ? (
          <Button size="sm" disabled className="shrink-0">
            <ReloadIcon className="h-3 w-3 mr-1 animate-spin" />
            {isConfirming ? "Confirming" : "Voting"}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleVote}
            disabled={
              !prepared ||
              (isEstimateError && !bypassSimulation) ||
              exceedsAvailable
            }
            className="shrink-0"
          >
            Vote
          </Button>
        )}
      </div>

      {voteAmountWei !== undefined && !exceedsAvailable && (
        <p className="text-xs text-muted-foreground">
          Voting {formatVotingPower(voteAmountWei)} ARB for{" "}
          {label || shortenAddress(targetAddress)}
        </p>
      )}

      {exceedsAvailable && (
        <p className="text-xs text-red-500">Exceeds available voting power</p>
      )}
      {simulationErrorMessage &&
        amount &&
        !exceedsAvailable &&
        !bypassSimulation && (
          <p className="text-xs text-red-500 dark:text-red-400">
            {simulationErrorMessage}
          </p>
        )}
    </div>
  );
}
