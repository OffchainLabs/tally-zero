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
import Link from "next/link";
import { toast } from "sonner";

import { utils as ethersUtils } from "ethers";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getSimulationErrorMessage } from "@/lib/error-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { useAddressDisplayRecord } from "@/lib/tally-data/client";

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
  labelOverride?: string;
  profileUrl?: string;
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
  labelOverride,
  profileUrl,
}: ElectionVoteRowProps): React.ReactElement {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const display = useAddressDisplayRecord(targetAddress);
  const label = labelOverride ?? display?.label;
  const resolvedProfileUrl = profileUrl ?? display?.profileUrl ?? undefined;
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
      reason,
      governorAddress,
      chainId
    );
  }, [
    proposalId,
    targetAddress,
    voteAmountWei,
    reason,
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
      setReason("");
      onVoteSuccessRef.current();
    }
  }, [isConfirmed, label, targetAddress]);

  const handleVote = useCallback(() => {
    if (!prepared) return;
    if (!isEstimateError || bypassSimulation) {
      sendTransaction({ to: prepared.to, data: prepared.data });
    }
  }, [prepared, isEstimateError, bypassSimulation, sendTransaction]);

  const exceedsAvailable =
    voteAmountWei !== undefined &&
    availableVotes !== undefined &&
    voteAmountWei > availableVotes;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        {resolvedProfileUrl ? (
          <Link
            href={resolvedProfileUrl}
            className="text-sm font-medium truncate text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary transition-colors"
          >
            {label ?? shortenAddress(targetAddress)}
          </Link>
        ) : label ? (
          <span className="text-sm font-medium truncate">{label}</span>
        ) : (
          <span className="font-mono text-xs">
            {shortenAddress(targetAddress)}
          </span>
        )}
        {!resolvedProfileUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {infoSlot}

      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Amount (ARB)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          variant="glass"
          className="h-8 text-sm flex-1"
          min="0"
          step="any"
        />
        {availableVotes !== undefined && availableVotes > BigInt(0) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setAmount(ethersUtils.formatEther(availableVotes.toString()))
            }
            className="shrink-0 text-xs h-8"
          >
            MAX
          </Button>
        )}
        {isWriting || isConfirming ? (
          <Button size="sm" disabled className="shrink-0 h-8">
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
            className="shrink-0 h-8"
          >
            Vote
          </Button>
        )}
      </div>

      <textarea
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
      />

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
