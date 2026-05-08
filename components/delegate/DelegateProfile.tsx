"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { useAppKit } from "@reown/appkit/react";
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  MessageSquareText,
  User,
  Users,
  Vote,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
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

import { DelegateVotesLoader } from "@/components/delegate/DelegateVotesLoader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ARBITRUM_CHAIN_ID, ARB_TOKEN } from "@/config/arbitrum-governance";
import ERC20VotesABI from "@/data/ERC20Votes_ABI.json";
import { addressesEqual, isValidAddress } from "@/lib/address-utils";
import type { TallyDelegateProfile } from "@/lib/delegate-cache";
import { getErrorMessage, getSimulationErrorMessage } from "@/lib/error-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { proposalSanitizeSchema } from "@/lib/sanitize-schema";

const ARB_TOKEN_ABI = ERC20VotesABI as Abi;

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

interface DelegateProfileProps {
  address: string;
  delegate: TallyDelegateProfile | null;
}

export function DelegateProfile({ address, delegate }: DelegateProfileProps) {
  const explorerUrl = getAddressExplorerUrl(address);

  if (!delegate) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <User className="h-6 w-6" />
            Delegate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="font-mono text-xs break-all">{address}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>
    );
  }

  const { account, statement } = delegate;
  const displayName =
    delegate.knownLabel ||
    account.name ||
    account.ens ||
    shortenAddress(address);
  const hasStatement = statement.statement.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-border">
                {account.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.picture}
                    alt=""
                    className="h-full w-full rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <User className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1">
                <CardTitle className="text-2xl">{displayName}</CardTitle>
                {account.bio && (
                  <CardDescription className="text-base">
                    {account.bio}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {statement.isSeekingDelegation && (
                <Badge variant="glass" className="text-xs">
                  Seeking Delegation
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="font-mono text-xs break-all">{address}</span>
              <ExternalLink className="h-3 w-3" />
            </a>

            {account.ens && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="font-mono text-xs">{account.ens}</span>
              </span>
            )}

            {account.twitter && (
              <a
                href={`https://x.com/${account.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span>@{account.twitter}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats + Tabs */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stats cards */}
        <div className="space-y-4">
          <StatCard
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            label="Voting Power"
            value={`${formatVotingPower(delegate.votesCount)} ARB`}
          />
          <StatCard
            icon={<User className="h-4 w-4 text-muted-foreground" />}
            label="Delegators"
            value={delegate.delegatorsCount.toLocaleString()}
          />
          <DelegationCard
            delegateAddress={address}
            delegateName={displayName}
          />
        </div>

        {/* Tabs: Statement + Past Votes */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="statement">
            <TabsList>
              <TabsTrigger value="statement">Delegate Statement</TabsTrigger>
              <TabsTrigger value="votes">Past Votes</TabsTrigger>
            </TabsList>

            <TabsContent value="statement">
              <Card variant="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5" />
                    Delegate Statement
                  </CardTitle>
                  {statement.statementSummary && (
                    <CardDescription>
                      {statement.statementSummary}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {hasStatement ? (
                    <div className="text-sm break-words prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:text-muted-foreground">
                      <ReactMarkdown
                        rehypePlugins={[
                          [rehypeSanitize, proposalSanitizeSchema],
                          rehypeRaw,
                        ]}
                      >
                        {statement.statement}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This delegate has not published a statement.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="votes">
              <Card variant="glass">
                <CardContent className="pt-6">
                  <DelegateVotesLoader address={address} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function DelegationCard({
  delegateAddress,
  delegateName,
}: {
  delegateAddress: string;
  delegateName: string;
}) {
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

  const delegationStatus = useMemo(() => {
    if (!isConnected) return "Connect a wallet to delegate ARB voting power.";
    if (!validDelegateAddress) return "Invalid delegate address.";
    if (isLoadingCurrentDelegate) return "Checking current delegation.";
    if (isDelegatedToProfile) {
      return `Currently delegated to ${delegateName}.`;
    }
    if (currentDelegate && !addressesEqual(currentDelegate, zeroAddress)) {
      return `Currently delegated to ${shortenAddress(currentDelegate)}.`;
    }
    return "No active ARB delegate.";
  }, [
    currentDelegate,
    delegateName,
    isConnected,
    isDelegatedToProfile,
    isLoadingCurrentDelegate,
    validDelegateAddress,
  ]);

  const isBusy = isWriting || isConfirming || isSimulating || isSwitchingChain;
  const canDelegate =
    isConnected &&
    !isWrongNetwork &&
    !!simulateData?.request &&
    !!validDelegateAddress &&
    !isDelegatedToProfile &&
    !isBusy;

  function handleDelegate() {
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

  function handleConnect() {
    void open({ view: "Connect" });
  }

  function handleSwitchChain() {
    switchChain({ chainId: ARBITRUM_CHAIN_ID });
  }

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Vote className="h-4 w-4 text-muted-foreground" />
          Delegate ARB
        </CardTitle>
        <CardDescription>{delegationStatus}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected && (
          <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Your balance:{" "}
            <span className="font-medium text-foreground">
              {isLoadingBalance || arbBalance === undefined
                ? "Loading"
                : `${formatVotingPower(arbBalance)} ARB`}
            </span>
          </div>
        )}

        {!isConnected ? (
          <Button className="w-full" onClick={handleConnect}>
            <Wallet className="mr-2 h-4 w-4" />
            Connect Wallet
          </Button>
        ) : isWrongNetwork ? (
          <Button
            className="w-full"
            onClick={handleSwitchChain}
            disabled={isSwitchingChain}
          >
            {isSwitchingChain && (
              <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Switch to Arbitrum
          </Button>
        ) : isDelegatedToProfile ? (
          <Button className="w-full" variant="outline" disabled>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Delegated
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={handleDelegate}
            disabled={!canDelegate}
          >
            {isBusy && <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />}
            {isConfirming
              ? "Confirming"
              : isWriting
                ? "Delegating"
                : "Delegate to this address"}
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          Delegation updates voting power only. Your ARB stays in your wallet.
        </p>
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card variant="glass">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
