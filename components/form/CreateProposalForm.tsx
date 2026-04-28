"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import type { ICommand } from "@uiw/react-md-editor";
import {
  ArrowRight,
  Bold,
  CheckCircle2,
  CircleQuestionMark,
  Code,
  Columns2,
  Eye,
  Heading,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  MessageSquare,
  Minus,
  Plus,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
  Trash2,
  Upload,
} from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

// Client-only: the editor touches `window`/`document` at import, which would
// break the static export build.
const MDEditor = dynamic(
  () => import("@uiw/react-md-editor").then((m) => m.default),
  {
    ssr: false,
    loading: () => <div className="h-[280px] rounded-md glass-subtle" />,
  }
);

// Lazy-built once on the client to keep the MDEditor module off the SSR path.
// Replaces the default SVG icons on both the main toolbar and the right-side
// (edit/live/preview/fullscreen) toolbar with lucide equivalents so the editor
// matches the rest of the app's icon set.
const iconClass = "h-4 w-4";

function withIcon(cmd: ICommand, icon: React.ReactElement): ICommand {
  return { ...cmd, icon };
}

async function loadCommands(): Promise<ICommand[]> {
  const { commands, group } = await import("@uiw/react-md-editor");
  return [
    withIcon(commands.bold, <Bold className={iconClass} />),
    withIcon(commands.italic, <Italic className={iconClass} />),
    withIcon(commands.strikethrough, <Strikethrough className={iconClass} />),
    withIcon(commands.hr, <Minus className={iconClass} />),
    group(
      [
        commands.title1,
        commands.title2,
        commands.title3,
        commands.title4,
        commands.title5,
        commands.title6,
      ],
      {
        name: "title",
        groupName: "title",
        buttonProps: { "aria-label": "Insert title", title: "Insert title" },
        icon: <Heading className={iconClass} />,
      }
    ),
    commands.divider,
    withIcon(commands.link, <Link2 className={iconClass} />),
    withIcon(commands.quote, <Quote className={iconClass} />),
    withIcon(commands.code, <Code className={iconClass} />),
    withIcon(commands.codeBlock, <SquareCode className={iconClass} />),
    withIcon(commands.comment, <MessageSquare className={iconClass} />),
    withIcon(commands.image, <ImageIcon className={iconClass} />),
    withIcon(commands.table, <Table className={iconClass} />),
    commands.divider,
    withIcon(commands.unorderedListCommand, <List className={iconClass} />),
    withIcon(
      commands.orderedListCommand,
      <ListOrdered className={iconClass} />
    ),
    withIcon(commands.checkedListCommand, <ListChecks className={iconClass} />),
    commands.divider,
    withIcon(commands.help, <CircleQuestionMark className={iconClass} />),
  ];
}

async function loadExtraCommands(): Promise<ICommand[]> {
  const { commands } = await import("@uiw/react-md-editor");
  return [
    withIcon(commands.codeLive, <Columns2 className={iconClass} />),
    withIcon(commands.codePreview, <Eye className={iconClass} />),
    commands.divider,
    withIcon(commands.fullscreen, <Maximize2 className={iconClass} />),
  ];
}

import { useL1Block } from "@/hooks/use-l1-block";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";

import { UploadDescriptionDialog } from "@/components/form/UploadDescriptionDialog";

import { ARB_TOKEN, ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS, type GovernorType } from "@/config/governors";
import {
  buildSubmittedProposalPath,
  createFormProposalAction,
  getProposalEligibility,
  getProposalPreviewRehypePlugins,
  getProposalPreviewRemarkPlugins,
  getProposalSubmissionPhase,
  type FormProposalAction,
  type ProposalEligibility,
} from "@/lib/create-proposal-form-utils";
import { getErrorMessage, getSimulationErrorMessage } from "@/lib/error-utils";
import { formatVotingPower } from "@/lib/format-utils";
import type { ProposalImportResult } from "@/lib/proposal-import";
import {
  computeProposalId,
  hasActionErrors,
  normalizeActions,
  validateAction,
  type ProposalAction,
} from "@/lib/propose-utils";
import { cn } from "@/lib/utils";

import OzGovernorABI from "@data/OzGovernor_ABI.json";
import { readVotingPower } from "@gzeoneth/gov-tracker";
import { zeroAddress, type Abi } from "viem";

const OZ_GOVERNOR_ABI = OzGovernorABI as Abi;

const L1_BLOCK_SYNC_BUFFER = 100;

interface SubmittedProposalMeta {
  proposalId: string | null;
  governorAddress: string;
}

export default function CreateProposalForm() {
  const { address, isConnected } = useAccount();

  const [governorType, setGovernorType] = useState<GovernorType>("treasury");
  const [actions, setActions] = useState<FormProposalAction[]>([
    createFormProposalAction(),
  ]);
  const [description, setDescription] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submittedProposalMeta, setSubmittedProposalMeta] =
    useState<SubmittedProposalMeta | null>(null);
  const [trackedTxHash, setTrackedTxHash] = useState<`0x${string}`>();
  const [replacementErrorMessage, setReplacementErrorMessage] = useState<
    string | null
  >(null);
  const [uploadOpen, setUploadOpen] = useState(false);

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
        address ?? zeroAddress,
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

  const eligibility = getProposalEligibility(votingPower, proposalThreshold);
  const meetsThreshold = eligibility === "meets";

  const proposalActions = useMemo(
    () => actions.map(({ id: _id, ...action }) => action),
    [actions]
  );
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
        </div>
        <p className="text-xs text-muted-foreground mt-1">{gov.description}</p>
        <p className="text-[11px] text-muted-foreground">
          {gov.hasL1Timelock
            ? `L2 timelock ${gov.l2TimelockDelay} → L1 challenge + ${gov.l1TimelockDelay}`
            : `L2 timelock ${gov.l2TimelockDelay}`}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Quorum at block #
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
          Values at block #
          {snapshotBlock !== undefined ? (
            <a
              href={`https://arbiscan.io/block/${snapshotBlock.toString()}`}
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
  const { resolvedTheme } = useTheme();
  const [commands, setCommands] = useState<ICommand[]>();
  const [extraCommands, setExtraCommands] = useState<ICommand[]>();
  const [editorWrapper, setEditorWrapper] = useState<HTMLDivElement | null>(
    null
  );

  useEffect(() => {
    loadCommands().then(setCommands);
    loadExtraCommands().then(setExtraCommands);
  }, []);

  // MDEditor sets `title` on toolbar buttons, which triggers the slow native
  // tooltip. Copy it to `data-tooltip` (used by our CSS hover tooltip) and
  // strip `title` so the native one stays out of the way. A MutationObserver
  // covers future re-renders (mode toggles, commands list changes).
  useEffect(() => {
    if (!editorWrapper) return;
    const migrate = () => {
      editorWrapper
        .querySelectorAll<HTMLButtonElement>(
          ".w-md-editor-toolbar button[title]"
        )
        .forEach((btn) => {
          const title = btn.getAttribute("title");
          if (!title) return;
          btn.setAttribute("data-tooltip", title);
          btn.removeAttribute("title");
        });
    };
    migrate();
    const observer = new MutationObserver(migrate);
    observer.observe(editorWrapper, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
    });
    return () => observer.disconnect();
  }, [editorWrapper]);

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
        <div
          ref={setEditorWrapper}
          data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}
          className="rounded-md"
        >
          <MDEditor
            value={value}
            onChange={(next) => onChange(next ?? "")}
            preview="live"
            height={600}
            commands={commands}
            extraCommands={extraCommands}
            previewOptions={{
              remarkPlugins: getProposalPreviewRemarkPlugins(),
              rehypePlugins: getProposalPreviewRehypePlugins(),
            }}
            textareaProps={{
              placeholder:
                "# Proposal title\n\nContext, rationale, and any relevant links. Markdown is supported.",
              disabled,
            }}
          />
        </div>
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

        <div className="flex justify-end">
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
