"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWriteContract,
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

import { ARB_TOKEN } from "@config/arbitrum-governance";
import { proposalSchema, voteSchema } from "@config/schema";
import { formatVotingPower } from "@lib/format-utils";
import { toast } from "sonner";

import OZ_Governor_ABI from "@data/OzGovernor_ABI.json";
import { delay } from "@lib/delay-utils";
import { getSimulationErrorMessage } from "@lib/error-utils";
import { useEffect, useMemo } from "react";

const ERC20_VOTES_ABI = [
  {
    inputs: [
      { name: "account", type: "address" },
      { name: "blockNumber", type: "uint256" },
    ],
    name: "getPastVotes",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export default function VoteForm({
  proposal,
}: {
  proposal: z.infer<typeof proposalSchema>;
}) {
  const { address, isConnected } = useAccount();

  const form = useForm<z.infer<typeof voteSchema>>({
    resolver: zodResolver(voteSchema),
  });

  const voteValue = form.watch("vote");

  const startBlock = proposal.startBlock
    ? BigInt(proposal.startBlock)
    : undefined;
  const { data: votingPower, isLoading: isLoadingVotingPower } =
    useReadContract({
      address: ARB_TOKEN.address as `0x${string}`,
      abi: ERC20_VOTES_ABI,
      functionName: "getPastVotes",
      args: address && startBlock ? [address, startBlock] : undefined,
      query: {
        enabled: isConnected && !!address && !!startBlock,
      },
    });

  const {
    data: simulateData,
    error: prepareError,
    isError: isPrepareError,
  } = useSimulateContract({
    abi: OZ_Governor_ABI,
    address: `0x${proposal.contractAddress.slice(2)}` as `0x${string}`,
    functionName: "castVote",
    args: [BigInt(proposal.id), voteValue ? parseInt(voteValue) : 0],
    query: {
      enabled: !!voteValue && isConnected,
    },
  });

  // Parse simulation error for user-friendly display
  const simulationErrorMessage = useMemo(() => {
    if (!isPrepareError || !prepareError) return null;
    return getSimulationErrorMessage(prepareError);
  }, [isPrepareError, prepareError]);

  const {
    data: hash,
    isPending: isLoading,
    isSuccess,
    writeContract,
  } = useWriteContract();

  useEffect(() => {
    if (hash) {
      toast("Your vote has been submitted.");
    }
  }, [hash]);

  async function onSubmit(_values: z.infer<typeof voteSchema>) {
    await delay(500);
    if (simulateData?.request) {
      writeContract(simulateData.request);
    }
  }

  return (
    <Card variant="glass" className="border-0 -m-4 mt-2">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="grid gap-1">
            {/* Voting Power Display */}
            {isConnected && (
              <div className="mb-4 p-3 glass-subtle rounded-lg">
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
                            <RadioGroupItem value="1" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            I&apos;m in favor of this proposal
                          </FormLabel>
                        </FormItem>
                      </div>
                      <div className="-mx-2 flex items-start space-x-4 rounded-md transition-all hover:bg-white/20 dark:hover:bg-white/10 hover:backdrop-blur-sm">
                        <FormItem className="flex items-center space-x-3 space-y-0  py-2 px-2">
                          <FormControl>
                            <RadioGroupItem value="0" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Against the proposal
                          </FormLabel>
                        </FormItem>
                      </div>
                      <div className="-mx-2 flex items-start space-x-4 rounded-md transition-all hover:bg-white/20 dark:hover:bg-white/10 hover:backdrop-blur-sm">
                        <FormItem className="flex items-center space-x-3 space-y-0 py-2 px-2">
                          <FormControl>
                            <RadioGroupItem value="2" />
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
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>

            {proposal.state === "active" ? (
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
                <Button type="submit" disabled={!simulateData?.request}>
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
