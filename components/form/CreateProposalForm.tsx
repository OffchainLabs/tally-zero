"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";

import { MarkdownEditor } from "@/components/form/MarkdownEditor";
import { UploadDescriptionDialog } from "@/components/form/UploadDescriptionDialog";

import { ARB_TOKEN, ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS, type GovernorType } from "@/config/governors";
import {
  buildSubmittedProposalPath,
  createFormProposalAction,
  getProposalEligibility,
  getProposalSnapshotBlock,
  getProposalSubmissionPhase,
  type FormProposalAction,
  type ProposalEligibility,
} from "@/lib/create-proposal-form-utils";
import type {
  ProposalFormSnapshot,
  RestoredDraftFormState,
} from "@/lib/drafts/mapping";
import { getErrorMessage, getSimulationErrorMessage } from "@/lib/error-utils";
import {
  getAddressExplorerUrl,
  getBlockExplorerUrl,
  getExplorerName,
} from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import type { ProposalImportResult } from "@/lib/proposal-import";
import {
  computeProposalId,
  hasActionErrors,
  normalizeActions,
  validateAction,
  type ProposalAction,
} from "@/lib/propose-utils";
import { cn } from "@/lib/utils";

import { useGovernanceClock } from "@/hooks/use-governance-clock";
import OzGovernorABI from "@data/OzGovernor_ABI.json";
import { readVotingPower } from "@gzeoneth/gov-tracker";
import { keepPreviousData } from "@tanstack/react-query";
import { zeroAddress, type Abi } from "viem";

const OZ_GOVERNOR_ABI = OzGovernorABI as Abi;

interface SubmittedProposalMeta {
  proposalId: string | null;
  governorAddress: string;
}

interface CreateProposalFormProps {
  /**
   * A stored draft to open the form on, already mapped to form state. Seeds the
   * initial state on mount and is deliberately not re-read afterwards.
   */
  initialDraft?: RestoredDraftFormState | null;
  /**
   * Extra buttons for the submit row, given the live form contents.
   *
   * A render prop so the server-drafts feature can read the form without this
   * component knowing anything about SIWE — it stays free of a session, a query
   * client, and a router, which is also what keeps its tests cheap.
   */
  renderDraftActions?: (snapshot: ProposalFormSnapshot) => ReactNode;
}

export default function CreateProposalForm({
  initialDraft,
  renderDraftActions,
}: CreateProposalFormProps = {}) {
  const { address, isConnected } = useAccount();

  const [governorType, setGovernorType] = useState<GovernorType>(
    initialDraft?.governorType ?? "treasury"
  );
  const [actions, setActions] = useState<FormProposalAction[]>(
    initialDraft?.actions ?? [createFormProposalAction()]
  );
  const [description, setDescription] = useState(
    initialDraft?.description ?? ""
  );
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submittedProposalMeta, setSubmittedProposalMeta] =
    useState<SubmittedProposalMeta | null>(null);
  const [trackedTxHash, setTrackedTxHash] = useState<`0x${string}`>();
  const [replacementErrorMessage, setReplacementErrorMessage] = useState<
    string | null
  >(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const governor = GOVERNORS[governorType];

  const { clockBlock } = useGovernanceClock();

  const snapshotBlock = useMemo(
    () => getProposalSnapshotBlock(clockBlock),
    [clockBlock]
  );

  const { data: rawVotingPower, isLoading: isLoadingVotingPower } =
    useReadContract({
      ...readVotingPower(
        address ?? zeroAddress,
        snapshotBlock ?? BigInt(0),
        ARB_TOKEN.address
      ),
      query: {
        enabled: isConnected && !!address && snapshotBlock !== undefined,
        // The snapshot block is part of this read's cache key, so each new
        // governance clock value starts a fresh query. Without a placeholder
        // the figure would blank out to "Loading…" on every refresh; voting
        // power at the previous block is a fine thing to keep showing while
        // the next read is in flight.
        placeholderData: keepPreviousData,
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

  const eligibility = getProposalEligibility(votingPower, proposalThreshold);
  const meetsThreshold = eligibility === "meets";

  const proposalActions = useMemo(
    () => actions.map(({ id: _id, ...action }) => action),
    [actions]
  );
  // What the server-drafts dialog saves; the form itself persists nothing.
  const draftSnapshot = {
    governorType,
    description,
    actions: proposalActions,
  };
  const actionErrors = useMemo(
    () => proposalActions.map(validateAction),
    [proposalActions]
  );
  const anyActionInvalid = actionErrors.some(hasActionErrors);
  const descriptionInvalid = description.trim().length === 0;
  const formInvalid =
    anyActionInvalid || descriptionInvalid || actions.length === 0;

  const proposeArgs = useMemo(():
    | readonly [`0x${string}`[], bigint[], `0x${string}`[], string]
    | undefined => {
    if (formInvalid) return undefined;
    try {
      const { targets, values, calldatas } = normalizeActions(proposalActions);
      return [targets, values, calldatas, description];
    } catch {
      return undefined;
    }
  }, [description, formInvalid, proposalActions]);

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
    account: address,
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
    error: writeError,
    isPending: isWriting,
    writeContract,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    chainId: ARBITRUM_CHAIN_ID,
    hash: trackedTxHash,
    onReplaced: ({ reason, transactionReceipt }) => {
      if (reason === "cancelled") {
        setTrackedTxHash(undefined);
        setSubmittedProposalMeta(null);
        setReplacementErrorMessage(
          "Proposal transaction was cancelled in your wallet."
        );
        toast.error("Proposal transaction was cancelled.");
        return;
      }

      setTrackedTxHash(transactionReceipt.transactionHash);
      setReplacementErrorMessage(null);
      toast(
        reason === "repriced"
          ? "Proposal transaction gas fee was updated in your wallet."
          : "Proposal transaction was replaced in your wallet."
      );
    },
  });
  const hasConfirmedSubmission = isConfirmed && !!trackedTxHash;
  const submissionPhase = getProposalSubmissionPhase({
    txHash: trackedTxHash,
    isWriting,
    isConfirming,
    isConfirmed: hasConfirmedSubmission,
  });
  const isBusy =
    submissionPhase === "awaiting-wallet" || submissionPhase === "confirming";

  useEffect(() => {
    if (submissionPhase === "confirmed") {
      toast("Proposal submitted.");
    }
  }, [submissionPhase]);

  useEffect(() => {
    if (writeError) {
      setTrackedTxHash(undefined);
      setSubmittedProposalMeta(null);
    }
  }, [writeError]);

  const writeErrorMessage = writeError
    ? getErrorMessage(writeError, "submit proposal")
    : null;
  const receiptErrorMessage = receiptError
    ? getErrorMessage(receiptError, "confirm proposal")
    : null;

  const canSubmit =
    submissionPhase === "idle" &&
    isConnected &&
    meetsThreshold &&
    !!proposeArgs &&
    !!simulateData?.request &&
    !isSimulating &&
    !isSimulateError;

  function handleAddAction() {
    setActions((prev) => [...prev, createFormProposalAction()]);
  }

  function handleRemoveAction(actionId: string) {
    setActions((prev) =>
      prev.length === 1 ? prev : prev.filter((action) => action.id !== actionId)
    );
  }

  function handleActionChange(
    actionId: string,
    field: keyof ProposalAction,
    value: string
  ) {
    setActions((prev) =>
      prev.map((action) =>
        action.id === actionId ? { ...action, [field]: value } : action
      )
    );
  }

  function handleImportDescription(result: ProposalImportResult) {
    setDescription(result.markdown);
    const switchedGovernor =
      result.suggestedGovernor && result.suggestedGovernor !== governorType;
    if (switchedGovernor) {
      setGovernorType(result.suggestedGovernor!);
    }
    toast(
      <div className="flex flex-col gap-1">
        <p>Description imported.</p>
        {switchedGovernor && (
          <p>
            Set target governor to {GOVERNORS[result.suggestedGovernor!].name}.
          </p>
        )}
      </div>
    );
  }

  function handleSubmit() {
    setAttemptedSubmit(true);
    if (!canSubmit || !simulateData?.request) return;
    setReplacementErrorMessage(null);
    setSubmittedProposalMeta({
      proposalId: predictedProposalId,
      governorAddress: governor.address,
    });
    writeContract(simulateData.request, {
      onSuccess: (hash) => {
        setTrackedTxHash(hash);
      },
      onError: () => {
        setTrackedTxHash(undefined);
      },
    });
  }

  if (submissionPhase === "confirmed" && trackedTxHash) {
    return (
      <SuccessState
        txHash={trackedTxHash}
        proposalPath={buildSubmittedProposalPath({
          proposalId: submittedProposalMeta?.proposalId ?? predictedProposalId,
          governorAddress:
            submittedProposalMeta?.governorAddress ?? governor.address,
        })}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <GovernorPicker
            value={governorType}
            onChange={setGovernorType}
            disabled={isBusy}
            snapshotBlock={snapshotBlock}
          />
          <ThresholdCard
            isConnected={isConnected}
            votingPower={votingPower}
            proposalThreshold={proposalThreshold}
            eligibility={eligibility}
            isLoading={isLoadingVotingPower || isLoadingThreshold}
            governorName={governor.name}
            snapshotBlock={snapshotBlock}
          />
        </div>

        <DescriptionEditor
          value={description}
          onChange={setDescription}
          showError={attemptedSubmit && descriptionInvalid}
          disabled={isBusy}
          onOpenUpload={() => setUploadOpen(true)}
        />

        <ActionsBuilder
          actions={actions}
          errors={actionErrors}
          showErrors={attemptedSubmit}
          disabled={isBusy}
          onChange={handleActionChange}
          onAdd={handleAddAction}
          onRemove={handleRemoveAction}
        />

        <SubmitSection
          isConnected={isConnected}
          eligibility={eligibility}
          governorName={governor.name}
          predictedProposalId={predictedProposalId}
          submissionPhase={submissionPhase}
          isSimulating={isSimulating}
          isSimulateError={isSimulateError}
          simulationErrorMessage={simulationErrorMessage}
          writeErrorMessage={writeErrorMessage}
          receiptErrorMessage={receiptErrorMessage}
          replacementErrorMessage={replacementErrorMessage}
          canSubmit={canSubmit}
          formInvalid={formInvalid}
          onSubmit={handleSubmit}
          draftActions={renderDraftActions?.(draftSnapshot)}
        />
      </div>

      <UploadDescriptionDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onImport={handleImportDescription}
        hasExistingContent={description.trim().length > 0}
      />
    </>
  );
}

interface GovernorPickerProps {
  value: GovernorType;
  onChange: (value: GovernorType) => void;
  disabled: boolean;
  snapshotBlock: bigint | undefined;
}

function GovernorPicker({
  value,
  onChange,
  disabled,
  snapshotBlock,
}: GovernorPickerProps) {
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
          {(Object.keys(GOVERNORS) as GovernorType[]).map((type) => (
            <GovernorOption
              key={type}
              type={type}
              selected={value === type}
              snapshotBlock={snapshotBlock}
            />
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

interface GovernorOptionProps {
  type: GovernorType;
  selected: boolean;
  snapshotBlock: bigint | undefined;
}

function GovernorOption({
  type,
  selected,
  snapshotBlock,
}: GovernorOptionProps) {
  const gov = GOVERNORS[type];
  // `governor.quorum(blockNumber)` returns the on-chain quorum at the given
  // L1 block. Post-DVP-upgrade the contract computes this from delegated
  // voting power directly, so this single read is correct in both regimes.
  const { data: rawQuorum, isLoading: isLoadingQuorum } = useReadContract({
    address: gov.address as `0x${string}`,
    abi: OZ_GOVERNOR_ABI,
    functionName: "quorum",
    args: snapshotBlock !== undefined ? [snapshotBlock] : undefined,
    chainId: ARBITRUM_CHAIN_ID,
    query: {
      enabled: snapshotBlock !== undefined,
      // Keyed on the snapshot block, so keep the last quorum on screen instead
      // of flashing "Loading…" whenever the governance clock advances.
      placeholderData: keepPreviousData,
    },
  });
  const quorum = rawQuorum as bigint | undefined;

  return (
    <label
      htmlFor={`gov-${type}`}
      className={cn(
        "flex gap-3 rounded-xl border p-4 cursor-pointer transition-all",
        "glass-subtle backdrop-blur hover:border-primary/50",
        selected
          ? "border-primary/70 ring-1 ring-primary/40"
          : "border-border/40"
      )}
    >
      <RadioGroupItem value={type} id={`gov-${type}`} className="mt-1" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{gov.name}</span>
          {/* Safe to nest inside the <label>: HTML excludes interactive
              content descendants from a label's activation behavior, so
              clicking the address opens the explorer without selecting the
              radio. */}
          <a
            href={getAddressExplorerUrl(gov.address, "arb1")}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View the ${gov.name} contract on ${getExplorerName("arb1")}`}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            {shortenAddress(gov.address)}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{gov.description}</p>
        <p className="text-[11px] text-muted-foreground">
          {gov.hasL1Timelock
            ? `L2 timelock ${gov.l2TimelockDelay} → L1 challenge + ${gov.l1TimelockDelay}`
            : `L2 timelock ${gov.l2TimelockDelay}`}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Quorum at Ethereum block #
          {snapshotBlock !== undefined ? snapshotBlock.toLocaleString() : "?"}:{" "}
          {quorum !== undefined ? (
            <span className="tabular-nums text-foreground">
              {formatVotingPower(quorum)} ARB
            </span>
          ) : isLoadingQuorum ? (
            "Loading…"
          ) : (
            "—"
          )}
        </p>
      </div>
    </label>
  );
}

interface ThresholdCardProps {
  isConnected: boolean;
  votingPower: bigint | undefined;
  proposalThreshold: bigint | undefined;
  eligibility: ProposalEligibility;
  isLoading: boolean;
  governorName: string;
  snapshotBlock: bigint | undefined;
}

function ThresholdCard({
  isConnected,
  votingPower,
  proposalThreshold,
  eligibility,
  isLoading,
  governorName,
  snapshotBlock,
}: ThresholdCardProps) {
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">Proposer Eligibility</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Values at Ethereum block #
          {snapshotBlock !== undefined ? (
            <a
              href={getBlockExplorerUrl(Number(snapshotBlock), "ethereum")}
              target="_blank"
              className="underline"
              rel="noopener noreferrer"
            >
              {snapshotBlock.toLocaleString()}
            </a>
          ) : (
            "?"
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isConnected ? (
          <p className="text-sm text-muted-foreground">
            Connect your wallet to check if you meet the proposal threshold.
          </p>
        ) : (
          <>
            <Row
              label="Your voting power"
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
              (eligibility === "meets" ? (
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Threshold met
                </div>
              ) : eligibility === "below" ? (
                <div className="text-xs text-amber-400">
                  Voting power below threshold. You need at least{" "}
                  {formatVotingPower(proposalThreshold)} ARB to submit.
                </div>
              ) : null)}
            {isConnected && !isLoading && eligibility === "unknown" && (
              <div className="text-xs text-muted-foreground">
                Could not determine proposer eligibility.
              </div>
            )}
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
  actions: FormProposalAction[];
  errors: ReturnType<typeof validateAction>[];
  showErrors: boolean;
  disabled: boolean;
  onChange: (
    actionId: string,
    field: keyof ProposalAction,
    value: string
  ) => void;
  onAdd: () => void;
  onRemove: (actionId: string) => void;
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
              key={action.id}
              className="rounded-xl border border-border/40 glass-subtle backdrop-blur p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-muted-foreground">
                  Action #{index + 1}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(action.id)}
                  disabled={disabled || actions.length === 1}
                  aria-label={`Remove action ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`target-${action.id}`} className="text-xs">
                  Target
                </Label>
                <Input
                  id={`target-${action.id}`}
                  value={action.target}
                  onChange={(e) =>
                    onChange(action.id, "target", e.target.value)
                  }
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
                  <Label htmlFor={`value-${action.id}`} className="text-xs">
                    Value (wei)
                  </Label>
                  <Input
                    id={`value-${action.id}`}
                    value={action.value}
                    onChange={(e) =>
                      onChange(action.id, "value", e.target.value)
                    }
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
                  <Label htmlFor={`calldata-${action.id}`} className="text-xs">
                    Calldata
                  </Label>
                  <Input
                    id={`calldata-${action.id}`}
                    value={action.calldata}
                    onChange={(e) =>
                      onChange(action.id, "calldata", e.target.value)
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
  onOpenUpload: () => void;
}

function DescriptionEditor({
  value,
  onChange,
  showError,
  disabled,
  onOpenUpload,
}: DescriptionEditorProps) {
  return (
    <Card variant="glass">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Description</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenUpload}
          disabled={disabled}
        >
          <Upload className="h-3.5 w-3.5 mr-1" />
          Upload
        </Button>
      </CardHeader>
      <CardContent>
        <MarkdownEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={
            "# Proposal title\n\nContext, rationale, and any relevant links. Markdown is supported."
          }
        />
        {showError && (
          <p className="text-xs text-red-400 mt-2">Description is required</p>
        )}
      </CardContent>
    </Card>
  );
}

interface SubmitSectionProps {
  isConnected: boolean;
  eligibility: ProposalEligibility;
  governorName: string;
  predictedProposalId: string | null;
  submissionPhase: "idle" | "awaiting-wallet" | "confirming" | "confirmed";
  isSimulating: boolean;
  isSimulateError: boolean;
  simulationErrorMessage: string | null;
  writeErrorMessage: string | null;
  receiptErrorMessage: string | null;
  replacementErrorMessage: string | null;
  canSubmit: boolean;
  formInvalid: boolean;
  onSubmit: () => void;
  /**
   * Rendered ahead of "Submit Proposal". The server-drafts save button lives
   * here; the form has no persistence of its own.
   */
  draftActions?: ReactNode;
}

function SubmitSection({
  isConnected,
  eligibility,
  governorName,
  predictedProposalId,
  submissionPhase,
  isSimulating,
  isSimulateError,
  simulationErrorMessage,
  writeErrorMessage,
  receiptErrorMessage,
  replacementErrorMessage,
  canSubmit,
  formInvalid,
  onSubmit,
  draftActions,
}: SubmitSectionProps) {
  return (
    <Card variant="glass">
      <CardContent className="flex flex-col gap-3 pt-6">
        {!isConnected && (
          <p className="text-sm text-amber-400">
            Connect a wallet to simulate and submit the proposal.
          </p>
        )}

        {isConnected && eligibility === "below" && (
          <p className="text-sm text-amber-400">
            Your voting power does not meet the {governorName} proposal
            threshold. The transaction will revert if submitted.
          </p>
        )}

        {isConnected && eligibility === "unknown" && (
          <p className="text-sm text-muted-foreground">
            Checking your voting power and proposal threshold.
          </p>
        )}

        {formInvalid && (
          <p className="text-xs text-muted-foreground">
            Fill in valid action rows and a description to simulate.
          </p>
        )}

        {submissionPhase === "awaiting-wallet" && (
          <div className="text-xs text-muted-foreground">
            Confirm the transaction in your wallet.
          </div>
        )}

        {submissionPhase === "confirming" && (
          <div className="text-xs text-muted-foreground">
            Waiting for transaction confirmation.
          </div>
        )}

        {!formInvalid &&
          isConnected &&
          eligibility === "meets" &&
          submissionPhase === "idle" && (
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

        {replacementErrorMessage && (
          <p className="text-sm text-red-400 whitespace-pre-wrap">
            {replacementErrorMessage}
          </p>
        )}

        {receiptErrorMessage && (
          <code className="block rounded-md border border-red-500/30 bg-zinc-950/80 px-3 py-2 font-mono text-xs leading-5 text-red-300 shadow-inner overflow-auto">
            <pre>{receiptErrorMessage}</pre>
          </code>
        )}

        {writeErrorMessage && (
          <code className="block rounded-md border border-red-500/30 bg-zinc-950/80 px-3 py-2 font-mono text-xs leading-5 text-red-300 shadow-inner overflow-auto">
            <pre>{writeErrorMessage}</pre>
          </code>
        )}

        {predictedProposalId && (
          <p className="text-xs text-muted-foreground font-mono">
            Predicted proposal id: {predictedProposalId.slice(0, 10)}…
            {predictedProposalId.slice(-6)}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {draftActions}
          {submissionPhase === "awaiting-wallet" ||
          submissionPhase === "confirming" ? (
            <Button disabled>
              <ReloadIcon className="h-4 w-4 mr-2 animate-spin" />
              {submissionPhase === "confirming" ? "Confirming…" : "Submitting…"}
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
  proposalPath: string | null;
}

function SuccessState({ txHash, proposalPath }: SuccessStateProps) {
  return (
    <Card variant="glass" className="border-emerald-500/30">
      <CardContent className="pt-6 flex flex-col gap-4 items-start">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Proposal submitted</span>
        </div>

        <p className="text-sm text-muted-foreground">
          Your propose() transaction has been confirmed. The proposal will
          appear on the Proposals page and enter the voting-active phase at the
          governor&apos;s voting delay.
        </p>

        <div className="text-xs font-mono text-muted-foreground break-all">
          tx: {txHash}
        </div>

        {proposalPath && (
          <Link
            href={proposalPath}
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
