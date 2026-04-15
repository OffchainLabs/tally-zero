"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { ArrowRight, CheckCircle2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { toast } from "sonner";
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWriteContract,
} from "wagmi";

import { useL1Block } from "@/hooks/use-l1-block";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

import { ARB_TOKEN, ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS, type GovernorType } from "@/config/governors";
import { getErrorMessage, getSimulationErrorMessage } from "@/lib/error-utils";
import { formatVotingPower } from "@/lib/format-utils";
import {
  computeProposalId,
  emptyAction,
  hasActionErrors,
  normalizeActions,
  validateAction,
  type ProposalAction,
} from "@/lib/propose-utils";
import { proposalSanitizeSchema } from "@/lib/sanitize-schema";
import { cn } from "@/lib/utils";

import OzGovernorABI from "@data/OzGovernor_ABI.json";
import { readVotingPower } from "@gzeoneth/gov-tracker";
import type { Abi } from "viem";

const OZ_GOVERNOR_ABI = OzGovernorABI as Abi;

const L1_BLOCK_SYNC_BUFFER = 100;

export default function CreateProposalForm() {
  const { address, isConnected } = useAccount();

  const [governorType, setGovernorType] = useState<GovernorType>("treasury");
  const [actions, setActions] = useState<ProposalAction[]>([emptyAction()]);
  const [description, setDescription] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const governor = GOVERNORS[governorType];

  const { currentL1Block } = useL1Block();

  const snapshotBlock = useMemo(() => {
    if (currentL1Block === null) return undefined;
    const buffered = currentL1Block - L1_BLOCK_SYNC_BUFFER;
    return buffered > 0 ? BigInt(buffered) : BigInt(0);
  }, [currentL1Block]);

  const { data: rawVotingPower, isLoading: isLoadingVotingPower } =
    useReadContract({
      ...readVotingPower(
        address ?? "0x0000000000000000000000000000000000000000",
        snapshotBlock ?? BigInt(0),
        ARB_TOKEN.address
      ),
      query: {
        enabled: isConnected && !!address && snapshotBlock !== undefined,
      },
    });
  const votingPower = rawVotingPower as bigint | undefined;

  const { data: rawThreshold, isLoading: isLoadingThreshold } = useReadContract(
    {
      address: governor.address as `0x${string}`,
      abi: OZ_GOVERNOR_ABI,
      functionName: "proposalThreshold",
      chainId: ARBITRUM_CHAIN_ID,
    }
  );
  const proposalThreshold = rawThreshold as bigint | undefined;

  const meetsThreshold =
    votingPower !== undefined &&
    proposalThreshold !== undefined &&
    votingPower >= proposalThreshold;

  const actionErrors = useMemo(() => actions.map(validateAction), [actions]);
  const anyActionInvalid = actionErrors.some(hasActionErrors);
  const descriptionInvalid = description.trim().length === 0;
  const formInvalid =
    anyActionInvalid || descriptionInvalid || actions.length === 0;

  const proposeArgs = useMemo(():
    | readonly [`0x${string}`[], bigint[], `0x${string}`[], string]
    | undefined => {
    if (formInvalid) return undefined;
    try {
      const { targets, values, calldatas } = normalizeActions(actions);
      return [targets, values, calldatas, description];
    } catch {
      return undefined;
    }
  }, [actions, description, formInvalid]);

  const predictedProposalId = useMemo(() => {
    if (!proposeArgs) return null;
    try {
      const [targets, values, calldatas, desc] = proposeArgs;
      return computeProposalId(targets, values, calldatas, desc);
    } catch {
      return null;
    }
  }, [proposeArgs]);

  const {
    data: simulateData,
    error: simulateError,
    isError: isSimulateError,
    isFetching: isSimulating,
  } = useSimulateContract({
    address: governor.address as `0x${string}`,
    abi: OZ_GOVERNOR_ABI,
    functionName: "propose",
    args: proposeArgs,
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled: !!proposeArgs && isConnected && meetsThreshold && !!address,
    },
  });

  const simulationErrorMessage = useMemo(() => {
    if (!isSimulateError || !simulateError) return null;
    return getSimulationErrorMessage(simulateError);
  }, [isSimulateError, simulateError]);

  const {
    data: txHash,
    error: writeError,
    isPending: isWriting,
    isSuccess,
    writeContract,
  } = useWriteContract();

  useEffect(() => {
    if (txHash) {
      toast("Proposal submitted.");
    }
  }, [txHash]);

  const writeErrorMessage = writeError
    ? getErrorMessage(writeError, "submit proposal")
    : null;

  const canSubmit =
    isConnected &&
    meetsThreshold &&
    !!proposeArgs &&
    !!simulateData?.request &&
    !isSimulating &&
    !isSimulateError;

  function handleAddAction() {
    setActions((prev) => [...prev, emptyAction()]);
  }

  function handleRemoveAction(index: number) {
    setActions((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== index)
    );
  }

  function handleActionChange(
    index: number,
    field: keyof ProposalAction,
    value: string
  ) {
    setActions((prev) =>
      prev.map((action, i) =>
        i === index ? { ...action, [field]: value } : action
      )
    );
  }

  function handleSubmit() {
    setAttemptedSubmit(true);
    if (!canSubmit || !simulateData?.request) return;
    writeContract(simulateData.request);
  }

  if (isSuccess && txHash) {
    return <SuccessState txHash={txHash} proposalId={predictedProposalId} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <GovernorPicker
        value={governorType}
        onChange={setGovernorType}
        disabled={isWriting}
      />

      <ThresholdCard
        isConnected={isConnected}
        votingPower={votingPower}
        proposalThreshold={proposalThreshold}
        isLoading={isLoadingVotingPower || isLoadingThreshold}
        governorName={governor.name}
      />

      <ActionsBuilder
        actions={actions}
        errors={actionErrors}
        showErrors={attemptedSubmit}
        disabled={isWriting}
        onChange={handleActionChange}
        onAdd={handleAddAction}
        onRemove={handleRemoveAction}
      />

      <DescriptionEditor
        value={description}
        onChange={setDescription}
        showError={attemptedSubmit && descriptionInvalid}
        disabled={isWriting}
      />

      <SubmitSection
        isConnected={isConnected}
        meetsThreshold={meetsThreshold}
        governorName={governor.name}
        predictedProposalId={predictedProposalId}
        isSimulating={isSimulating}
        isSimulateError={isSimulateError}
        simulationErrorMessage={simulationErrorMessage}
        writeErrorMessage={writeErrorMessage}
        isWriting={isWriting}
        canSubmit={canSubmit}
        formInvalid={formInvalid}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

interface GovernorPickerProps {
  value: GovernorType;
  onChange: (value: GovernorType) => void;
  disabled: boolean;
}

function GovernorPicker({ value, onChange, disabled }: GovernorPickerProps) {
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">Target Governor</CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={value}
          onValueChange={(v) => onChange(v as GovernorType)}
          className="grid gap-3 md:grid-cols-2"
          disabled={disabled}
        >
          {(Object.keys(GOVERNORS) as GovernorType[]).map((type) => {
            const gov = GOVERNORS[type];
            const selected = value === type;
            return (
              <label
                key={type}
                htmlFor={`gov-${type}`}
                className={cn(
                  "flex gap-3 rounded-xl border p-4 cursor-pointer transition-all",
                  "glass-subtle hover:border-primary/50",
                  selected
                    ? "border-primary/70 ring-1 ring-primary/40"
                    : "border-border/40"
                )}
              >
                <RadioGroupItem
                  value={type}
                  id={`gov-${type}`}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{gov.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {gov.quorum} quorum
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {gov.description}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {gov.hasL1Timelock
                      ? `L2 timelock ${gov.l2TimelockDelay} → L1 challenge + ${gov.l1TimelockDelay}`
                      : `L2 timelock ${gov.l2TimelockDelay}`}
                  </p>
                </div>
              </label>
            );
          })}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

interface ThresholdCardProps {
  isConnected: boolean;
  votingPower: bigint | undefined;
  proposalThreshold: bigint | undefined;
  isLoading: boolean;
  governorName: string;
}

function ThresholdCard({
  isConnected,
  votingPower,
  proposalThreshold,
  isLoading,
  governorName,
}: ThresholdCardProps) {
  const meetsThreshold =
    votingPower !== undefined &&
    proposalThreshold !== undefined &&
    votingPower >= proposalThreshold;

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">Proposer Eligibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isConnected ? (
          <p className="text-sm text-muted-foreground">
            Connect your wallet to check if you meet the proposal threshold.
          </p>
        ) : (
          <>
            <Row
              label={`Your voting power (latest block)`}
              value={
                isLoading
                  ? "Loading…"
                  : votingPower !== undefined
                    ? `${formatVotingPower(votingPower)} ARB`
                    : "—"
              }
            />
            <Row
              label={`${governorName} proposal threshold`}
              value={
                isLoading
                  ? "Loading…"
                  : proposalThreshold !== undefined
                    ? `${formatVotingPower(proposalThreshold)} ARB`
                    : "—"
              }
            />
            {votingPower !== undefined &&
              proposalThreshold !== undefined &&
              (meetsThreshold ? (
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Threshold met
                </div>
              ) : (
                <div className="text-xs text-amber-400">
                  Voting power below threshold. You need at least{" "}
                  {formatVotingPower(proposalThreshold)} ARB to submit.
                </div>
              ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

interface ActionsBuilderProps {
  actions: ProposalAction[];
  errors: ReturnType<typeof validateAction>[];
  showErrors: boolean;
  disabled: boolean;
  onChange: (index: number, field: keyof ProposalAction, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

function ActionsBuilder({
  actions,
  errors,
  showErrors,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: ActionsBuilderProps) {
  return (
    <Card variant="glass">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Actions</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add action
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Each action is a low-level call executed by the timelock after the
          proposal passes. Use <code>0x</code> calldata and value <code>0</code>{" "}
          for a no-op placeholder (useful for signaling proposals).
        </p>
        {actions.map((action, index) => {
          const err = errors[index];
          const showErr = showErrors;
          return (
            <div
              key={index}
              className="rounded-xl border border-border/40 glass-subtle p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-muted-foreground">
                  Action #{index + 1}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(index)}
                  disabled={disabled || actions.length === 1}
                  aria-label={`Remove action ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`target-${index}`} className="text-xs">
                  Target
                </Label>
                <Input
                  id={`target-${index}`}
                  value={action.target}
                  onChange={(e) => onChange(index, "target", e.target.value)}
                  placeholder="0x…"
                  variant="glass"
                  disabled={disabled}
                  className="font-mono text-xs"
                />
                {showErr && err.target && (
                  <p className="text-xs text-red-400">{err.target}</p>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`value-${index}`} className="text-xs">
                    Value (wei)
                  </Label>
                  <Input
                    id={`value-${index}`}
                    value={action.value}
                    onChange={(e) => onChange(index, "value", e.target.value)}
                    placeholder="0"
                    variant="glass"
                    disabled={disabled}
                    inputMode="numeric"
                    className="font-mono text-xs"
                  />
                  {showErr && err.value && (
                    <p className="text-xs text-red-400">{err.value}</p>
                  )}
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <Label htmlFor={`calldata-${index}`} className="text-xs">
                    Calldata
                  </Label>
                  <Input
                    id={`calldata-${index}`}
                    value={action.calldata}
                    onChange={(e) =>
                      onChange(index, "calldata", e.target.value)
                    }
                    placeholder="0x"
                    variant="glass"
                    disabled={disabled}
                    className="font-mono text-xs"
                  />
                  {showErr && err.calldata && (
                    <p className="text-xs text-red-400">{err.calldata}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface DescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  showError: boolean;
  disabled: boolean;
}

function DescriptionEditor({
  value,
  onChange,
  showError,
  disabled,
}: DescriptionEditorProps) {
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">Description</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="write">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="mt-3">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`# Proposal title\n\nContext, rationale, and any relevant links. Markdown is supported.`}
              rows={12}
              disabled={disabled}
              className="flex w-full rounded-md border glass-subtle border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
            />
            {showError && (
              <p className="text-xs text-red-400 mt-2">
                Description is required
              </p>
            )}
          </TabsContent>
          <TabsContent value="preview" className="mt-3">
            <div className="glass-subtle rounded-lg p-4 min-h-[200px] prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary">
              {value.trim() ? (
                <ReactMarkdown
                  rehypePlugins={[
                    [rehypeSanitize, proposalSanitizeSchema],
                    rehypeRaw,
                  ]}
                >
                  {value}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  Nothing to preview yet.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface SubmitSectionProps {
  isConnected: boolean;
  meetsThreshold: boolean;
  governorName: string;
  predictedProposalId: string | null;
  isSimulating: boolean;
  isSimulateError: boolean;
  simulationErrorMessage: string | null;
  writeErrorMessage: string | null;
  isWriting: boolean;
  canSubmit: boolean;
  formInvalid: boolean;
  onSubmit: () => void;
}

function SubmitSection({
  isConnected,
  meetsThreshold,
  governorName,
  predictedProposalId,
  isSimulating,
  isSimulateError,
  simulationErrorMessage,
  writeErrorMessage,
  isWriting,
  canSubmit,
  formInvalid,
  onSubmit,
}: SubmitSectionProps) {
  return (
    <Card variant="glass">
      <CardContent className="flex flex-col gap-3 pt-6">
        {!isConnected && (
          <p className="text-sm text-amber-400">
            Connect a wallet to simulate and submit the proposal.
          </p>
        )}

        {isConnected && !meetsThreshold && (
          <p className="text-sm text-amber-400">
            Your voting power does not meet the {governorName} proposal
            threshold. The transaction will revert if submitted.
          </p>
        )}

        {formInvalid && (
          <p className="text-xs text-muted-foreground">
            Fill in valid action rows and a description to simulate.
          </p>
        )}

        {!formInvalid && isConnected && meetsThreshold && (
          <div className="text-xs text-muted-foreground">
            {isSimulating
              ? "Simulating…"
              : isSimulateError
                ? "Simulation failed"
                : "Simulation successful"}
          </div>
        )}

        {simulationErrorMessage && (
          <p className="text-sm text-red-400 whitespace-pre-wrap">
            {simulationErrorMessage}
          </p>
        )}

        {writeErrorMessage && (
          <p className="text-sm text-red-400 whitespace-pre-wrap">
            {writeErrorMessage}
          </p>
        )}

        {predictedProposalId && (
          <p className="text-xs text-muted-foreground font-mono">
            Predicted proposal id: {predictedProposalId.slice(0, 10)}…
            {predictedProposalId.slice(-6)}
          </p>
        )}

        <div className="flex justify-end">
          {isWriting ? (
            <Button disabled>
              <ReloadIcon className="h-4 w-4 mr-2 animate-spin" />
              Submitting…
            </Button>
          ) : (
            <Button onClick={onSubmit} disabled={!canSubmit}>
              Submit Proposal
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface SuccessStateProps {
  txHash: string;
  proposalId: string | null;
}

function SuccessState({ txHash, proposalId }: SuccessStateProps) {
  return (
    <Card variant="glass" className="border-emerald-500/30">
      <CardContent className="pt-6 flex flex-col gap-4 items-start">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Proposal submitted</span>
        </div>

        <p className="text-sm text-muted-foreground">
          Your propose() transaction has been sent. Once the transaction is
          mined, the proposal will appear on the Proposals page and enter the
          voting-active phase at the governor&apos;s voting delay.
        </p>

        <div className="text-xs font-mono text-muted-foreground break-all">
          tx: {txHash}
        </div>

        {proposalId && (
          <Link
            href={`/proposal/${proposalId}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            View proposal page
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}

        <Link
          href="/proposals"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          Back to Proposals
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
