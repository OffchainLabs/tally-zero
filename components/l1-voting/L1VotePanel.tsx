"use client";

import { useAppKit } from "@reown/appkit/react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Address, Hex } from "viem";
import { formatUnits, getAddress, isAddressEqual } from "viem";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSignTypedData,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/Button";
import { l1VotingChainId } from "@/config/chains";
import { L1ArbitrumGovernorAbi } from "@/data/abis/L1ArbitrumGovernorAbi";
import { useEnsureChain } from "@/hooks/use-ensure-chain";
import { useVotePlanSource } from "@/hooks/use-vote-plan-source";
import { getErrorMessage, isUserRejectedError } from "@/lib/error-utils";
import { l1VotingApi, type VotePlan } from "@/lib/l1-voting/api";
import {
  type PlanProgress,
  runVotePlan,
  VotePlanBlockedError,
} from "@/lib/l1-voting/run-plan";
import { type PinnedDeployment, UnsafePlanError } from "@/lib/l1-voting/trust";

const SUPPORT = [
  { value: 1, label: "For" },
  { value: 0, label: "Against" },
  { value: 2, label: "Abstain" },
] as const;

type StepRow = { key: string; label: string; status: "running" | "done" };

/**
 * Vote on an L1 voting proposal. A vote plan lists what is still missing before the connected
 * address can vote for a delegate (its L1 claim, a checkpoint, a signature, a bundle of proofs);
 * the panel sends each in turn and then the vote, re-reading the plan after every step.
 *
 * The plan comes from the indexer, or (the "own RPCs" option) is built in the browser by the same
 * library from the user's Ethereum RPC and an Arbitrum archive RPC. Either way every step is
 * checked against the pinned deployment before the wallet sees it, and the vote goes to the
 * pinned governor.
 */
export function L1VotePanel({
  proposalId,
  governorAddress,
  deployment,
  blockedReason,
}: {
  proposalId: string;
  governorAddress: string;
  deployment: PinnedDeployment | null | undefined;
  /** Set when the page could not confirm the proposal's content on Ethereum. */
  blockedReason?: string | null;
}) {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const chainId = l1VotingChainId();
  const publicClient = usePublicClient({ chainId });
  const { ensure } = useEnsureChain(chainId);
  const { sendTransactionAsync } = useSendTransaction();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const [support, setSupport] = useState<number>(1);
  const [delegate, setDelegate] = useState<Address | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [running, setRunning] = useState(false);
  const [voteTx, setVoteTx] = useState<Hex | null>(null);
  const [lastPlan, setLastPlan] = useState<VotePlan | null>(null);
  const plans = useVotePlanSource({ proposalId, deployment, l1: publicClient });
  const {
    source,
    setSource,
    ownRpcs,
    storedArchiveRpc,
    setArchiveRpc,
    delegateInput,
    setDelegateInput,
  } = plans;

  const governorMismatch =
    !!deployment &&
    !isAddressEqual(governorAddress as Address, deployment.governor);

  // Delegates this address may vote for: itself, and any delegate whose Arbitrum One claim names
  // it (or, with own RPCs, one the voter types).
  const { data: registered } = useQuery({
    queryKey: ["l1-voting", "registrations"],
    queryFn: () => l1VotingApi.registrations(),
    enabled: isConnected,
  });
  const choices = useMemo(() => {
    if (!address) return [];
    // The indexer serves lowercase addresses; offer them checksummed, like the wallet's own.
    const named = (registered ?? [])
      .filter((r) => isAddressEqual(r.l1Address, address))
      .map((r) => getAddress(r.l2Delegate));
    return [address, ...named.filter((d) => !isAddressEqual(d, address))];
  }, [address, registered]);
  const forDelegate = plans.typedDelegate ?? delegate ?? choices[0] ?? null;

  const ready = !!forDelegate && !!address && !governorMismatch && plans.ready;
  const {
    data: plan,
    error: planError,
    refetch,
  } = useQuery({
    queryKey: [
      "l1-voting",
      "vote-plan",
      ...plans.key,
      proposalId,
      forDelegate,
      address,
    ],
    queryFn: () => plans.fetchPlan(forDelegate!, address!),
    enabled: ready && !running,
    refetchInterval: running ? false : 15_000,
    retry: (count, error) => !(error instanceof UnsafePlanError) && count < 1,
  });
  const shown = lastPlan ?? plan;
  const unsafe = planError instanceof UnsafePlanError ? planError : null;
  const proofUnavailable = !!shown?.blockers.some(
    (b) => b.code === "PROOF_UNAVAILABLE"
  );
  const indexerTrouble =
    !ownRpcs && ((planError && !unsafe) || proofUnavailable);

  async function vote() {
    if (!address || !forDelegate || !publicClient || !deployment) return;
    setRunning(true);
    setSteps([]);
    setVoteTx(null);
    try {
      await ensure();
      const onProgress = (event: PlanProgress) => {
        if (event.type === "plan") setLastPlan(event.plan);
        if (event.type === "replan")
          toast.info("The chain moved on; re-checking what is left to send.", {
            id: "l1-vote-replan",
          });
        if (event.type === "step")
          setSteps((rows) => [
            ...rows.filter((r) => r.key !== `${event.step.kind}`),
            {
              key: event.step.kind,
              label: event.step.label,
              status: event.status,
            },
          ]);
        if (event.type === "vote")
          setSteps((rows) => [
            ...rows.filter((r) => r.key !== "vote"),
            { key: "vote", label: "Cast your vote", status: event.status },
          ]);
      };
      const tx = await runVotePlan({
        fetchPlan: (signature) =>
          plans.fetchPlan(forDelegate, address, signature),
        sendStep: async (step) => {
          const hash = await sendTransactionAsync({
            to: step.to!,
            data: step.data!,
            chainId,
          });
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
          });
          if (receipt.status !== "success")
            throw new Error(`${step.label} failed on chain`);
          return hash;
        },
        signTypedData: (typedData) =>
          signTypedDataAsync(
            typedData as unknown as Parameters<typeof signTypedDataAsync>[0]
          ),
        waitForBlock: async (block) => {
          while ((await publicClient.getBlockNumber()) < block)
            await new Promise((r) => setTimeout(r, 2_000));
        },
        // The pinned governor, never an address from the plan.
        castVote: async () => {
          const hash = await writeContractAsync({
            address: deployment.governor,
            abi: L1ArbitrumGovernorAbi,
            functionName: "castVote",
            args: [BigInt(proposalId), support],
            chainId,
          });
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
          });
          if (receipt.status !== "success")
            throw new Error("Vote failed on chain");
          return hash;
        },
        onProgress,
        isUserRejection: (error) =>
          isUserRejectedError(error) || error instanceof UnsafePlanError,
      });
      setVoteTx(tx);
      toast.success("Vote cast on Ethereum");
    } catch (error) {
      if (
        error instanceof VotePlanBlockedError ||
        error instanceof UnsafePlanError
      ) {
        toast.error(error.message, { id: "l1-vote" });
      } else if (!isUserRejectedError(error)) {
        toast.error(getErrorMessage(error, "vote"), { id: "l1-vote" });
      }
    } finally {
      setRunning(false);
      setLastPlan(null);
      void refetch();
    }
  }

  if (!isConnected)
    return (
      <div
        data-testid="l1-vote-panel"
        className="rounded-lg border p-4 space-y-3"
      >
        <p className="text-sm text-muted-foreground">
          Connect the Ethereum address that votes for your delegate.
        </p>
        <Button onClick={() => open()}>Connect wallet</Button>
      </div>
    );

  const power = shown?.provenVotingPower
    ? Number(formatUnits(BigInt(shown.provenVotingPower), 18)).toLocaleString()
    : null;
  const stopReason =
    deployment === null
      ? "L1 voting is not deployed on this network."
      : governorMismatch
        ? "This page's governor is not the L1 voting governor this site knows, so voting is disabled."
        : (blockedReason ?? null);

  return (
    <div
      data-testid="l1-vote-panel"
      data-plan-source={source}
      className="rounded-lg border p-4 space-y-4"
    >
      <div className="space-y-1">
        <h3 className="font-semibold">Vote on Ethereum</h3>
        <p className="text-xs text-muted-foreground">
          Votes count each delegate&apos;s Arbitrum voting power as of the
          confirmed state the snapshot is locked to, about a week before the
          lock on mainnet.
        </p>
      </div>

      {stopReason ? (
        <p data-testid="l1-vote-stopped" className="text-sm text-destructive">
          {stopReason}
        </p>
      ) : null}

      {choices.length > 1 && !plans.typedDelegate && (
        <label className="block text-sm space-y-1">
          <span>Voting for</span>
          <select
            data-testid="l1-vote-delegate"
            className="w-full rounded border bg-background p-2 font-mono text-xs"
            value={forDelegate ?? ""}
            onChange={(e) => setDelegate(e.target.value as Address)}
          >
            {choices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex gap-2" role="radiogroup" aria-label="Support">
        {SUPPORT.map((s) => (
          <Button
            key={s.value}
            type="button"
            data-testid={`l1-vote-support-${s.label.toLowerCase()}`}
            variant={support === s.value ? "default" : "outline"}
            onClick={() => setSupport(s.value)}
            disabled={running}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {power && (
        <p className="text-sm" data-testid="l1-vote-power">
          Voting power at the snapshot: <strong>{power} ARB</strong>
        </p>
      )}

      {unsafe ? (
        <div
          data-testid="l1-vote-unsafe"
          className="text-sm text-destructive space-y-1"
        >
          <p className="font-semibold">
            The vote plan asked for a transaction this site doesn&apos;t
            recognise, so nothing was sent.
          </p>
          <ul className="list-disc pl-4 text-xs">
            {unsafe.violations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      ) : planError && !running ? (
        <p data-testid="l1-vote-error" className="text-sm text-destructive">
          Could not load what is left to send ({planError.message}). Retrying…
        </p>
      ) : null}

      {shown?.blockers.length ? (
        <ul
          data-testid="l1-vote-blockers"
          className="text-sm text-destructive space-y-1"
        >
          {shown.blockers.map((b) => (
            <li key={b.code} data-code={b.code}>
              {b.message}
            </li>
          ))}
        </ul>
      ) : null}

      {ownRpcs && proofUnavailable ? (
        <p
          data-testid="l1-vote-archive-hint"
          className="text-xs text-muted-foreground"
        >
          A vote is proven against Arbitrum state from about a week ago. If this
          keeps failing, your Arbitrum RPC is probably not an archive node.
        </p>
      ) : null}

      {(indexerTrouble || unsafe) && !ownRpcs ? (
        <Button
          type="button"
          variant="outline"
          data-testid="l1-vote-use-own-rpcs"
          onClick={() => setSource("own")}
        >
          Build my vote with my own RPCs instead
        </Button>
      ) : null}

      {!running && shown && !shown.blockers.length && !unsafe && (
        <ol className="text-sm space-y-1" data-testid="l1-vote-plan">
          {shown.steps.map((s) => (
            <li key={s.kind} data-kind={s.kind}>
              {s.label}
              {s.calls && s.calls.length > 1
                ? ` (${s.calls.length} calls)`
                : ""}
            </li>
          ))}
          <li data-kind="vote">Cast your vote</li>
        </ol>
      )}

      {steps.length > 0 && (
        <ol className="text-sm space-y-1" data-testid="l1-vote-progress">
          {steps.map((s) => (
            <li
              key={s.key}
              data-kind={s.key}
              data-status={s.status}
              className="flex items-center gap-2"
            >
              {s.status === "done" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {voteTx ? (
        <p
          data-testid="l1-vote-done"
          className="text-sm text-green-700 break-all"
        >
          Vote cast: {voteTx}
        </p>
      ) : (
        <Button
          data-testid="l1-vote-submit"
          onClick={vote}
          disabled={
            running ||
            !!stopReason ||
            !!unsafe ||
            !shown ||
            shown.blockers.length > 0
          }
        >
          {running ? "Voting…" : "Vote"}
        </Button>
      )}

      <details
        className="text-xs space-y-2"
        open={ownRpcs}
        data-testid="l1-vote-advanced"
      >
        <summary className="cursor-pointer text-muted-foreground">
          Advanced: vote without the indexer
        </summary>
        <label className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            data-testid="l1-vote-own-rpcs"
            checked={ownRpcs}
            disabled={running}
            onChange={(e) => setSource(e.target.checked ? "own" : "indexer")}
          />
          <span>Build my vote myself, with my own RPCs</span>
        </label>
        {ownRpcs && (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              The plan is built in this browser from your Ethereum RPC (in
              settings) and an Arbitrum archive RPC, with the same code the
              indexer runs. The indexer is not used.
            </p>
            <label className="block space-y-1">
              <span>Arbitrum archive RPC</span>
              <input
                data-testid="l1-vote-archive-rpc"
                type="url"
                className="w-full rounded border bg-background p-2 font-mono"
                placeholder="https://… (needs state from about a week ago)"
                value={storedArchiveRpc}
                onChange={(e) => setArchiveRpc(e.target.value.trim())}
              />
            </label>
            <label className="block space-y-1">
              <span>Delegate (Arbitrum One), if not yourself</span>
              <input
                data-testid="l1-vote-delegate-input"
                className="w-full rounded border bg-background p-2 font-mono"
                placeholder={address}
                value={delegateInput}
                onChange={(e) => setDelegateInput(e.target.value.trim())}
              />
            </label>
          </div>
        )}
      </details>
    </div>
  );
}
