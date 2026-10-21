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
import { isL1VotingProposal } from "@/lib/l1-voting";
import type {
  IndexerProposalStage,
  IndexerProposalStages,
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

function stageNote(stage: IndexerProposalStage): string | null {
  const parts: string[] = [];
  const legs = stage.detail?.legs;
  if (legs && legs.length > 0) {
    const executed = legs.filter((leg) => leg.executed).length;
    parts.push(`Retryable tickets executed: ${executed}/${legs.length}`);
  }
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

/**
 * One indexer stage as a gov-tracker stage. A pending timelock past its ETA
 * becomes READY, as gov-tracker reports it. Retryable legs become transactions
 * of their own, alongside the stage's completing one.
 */
export function mapIndexerStage(
  stage: IndexerProposalStage,
  nowSeconds = Math.floor(Date.now() / MS_PER_SECOND)
): ProposalStage {
  const chainId = indexerStageChainId(stage.chain);
  const isReady =
    stage.status === "PENDING" &&
    stage.etaAt !== null &&
    stage.etaAt <= nowSeconds;
  const status: StageStatus = isReady ? "READY" : stage.status;

  const transactions: StageTransaction[] = [];
  if (stage.txHash) {
    transactions.push(transaction(stage.txHash, chainId, stage.completedAt));
  }
  for (const leg of stage.detail?.legs ?? []) {
    if (!leg.txHash || leg.txHash === stage.txHash) continue;
    // Retryables are redeemed on Arbitrum, whatever chain the stage reports.
    transactions.push(transaction(leg.txHash, l2ChainId(), null, "redeemed"));
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
    data: note ? { note } : {},
  } as ProposalStage;
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
