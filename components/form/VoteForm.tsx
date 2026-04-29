"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { zeroAddress } from "viem";
import { z } from "zod";

import {
  useAccount,
  useEstimateGas,
  useReadContract,
  useSendTransaction,
} from "wagmi";

import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { DialogFooter } from "@components/ui/Dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@components/ui/Form";
import { RadioGroup, RadioGroupItem } from "@components/ui/RadioGroup";
import { cn } from "@lib/utils";
import { ReloadIcon } from "@radix-ui/react-icons";

import type { VoteSupport } from "@gzeoneth/gov-tracker";
import {
  VOTE_SUPPORT,
  prepareCastVote,
  readVotingPower,
} from "@gzeoneth/gov-tracker";

import { useProposalHasVoted } from "@/hooks/use-proposal-has-voted";
import { useUserVote } from "@/hooks/use-user-vote";
import { VOTE_COLORS } from "@/lib/badge-colors";
import { ARB_TOKEN } from "@config/arbitrum-governance";
import { proposalSchema, voteSchema } from "@config/schema";
import { getSimulationErrorMessage } from "@lib/error-utils";
import { formatVotingPower } from "@lib/format-utils";

const VOTE_OPTIONS = [
  { label: "For", value: String(VOTE_SUPPORT.FOR) },
  { label: "Against", value: String(VOTE_SUPPORT.AGAINST) },
  { label: "Abstain", value: String(VOTE_SUPPORT.ABSTAIN) },
] as const;

export default function VoteForm({
  proposal,
  variant = "modal",
}: {
  proposal: z.infer<typeof proposalSchema>;
  variant?: "modal" | "page";
}) {
  const { address, isConnected } = useAccount();

  const form = useForm<z.infer<typeof voteSchema>>({
    resolver: zodResolver(voteSchema),
  });

  const selectedVote = form.watch("vote");
  const accountAddress = address ?? zeroAddress;
  const governorAddress = proposal.contractAddress as `0x${string}`;
  const startBlock = proposal.startBlock
    ? BigInt(proposal.startBlock)
    : undefined;
  const canReadAccountData = isConnected && !!address;
  const isPageVariant = variant === "page";
  const isActiveProposal = proposal.state.toLowerCase() === "active";

  const { data: rawVotingPower, isLoading: isLoadingVotingPower } =
    useReadContract({
      ...readVotingPower(
        accountAddress,
        startBlock ?? BigInt(0),
        ARB_TOKEN.address
      ),
      query: {
        enabled: canReadAccountData && startBlock !== undefined,
      },
    });
  const votingPower = rawVotingPower as bigint | undefined;

  const { hasVoted, hasRecordedVote, isLoadingHasVoted } = useProposalHasVoted({
    proposalId: proposal.id,
    governorAddress,
  });

  const { data: userVote, isLoading: isLoadingUserVote } = useUserVote({
    proposalId: proposal.id,
    governorAddress,
    voter: address,
    enabled: hasRecordedVote,
  });

  const voteTransaction = useMemo(() => {
    if (!selectedVote) return undefined;

    const support = Number.parseInt(selectedVote, 10) as VoteSupport;
    return prepareCastVote(proposal.id, support, governorAddress);
  }, [governorAddress, proposal.id, selectedVote]);

  const { error: estimateError, isError: isEstimateError } = useEstimateGas({
    to: voteTransaction?.to,
    data: voteTransaction?.data,
    query: { enabled: !!voteTransaction && isConnected },
  });

  const simulationErrorMessage =
    isEstimateError && estimateError
      ? getSimulationErrorMessage(estimateError)
      : null;

  const {
    data: transactionHash,
    isPending: isSubmittingVote,
    isSuccess: isVoteSubmitted,
    sendTransaction,
  } = useSendTransaction();

  useEffect(() => {
    if (transactionHash) {
      toast("Your vote has been submitted.");
    }
  }, [transactionHash]);

  function handleSubmitVote(_values: z.infer<typeof voteSchema>) {
    if (!voteTransaction) return;

    sendTransaction({
      to: voteTransaction.to,
      data: voteTransaction.data,
    });
  }

  const showVoteForm = !hasRecordedVote;
  const showZeroVotingPowerHint = votingPower === BigInt(0);

  const voteActionButton = !isActiveProposal ? (
    <Button variant="destructive" disabled>
      Cannot vote
    </Button>
  ) : isSubmittingVote ? (
    <Button variant="secondary" disabled>
      <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
      Voting
    </Button>
  ) : isVoteSubmitted ? (
    <Button variant="secondary" disabled>
      Voted
    </Button>
  ) : (
    <Button type="submit" disabled={!voteTransaction || isEstimateError}>
      Vote
    </Button>
  );

  const body = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmitVote)}>
        <div className={cn("grid gap-1", !isPageVariant && "p-6 pt-0")}>
          {isConnected && (
            <div className="glass-subtle backdrop-blur rounded-lg p-4 space-y-3">
              <VoteInfoRow
                label="Your Voting Power (at snapshot)"
                isLoading={isLoadingVotingPower}
              >
                {votingPower !== undefined ? (
                  <span>{formatVotingPower(votingPower)} ARB</span>
                ) : null}
              </VoteInfoRow>
              <VoteInfoRow label="Already voted" isLoading={isLoadingHasVoted}>
                {hasVoted !== undefined ? (
                  <span>{hasVoted ? "Yes" : "No"}</span>
                ) : null}
              </VoteInfoRow>
              {hasRecordedVote && (
                <>
                  <VoteInfoRow label="Your vote" isLoading={isLoadingUserVote}>
                    {userVote ? (
                      <VoteSupportLabel support={userVote.support} />
                    ) : null}
                  </VoteInfoRow>
                  <VoteInfoRow
                    label="Voting power spent"
                    isLoading={isLoadingUserVote}
                  >
                    {userVote ? (
                      <span>{formatVotingPower(userVote.weight)} ARB</span>
                    ) : null}
                  </VoteInfoRow>
                </>
              )}
              {showZeroVotingPowerHint && (
                <p className="text-xs text-muted-foreground">
                  You need to delegate ARB tokens to yourself or receive
                  delegation to vote.
                </p>
              )}
            </div>
          )}

          {showVoteForm && (
            <FormField
              control={form.control}
              name="vote"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>Cast Your Vote</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col space-y-1"
                    >
                      {VOTE_OPTIONS.map((option) => (
                        <VoteOption
                          key={option.value}
                          label={option.label}
                          value={option.value}
                        />
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    Your vote will be public and cannot be changed.
                  </FormDescription>
                  <FormMessage />
                  {simulationErrorMessage && selectedVote && (
                    <p className="mt-2 text-sm text-red-500 dark:text-red-400">
                      {simulationErrorMessage}
                    </p>
                  )}
                </FormItem>
              )}
            />
          )}
        </div>

        {showVoteForm && (
          <DialogFooter className={cn(isPageVariant && "pt-4")}>
            {voteActionButton}
          </DialogFooter>
        )}
      </form>
    </Form>
  );

  if (isPageVariant) {
    return body;
  }

  return (
    <Card variant="glass" className="border-0 py-4">
      {body}
    </Card>
  );
}

function VoteInfoRow({
  label,
  isLoading,
  children,
}: {
  label: string;
  isLoading?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">
        <VoteInfoValue isLoading={isLoading}>{children}</VoteInfoValue>
      </span>
    </div>
  );
}

function VoteInfoValue({
  isLoading,
  children,
}: {
  isLoading?: boolean;
  children?: ReactNode;
}) {
  if (isLoading) {
    return <span className="text-muted-foreground">Loading...</span>;
  }

  if (children == null) {
    return <span className="text-muted-foreground">-</span>;
  }

  return <>{children}</>;
}

function VoteOption({ label, value }: { label: string; value: string }) {
  return (
    <div className="-mx-2 rounded-md transition-all hover:bg-white/20 hover:backdrop-blur-sm dark:hover:bg-white/10">
      <FormItem className="flex items-center space-x-3 space-y-0 px-2 py-2">
        <FormControl>
          <RadioGroupItem value={value} />
        </FormControl>
        <FormLabel className="font-normal">{label}</FormLabel>
      </FormItem>
    </div>
  );
}

function VoteSupportLabel({ support }: { support: number }) {
  if (support === VOTE_SUPPORT.FOR) {
    return <span className={VOTE_COLORS.for.text}>For</span>;
  }
  if (support === VOTE_SUPPORT.AGAINST) {
    return <span className={VOTE_COLORS.against.text}>Against</span>;
  }
  if (support === VOTE_SUPPORT.ABSTAIN) {
    return <span className={VOTE_COLORS.abstain.text}>Abstain</span>;
  }
  return <span className="text-muted-foreground">Unknown</span>;
}
