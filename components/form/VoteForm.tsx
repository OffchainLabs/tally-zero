"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  useAccount,
  useEstimateGas,
  useReadContract,
  useSendTransaction,
} from "wagmi";

import { Button } from "@components/ui/Button";
import { Card, CardContent } from "@components/ui/Card";
import { DialogClose, DialogFooter } from "@components/ui/Dialog";
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
import { ReloadIcon } from "@radix-ui/react-icons";

import type { VoteSupport } from "@gzeoneth/gov-tracker";
import {
  VOTE_SUPPORT,
  prepareCastVote,
  readVotingPower,
} from "@gzeoneth/gov-tracker";

import { ARB_TOKEN } from "@config/arbitrum-governance";
import { proposalSchema, voteSchema } from "@config/schema";
import { getSimulationErrorMessage } from "@lib/error-utils";
import { formatVotingPower } from "@lib/format-utils";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

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

  const voteValue = form.watch("vote");

  const startBlock = proposal.startBlock
    ? BigInt(proposal.startBlock)
    : undefined;
  const { data: rawVotingPower, isLoading: isLoadingVotingPower } =
    useReadContract({
      ...readVotingPower(
        address ?? "0x0000000000000000000000000000000000000000",
        startBlock ?? BigInt(0),
        ARB_TOKEN.address
      ),
      query: {
        enabled: isConnected && !!address && !!startBlock,
      },
    });
  const votingPower = rawVotingPower as bigint | undefined;

  const prepared = useMemo(() => {
    if (!voteValue) return undefined;
    const support = parseInt(voteValue) as VoteSupport;
    return prepareCastVote(proposal.id, support, proposal.contractAddress);
  }, [proposal.id, proposal.contractAddress, voteValue]);

  const { error: estimateError, isError: isEstimateError } = useEstimateGas({
    to: prepared?.to,
    data: prepared?.data,
    query: { enabled: !!prepared && isConnected },
  });

  const simulationErrorMessage = useMemo(() => {
    if (!isEstimateError || !estimateError) return null;
    return getSimulationErrorMessage(estimateError);
  }, [isEstimateError, estimateError]);
  const isActiveProposal = proposal.state.toLowerCase() === "active";

  const {
    data: hash,
    isPending: isLoading,
    isSuccess,
    sendTransaction,
  } = useSendTransaction();

  useEffect(() => {
    if (hash) {
      toast("Your vote has been submitted.");
    }
  }, [hash]);

  function onSubmit(_values: z.infer<typeof voteSchema>) {
    if (!prepared) return;
    sendTransaction({
      to: prepared.to,
      data: prepared.data,
    });
  }

  return (
    <Card variant="glass" className="border-0 -m-4 mt-2">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="grid gap-1">
            {/* Voting Power Display */}
            {isConnected && (
              <div className="mb-4 p-3 glass-subtle backdrop-blur rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Your Voting Power (at snapshot)
                  </span>
                  <span className="text-sm font-semibold">
                    {isLoadingVotingPower ? (
                      <span className="text-muted-foreground">Loading...</span>
                    ) : votingPower !== undefined ? (
                      <span>{formatVotingPower(votingPower)} ARB</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </span>
                </div>
                {votingPower !== undefined && votingPower === BigInt(0) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    You need to delegate ARB tokens to yourself or receive
                    delegation to vote.
                  </p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="vote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What would you like to vote?</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <div className="-mx-2 flex items-start space-x-4 rounded-md transition-all hover:bg-white/20 dark:hover:bg-white/10 hover:backdrop-blur-sm">
                        <FormItem className="flex items-center space-x-3 space-y-0 py-2 px-2">
                          <FormControl>
                            <RadioGroupItem value={String(VOTE_SUPPORT.FOR)} />
                          </FormControl>
                          <FormLabel className="font-normal">
                            I&apos;m in favor of this proposal
                          </FormLabel>
                        </FormItem>
                      </div>
                      <div className="-mx-2 flex items-start space-x-4 rounded-md transition-all hover:bg-white/20 dark:hover:bg-white/10 hover:backdrop-blur-sm">
                        <FormItem className="flex items-center space-x-3 space-y-0  py-2 px-2">
                          <FormControl>
                            <RadioGroupItem
                              value={String(VOTE_SUPPORT.AGAINST)}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Against the proposal
                          </FormLabel>
                        </FormItem>
                      </div>
                      <div className="-mx-2 flex items-start space-x-4 rounded-md transition-all hover:bg-white/20 dark:hover:bg-white/10 hover:backdrop-blur-sm">
                        <FormItem className="flex items-center space-x-3 space-y-0 py-2 px-2">
                          <FormControl>
                            <RadioGroupItem
                              value={String(VOTE_SUPPORT.ABSTAIN)}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">
                            I&apos;m abstaining
                          </FormLabel>
                        </FormItem>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    Your vote will be public and cannot be changed.
                  </FormDescription>
                  <FormMessage />
                  {simulationErrorMessage && voteValue && (
                    <p className="text-sm text-red-500 dark:text-red-400 mt-2">
                      {simulationErrorMessage}
                    </p>
                  )}
                </FormItem>
              )}
            />
          </CardContent>

          <DialogFooter>
            {variant === "modal" ? (
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => form.reset()}
              >
                Clear
              </Button>
            )}

            {isActiveProposal ? (
              isLoading ? (
                <Button variant="secondary" disabled>
                  <ReloadIcon className="w-4 h-4 mr-2 animate-spin" />
                  Voting
                </Button>
              ) : isSuccess ? (
                <Button variant="secondary" disabled>
                  Voted
                </Button>
              ) : (
                <Button type="submit" disabled={!prepared || isEstimateError}>
                  Vote
                </Button>
              )
            ) : (
              <Button variant="destructive" disabled>
                Cannot vote
              </Button>
            )}
          </DialogFooter>
        </form>
      </Form>
    </Card>
  );
}
