/**
 * Lifecycle stages from the governance indexer, shaped like gov-tracker's.
 *
 * The indexer's `/stages` endpoint uses gov-tracker's stage type names, so its
 * stages map onto `ProposalStage` and render through the same stage components
 * and lifecycle helpers. It is the only source for L1 voting proposals, which
 * gov-tracker cannot trace, and an opt-in replacement for the trace on the
 * Arbitrum One governors (`NEXT_PUBLIC_STAGES_SOURCE=indexer`).
 */

import { l1VotingChainId, l2ChainId } from "@/config/chains";
import { env } from "@/env";
import {
  formatEtaTimestamp,
  MS_PER_SECOND,
  type EstimatedTimeRange,
} from "@/lib/date-utils";
import { explorerChainForChainId } from "@/lib/explorer-utils";
import { formatVotingPower } from "@/lib/format-utils";
import { isL1VotingProposal } from "@/lib/l1-voting";
import type {
  IndexerProposalStage,
  IndexerProposalStages,
  IndexerRetryableLeg,
  IndexerRetryableStatus,
  IndexerStageType,
  IndexerTimelockCall,
} from "@/lib/tally-data/types";
import type {
  ProposalStage,
  StageStatus,
  StageTransaction,
} from "@/types/proposal-stage";

export type StagesSource = "indexer" | "gov-tracker";

export function getStagesSource(): StagesSource {
  // Validation (and with it the default) is skipped under vitest, so anything
  // but an explicit "indexer" is gov-tracker.
  return env.NEXT_PUBLIC_STAGES_SOURCE === "indexer"
    ? "indexer"
    : "gov-tracker";
}

/**
 * Whether a proposal's stages come from the indexer: always for L1 voting
 * proposals, and for every proposal when the flag says so.
 */
export function usesIndexerStages(
  proposal: Parameters<typeof isL1VotingProposal>[0],
  source: StagesSource = getStagesSource()
): boolean {
  return source === "indexer" || isL1VotingProposal(proposal);
}

/** The numeric chain a stage ran on: the L1, or the Arbitrum chain */
export function indexerStageChainId(
  chain: IndexerProposalStage["chain"]
): number {
  return chain === "ethereum" ? l1VotingChainId() : l2ChainId();
}

function transaction(
  hash: string,
  chainId: number,
  timestamp: number | null,
  description?: string
): StageTransaction {
  return {
    hash,
    // The endpoint carries no block numbers; nothing renders this one.
    blockNumber: 0,
    timestamp: timestamp ?? undefined,
    // "unknown" marks a chain without an explorer, which renders no link.
    chain: explorerChainForChainId(chainId) ?? "unknown",
    chainId,
    description,
  };
}

/** A decimal string as a bigint, or null when absent or malformed */
function toBigInt(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || !/^\d+$/.test(value)) {
    return null;
  }
  return BigInt(value);
}

function isBytes32(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** Retryable legs that decide this stage; a foreign leg belongs to another operation */
function ownLegs(stage: IndexerProposalStage): IndexerRetryableLeg[] {
  return (stage.detail?.legs ?? []).filter(
    (leg) => !leg.foreign && leg.status !== "FOREIGN"
  );
}

/** A leg's status, inferred from `executed` on an indexer that does not send it */
export function indexerRetryableLegStatus(
  leg: IndexerRetryableLeg
): IndexerRetryableStatus {
  return leg.status ?? (leg.executed ? "REDEEMED" : "PENDING");
}

function stageNote(stage: IndexerProposalStage): string | null {
  const parts: string[] = [];
  const legs = ownLegs(stage);
  // An older indexer sends no per-leg status, so only the count can be shown.
  if (legs.length > 0 && legs.every((leg) => leg.status === undefined)) {
    const executed = legs.filter((leg) => leg.executed).length;
    parts.push(`Retryable tickets executed: ${executed}/${legs.length}`);
  }
  const election = electionNote(stage);
  if (election) parts.push(election);
  // A transaction carries its own date; without one, the stage's times are the
  // only record of when it happened.
  if (!stage.txHash) {
    if (stage.status === "COMPLETED" && stage.completedAt) {
      parts.push(`Completed ${formatEtaTimestamp(String(stage.completedAt))}`);
    } else if (stage.status === "PENDING" && stage.startedAt) {
      parts.push(`Started ${formatEtaTimestamp(String(stage.startedAt))}`);
    }
  }
  return parts.length > 0 ? parts.join(". ") : null;
}

function blockRange(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  return start && end ? `blocks ${start} to ${end}` : null;
}

/** What an election stage's detail says, as one line */
function electionNote(stage: IndexerProposalStage): string | null {
  const detail = stage.detail;
  if (!detail || !ELECTION_STAGE_TYPES.has(stage.type)) return null;
  const parts: string[] = [];
  if (detail.cohort !== null && detail.cohort !== undefined) {
    parts.push(`Cohort ${detail.cohort}`);
  }
  if (stage.type === "NOMINEE_ELECTION") {
    const range = blockRange(detail.startBlock, detail.endBlock);
    if (range) parts.push(`Nominee voting ${range}`);
  } else if (stage.type === "NOMINEE_VETTING" && detail.vettingEndBlock) {
    parts.push(`Vetting ends at block ${detail.vettingEndBlock}`);
  } else if (stage.type === "MEMBER_ELECTION") {
    const range = blockRange(detail.memberStartBlock, detail.memberEndBlock);
    if (range) parts.push(`Member voting ${range}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

const ELECTION_STAGE_TYPES: ReadonlySet<IndexerStageType> = new Set([
  "CREATE_ELECTION",
  "NOMINEE_ELECTION",
  "NOMINEE_VETTING",
  "MEMBER_ELECTION",
]);

/**
 * `VOTING_ACTIVE` tallies in gov-tracker's `VotingActiveData` shape, which the
 * quorum and distribution bars read. Quorum counts For and Abstain, as the
 * governors do.
 */
function votingData(stage: IndexerProposalStage): Record<string, unknown> {
  const detail = stage.detail;
  const forVotes = toBigInt(detail?.forVotes);
  if (!detail || forVotes === null) return {};
  const against = toBigInt(detail.againstVotes) ?? BigInt(0);
  const abstain = toBigInt(detail.abstainVotes) ?? BigInt(0);
  const quorum = toBigInt(detail.quorum);
  return {
    forVotes: formatVotingPower(forVotes),
    forVotesRaw: forVotes.toString(),
    againstVotes: formatVotingPower(against),
    againstVotesRaw: against.toString(),
    abstainVotes: formatVotingPower(abstain),
    abstainVotesRaw: abstain.toString(),
    ...(quorum !== null && {
      quorum: formatVotingPower(quorum),
      quorumRaw: quorum.toString(),
      quorumReached: forVotes + abstain >= quorum,
    }),
    ...(detail.startBlock && { startBlock: detail.startBlock }),
    ...(detail.endBlock && { deadline: detail.endBlock }),
    ...(detail.result && { proposalState: detail.result }),
  };
}

function timelockData(stage: IndexerProposalStage): Record<string, unknown> {
  const detail = stage.detail;
  if (!detail?.operationId) return {};
  const calls = detail.operations?.length ?? detail.calls ?? 0;
  return {
    operationId: detail.operationId,
    ...(detail.timelockAddress && { timelockAddress: detail.timelockAddress }),
    callScheduledData: [],
    ...(isBytes32(detail.salt) && { salt: detail.salt }),
    ...(isBytes32(detail.predecessor) && { predecessor: detail.predecessor }),
    isBatchOperation: calls > 1,
  };
}

function messageData(stage: IndexerProposalStage): Record<string, unknown> {
  const messages = stage.detail?.messages ?? [];
  if (messages.length === 0) return {};
  return {
    messageCount: messages.length,
    messagePositions: messages.map((m) => m.position),
    l2TxHash: messages[0].l2TxHash ?? undefined,
    l2ToL1Messages: messages,
  };
}

function retryableData(stage: IndexerProposalStage): Record<string, unknown> {
  const legs = ownLegs(stage);
  // Without a status per leg, the count in the note says all there is.
  if (legs.length === 0 || legs.every((leg) => leg.status === undefined)) {
    return {};
  }
  const chainId = l2ChainId();
  return {
    ticketCount: legs.length,
    redemptionDetails: legs.map((leg, index) => ({
      index,
      targetChain: "arb1",
      targetChainId: chainId,
      status: indexerRetryableLegStatus(leg),
      l2TxHash: leg.txHash,
      ticketId: leg.ticketId ?? null,
    })),
  };
}

function stageData(stage: IndexerProposalStage): Record<string, unknown> {
  switch (stage.type) {
    case "VOTING_ACTIVE":
      return votingData(stage);
    case "L2_TIMELOCK":
    case "L1_TIMELOCK":
      return timelockData(stage);
    case "L2_TO_L1_MESSAGE":
      return messageData(stage);
    case "RETRYABLE_EXECUTED":
      return retryableData(stage);
    default:
      return {};
  }
}

function isTimelockStage(stage: IndexerProposalStage): boolean {
  return stage.type === "L2_TIMELOCK" || stage.type === "L1_TIMELOCK";
}

/** The chain a timelock stage's operation is on: the indexer's word, else the stage's */
function timelockChainId(stage: IndexerProposalStage): number {
  return stage.detail?.chainId ?? indexerStageChainId(stage.chain);
}

/**
 * One indexer stage as a gov-tracker stage. A pending timelock past its ETA
 * becomes READY, as gov-tracker reports it. A timelock lists its schedule and
 * execute transactions; retryable legs and L2-to-L1 messages add their own.
 */
export function mapIndexerStage(
  stage: IndexerProposalStage,
  nowSeconds = Math.floor(Date.now() / MS_PER_SECOND)
): ProposalStage {
  const chainId = isTimelockStage(stage)
    ? timelockChainId(stage)
    : indexerStageChainId(stage.chain);
  const isReady =
    stage.status === "PENDING" &&
    stage.etaAt !== null &&
    stage.etaAt <= nowSeconds;
  const status: StageStatus = isReady ? "READY" : stage.status;

  const transactions: StageTransaction[] = [];
  const seen = new Set<string>();
  const add = (tx: StageTransaction) => {
    const key = tx.hash.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    transactions.push(tx);
  };

  const scheduledTxHash = isTimelockStage(stage)
    ? stage.detail?.scheduledTxHash
    : null;
  if (scheduledTxHash) {
    add(transaction(scheduledTxHash, chainId, stage.startedAt, "scheduled"));
  }
  if (stage.txHash) {
    // Without `scheduledTxHash`, a pending timelock's hash is the schedule
    // transaction, dated by its start.
    const description =
      scheduledTxHash && stage.status === "COMPLETED" ? "executed" : undefined;
    add(
      transaction(
        stage.txHash,
        chainId,
        stage.completedAt ?? stage.startedAt,
        description
      )
    );
  }
  if (stage.type === "L2_TO_L1_MESSAGE") {
    for (const message of stage.detail?.messages ?? []) {
      if (!message.l2TxHash) continue;
      add(
        transaction(
          message.l2TxHash,
          l2ChainId(),
          toNumber(message.timestamp),
          "message sent"
        )
      );
    }
  }
  for (const leg of stage.detail?.legs ?? []) {
    if (!leg.txHash) continue;
    // Retryables are redeemed on Arbitrum, whatever chain the stage reports.
    add(
      transaction(leg.txHash, l2ChainId(), leg.executedAt ?? null, "redeemed")
    );
  }

  const note = stageNote(stage);

  return {
    type: stage.type,
    status,
    chain: explorerChainForChainId(chainId) ?? "unknown",
    chainId,
    transactions,
    timing: {
      startedAt: stage.startedAt ?? undefined,
      eta: stage.etaAt ?? undefined,
    },
    executable: isReady,
    data: { ...stageData(stage), ...(note && { note }) },
  } as ProposalStage;
}

function toNumber(value: string | null | undefined): number | null {
  const parsed = toBigInt(value);
  return parsed === null ? null : Number(parsed);
}

/** Everything `ExecuteTimelockButton` needs to execute an indexer timelock stage */
export interface IndexerTimelockExecution {
  operationId: string;
  timelockAddress: string;
  chainId: number;
  calls: IndexerTimelockCall[];
  predecessor: string;
  salt: string;
}

const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

/**
 * The execution inputs of a timelock stage that can run now: pending, past its
 * ETA, with its calls and a known salt. Null otherwise, including on an older
 * indexer that does not send the calls.
 */
export function indexerTimelockExecution(
  stage: IndexerProposalStage,
  nowSeconds = Math.floor(Date.now() / MS_PER_SECOND)
): IndexerTimelockExecution | null {
  const detail = stage.detail;
  if (!isTimelockStage(stage) || stage.status !== "PENDING") return null;
  if (stage.etaAt === null || stage.etaAt > nowSeconds) return null;
  if (!detail?.operationId || !detail.timelockAddress) return null;
  if (!isBytes32(detail.salt)) return null;
  const calls = detail.operations ?? [];
  if (calls.length === 0) return null;
  return {
    operationId: detail.operationId,
    timelockAddress: detail.timelockAddress,
    chainId: timelockChainId(stage),
    calls,
    predecessor: isBytes32(detail.predecessor)
      ? detail.predecessor
      : ZERO_BYTES32,
    salt: detail.salt,
  };
}

export function mapIndexerStages(
  response: IndexerProposalStages,
  nowSeconds?: number
): ProposalStage[] {
  return response.stages.map((stage) => mapIndexerStage(stage, nowSeconds));
}

/** When an unfinished timelock stage becomes executable, for the estimate */
export function indexerStageEstimatedCompletion(
  stage: IndexerProposalStage
): EstimatedTimeRange | undefined {
  if (stage.status === "COMPLETED" || stage.status === "CANCELED") {
    return undefined;
  }
  if (stage.etaAt === null) return undefined;
  const date = new Date(stage.etaAt * MS_PER_SECOND);
  return { minDate: date, maxDate: date };
}

/** Whether any stage can still move, so the response is worth polling */
export function hasPendingIndexerStage(
  response: IndexerProposalStages | null | undefined
): boolean {
  return Boolean(
    response &&
    !response.executionCancelled &&
    response.stages.some((stage) => stage.status === "PENDING")
  );
}
