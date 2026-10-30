"use client";

import { useAppKit } from "@reown/appkit/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type Address,
  encodeFunctionData,
  getAddress,
  type Hex,
  isAddress,
  isAddressEqual,
  zeroAddress,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useSignTypedData,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/Button";
import { l1VotingChainId, l2ChainId } from "@/config/chains";
import { DelegateMappingAbi } from "@/data/abis/DelegateMappingAbi";
import { useEnsureChain } from "@/hooks/use-ensure-chain";
import { useL1VotingDeployment } from "@/hooks/use-l1-voting-deployment";
import { useSiwe } from "@/hooks/use-siwe";
import { getErrorMessage, isUserRejectedError } from "@/lib/error-utils";
import { l1VotingApi } from "@/lib/l1-voting/api";
import {
  approvalsIfExecutedBy,
  execArgs,
  mergedSignatures,
  prevalidatedSignatures,
  readSafeTx,
  SAFE_ABI,
  type SafeTxState,
  safeTxTypedData,
} from "@/lib/l1-voting/safe";
import {
  ecdsaConfirmations,
  safeTxServiceClient,
  safeTxServiceUrl,
} from "@/lib/l1-voting/safe-tx-service";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3 text-sm">
      <span className="text-muted-foreground sm:w-48 shrink-0">{label}</span>
      <span className="font-mono text-xs break-all">{children}</span>
    </div>
  );
}

/**
 * Register for L1 voting. A delegate names, on Arbitrum One, the Ethereum address that votes for
 * it (required for a contract delegate such as a Safe; an EOA delegate can sign at vote time
 * instead), and that Ethereum address accepts the delegate on Ethereum. A Safe delegate's claim
 * goes through the Safe: owners approve the transaction (on chain, or by signing it into the Safe
 * Transaction Service where one serves the chain), and one executes it.
 */
export function L1Registration() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const { effectiveAddress } = useSiwe();
  const l2 = l2ChainId();
  const l1 = l1VotingChainId();
  const l2Client = usePublicClient({ chainId: l2 });
  const l1Client = usePublicClient({ chainId: l1 });
  const ensureL2 = useEnsureChain(l2);
  const ensureL1 = useEnsureChain(l1);
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const serviceUrl = safeTxServiceUrl(l2);
  const service = useMemo(
    () => (serviceUrl ? safeTxServiceClient(serviceUrl) : null),
    [serviceUrl]
  );

  const [delegateInput, setDelegateInput] = useState("");
  const [l1VoterInput, setL1VoterInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [safeTx, setSafeTx] = useState<SafeTxState | null>(null);

  useEffect(() => {
    if (!delegateInput && (effectiveAddress || address))
      setDelegateInput((effectiveAddress ?? address)!);
    if (!l1VoterInput && address) setL1VoterInput(address);
  }, [address, effectiveAddress, delegateInput, l1VoterInput]);

  const delegate = isAddress(delegateInput) ? getAddress(delegateInput) : null;
  const l1Voter = isAddress(l1VoterInput) ? getAddress(l1VoterInput) : null;

  const { deployment, isPending: deploymentPending } = useL1VotingDeployment();
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["l1-voting", "registration", delegate],
    queryFn: () => l1VotingApi.registration(delegate!),
    enabled: !!delegate,
    refetchInterval: 10_000,
  });
  const { data: isContract } = useQuery({
    queryKey: ["l1-voting", "is-contract", delegate],
    queryFn: async () => {
      const code = await l2Client!.getCode({ address: delegate! });
      return !!code && code !== "0x";
    },
    enabled: !!delegate && !!l2Client,
  });
  const { data: myL1Claim, refetch: refetchMyL1Claim } = useQuery({
    queryKey: ["l1-voting", "l1-claim", address],
    queryFn: () =>
      l1Client!.readContract({
        address: deployment!.l1DelegateMapping,
        abi: DelegateMappingAbi,
        functionName: "claimed",
        args: [address!],
      }) as Promise<Address>,
    enabled: !!address && !!deployment && !!l1Client,
  });

  // null: the service has never seen this transaction
  const { data: serviceConfirmations, refetch: refetchConfirmations } =
    useQuery({
      queryKey: ["l1-voting", "safe-service", safeTx?.safeTxHash],
      queryFn: () => service!.confirmations(safeTx!.safeTxHash),
      enabled: !!service && !!safeTx,
      refetchInterval: 15_000,
    });
  const offchainSignatures = serviceConfirmations
    ? ecdsaConfirmations(serviceConfirmations)
    : [];

  async function act(label: string, run: () => Promise<void>) {
    setBusy(label);
    try {
      await run();
    } catch (error) {
      if (!isUserRejectedError(error))
        toast.error(getErrorMessage(error, label), { id: "l1-registration" });
    } finally {
      setBusy(null);
      void refetchStatus();
      void refetchMyL1Claim();
    }
  }

  const claimCall = () => ({
    to: deployment!.l2DelegateMapping,
    data: encodeFunctionData({
      abi: DelegateMappingAbi,
      functionName: "claim",
      args: [l1Voter!],
    }) as Hex,
  });

  async function waitL2(hash: Hex) {
    const receipt = await l2Client!.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw new Error("Transaction failed on chain");
  }

  const claimOnL2 = () =>
    act("claim on Arbitrum", async () => {
      await ensureL2.ensure();
      await waitL2(
        await writeContractAsync({
          address: deployment!.l2DelegateMapping,
          abi: DelegateMappingAbi,
          functionName: "claim",
          args: [l1Voter!],
          chainId: l2,
        })
      );
      toast.success("Claim recorded on Arbitrum One");
    });

  const prepareSafeTx = () =>
    act("prepare Safe transaction", async () => {
      setSafeTx(await readSafeTx(l2Client!, delegate!, claimCall()));
    });

  const refreshSafeTx = async () => {
    if (safeTx)
      setSafeTx(await readSafeTx(l2Client!, safeTx.safe, safeTx.call));
  };

  const approveSafeTx = () =>
    act("approve in Safe", async () => {
      await ensureL2.ensure();
      await waitL2(
        await writeContractAsync({
          address: safeTx!.safe,
          abi: SAFE_ABI,
          functionName: "approveHash",
          args: [safeTx!.safeTxHash],
          chainId: l2,
        })
      );
      await refreshSafeTx();
    });

  /** The connected owner's EIP-712 signature over the Safe transaction */
  async function signSafeTx(state: SafeTxState) {
    // Wallets refuse typed data whose domain chain is not the active one.
    await ensureL2.ensure();
    return signTypedDataAsync({
      account: address,
      ...safeTxTypedData(state, l2),
    });
  }

  const proposeToService = () =>
    act("propose to Safe owners", async () => {
      const signature = await signSafeTx(safeTx!);
      await service!.propose(safeTx!, address!, signature);
      await refetchConfirmations();
      toast.success("Proposed to the Safe's owners");
    });

  const confirmOnService = () =>
    act("sign in the Safe service", async () => {
      const signature = await signSafeTx(safeTx!);
      await service!.confirm(safeTx!.safeTxHash, signature);
      await refetchConfirmations();
    });

  const executeSafeTx = () =>
    act("execute Safe transaction", async () => {
      await ensureL2.ensure();
      const fresh = await readSafeTx(l2Client!, safeTx!.safe, safeTx!.call);
      // Off-chain signatures only count for the transaction they signed.
      const offchain =
        service && fresh.safeTxHash === safeTx!.safeTxHash
          ? ecdsaConfirmations(
              (await service.confirmations(fresh.safeTxHash)) ?? []
            )
          : [];
      await waitL2(
        await writeContractAsync({
          address: fresh.safe,
          abi: SAFE_ABI,
          functionName: "execTransaction",
          args: [
            ...execArgs(fresh.call),
            offchain.length > 0
              ? mergedSignatures(fresh, offchain, address)
              : prevalidatedSignatures(fresh.approvedBy, address),
          ],
          chainId: l2,
        })
      );
      setSafeTx(null);
      toast.success("The Safe recorded its claim on Arbitrum One");
    });

  const claimOnL1 = () =>
    act("accept on Ethereum", async () => {
      await ensureL1.ensure();
      const hash = await writeContractAsync({
        address: deployment!.l1DelegateMapping,
        abi: DelegateMappingAbi,
        functionName: "claim",
        args: [delegate!],
        chainId: l1,
      });
      const receipt = await l1Client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new Error("Transaction failed on chain");
      toast.success("Accepted on Ethereum");
    });

  if (!deploymentPending && !deployment)
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="l1-registration-unavailable"
      >
        L1 voting is not available yet.
      </p>
    );

  if (!isConnected)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Connect the delegate&apos;s wallet (or a Safe owner&apos;s) to
          register for L1 voting.
        </p>
        <Button onClick={() => open()}>Connect wallet</Button>
      </div>
    );

  const owner =
    safeTx && address && safeTx.owners.some((o) => isAddressEqual(o, address));
  const offchainSigners = offchainSignatures.map((s) => s.owner);
  const reachable = safeTx
    ? approvalsIfExecutedBy(safeTx, address, offchainSigners)
    : 0;
  const proposedToService = !!serviceConfirmations;
  const signedOnService =
    !!address && offchainSigners.some((o) => isAddressEqual(o, address));
  const acceptedOnL1 =
    !!myL1Claim &&
    !!delegate &&
    myL1Claim !== zeroAddress &&
    isAddressEqual(myL1Claim, delegate);

  return (
    <div className="space-y-6" data-testid="l1-registration">
      <section className="space-y-3">
        <label className="block text-sm space-y-1">
          <span>Delegate (Arbitrum One)</span>
          <input
            data-testid="l1-reg-delegate"
            className="w-full rounded border bg-background p-2 font-mono text-xs"
            value={delegateInput}
            onChange={(e) => {
              setDelegateInput(e.target.value.trim());
              setSafeTx(null);
            }}
          />
        </label>
        {status && (
          <div
            className="rounded-lg border p-4 space-y-2"
            data-testid="l1-reg-status"
          >
            <Row label="Arbitrum One claim">
              <span data-testid="l1-reg-l2-claim">
                {status.l2Claim
                  ? status.l2Claim.revoked
                    ? "revoked"
                    : status.l2Claim.l1Address
                  : isContract
                    ? "none — required for a contract delegate"
                    : "none (an EOA can sign at vote time instead)"}
              </span>
            </Row>
            {status.l2Claim && !status.l2Claim.revoked && (
              <Row label="Visible on Ethereum">
                <span data-testid="l1-reg-provable">
                  {status.l2ClaimProvable
                    ? "yes"
                    : "not yet — waits for Arbitrum to confirm the block it is in (about a week on mainnet)"}
                </span>
              </Row>
            )}
            <Row label="Accepted on Ethereum by">
              <span data-testid="l1-reg-l1-claimers">
                {status.l1Claimers.length
                  ? status.l1Claimers.map((c) => c.l1Address).join(", ")
                  : "nobody yet"}
              </span>
            </Row>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">
          1. On Arbitrum One: name the voting address
        </h3>
        <label className="block text-sm space-y-1">
          <span>Ethereum address that votes for this delegate</span>
          <input
            data-testid="l1-reg-l1-voter"
            className="w-full rounded border bg-background p-2 font-mono text-xs"
            value={l1VoterInput}
            onChange={(e) => {
              setL1VoterInput(e.target.value.trim());
              setSafeTx(null);
            }}
          />
        </label>
        {isContract ? (
          !safeTx ? (
            <Button
              data-testid="l1-reg-safe-prepare"
              disabled={!delegate || !l1Voter || !deployment || !!busy}
              onClick={prepareSafeTx}
            >
              Create Safe transaction
            </Button>
          ) : (
            <div
              className="rounded-lg border p-4 space-y-2"
              data-testid="l1-reg-safe"
            >
              <Row label="Safe transaction">
                <span data-testid="safe-tx-hash">{safeTx.safeTxHash}</span>
              </Row>
              <Row label="Approvals">
                <span data-testid="safe-approvals">
                  {safeTx.approvedBy.length} of {safeTx.threshold}
                  {owner
                    ? ` (${reachable} counting yours when you execute)`
                    : ""}
                </span>
              </Row>
              {service && (
                <Row label="Signed via Safe service">
                  <span data-testid="safe-service-confirmations">
                    {proposedToService
                      ? offchainSigners.length
                        ? offchainSigners.join(", ")
                        : "nobody yet"
                      : "not proposed yet"}
                  </span>
                </Row>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    act("refresh", async () => {
                      await refreshSafeTx();
                      if (service) await refetchConfirmations();
                    })
                  }
                >
                  Refresh approvals
                </Button>
                {owner && (
                  <Button
                    variant="outline"
                    data-testid="safe-approve"
                    disabled={!!busy}
                    onClick={approveSafeTx}
                  >
                    Approve
                  </Button>
                )}
                {owner && service && !proposedToService && (
                  <Button
                    variant="outline"
                    data-testid="safe-service-propose"
                    disabled={!!busy}
                    onClick={proposeToService}
                  >
                    Propose to Safe owners
                  </Button>
                )}
                {owner && service && proposedToService && !signedOnService && (
                  <Button
                    variant="outline"
                    data-testid="safe-service-confirm"
                    disabled={!!busy}
                    onClick={confirmOnService}
                  >
                    Sign in Safe service
                  </Button>
                )}
                <Button
                  data-testid="safe-execute"
                  disabled={!!busy || !owner || reachable < safeTx.threshold}
                  onClick={executeSafeTx}
                >
                  Execute
                </Button>
              </div>
              {!owner && (
                <p className="text-xs text-muted-foreground">
                  Connect an owner of this Safe to approve or execute.
                </p>
              )}
            </div>
          )
        ) : (
          <Button
            data-testid="l1-reg-l2-submit"
            disabled={
              !delegate ||
              !l1Voter ||
              !deployment ||
              !!busy ||
              !address ||
              !isAddressEqual(address, delegate)
            }
            onClick={claimOnL2}
          >
            Claim on Arbitrum One
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">2. On Ethereum: accept the delegate</h3>
        <p className="text-sm text-muted-foreground">
          From the voting address{address ? ` (${address})` : ""}: name the
          delegate whose power it casts. Once per address.
        </p>
        {acceptedOnL1 ? (
          <p className="text-sm text-green-700" data-testid="l1-reg-l1-done">
            This address accepts {delegate} on Ethereum.
          </p>
        ) : (
          <Button
            data-testid="l1-reg-l1-submit"
            disabled={!delegate || !deployment || !!busy}
            onClick={claimOnL1}
          >
            Accept on Ethereum
          </Button>
        )}
      </section>
    </div>
  );
}
