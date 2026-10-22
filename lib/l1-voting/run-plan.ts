// Drives an indexer vote plan to a cast vote: send the plan's first step, wait for it, ask for
// the plan again, until only the vote is left. Wallet and chain access are injected, so the same
// loop runs in the panel and in tests.

import type { Hex } from "viem";

import type { VotePlan, VotePlanStep } from "./api";

export interface PlanRunnerDeps {
  fetchPlan: (signature?: Hex) => Promise<VotePlan>;
  /** Send a step's transaction and resolve once it is mined successfully. */
  sendStep: (step: VotePlanStep) => Promise<Hex>;
  signTypedData: (
    typedData: NonNullable<VotePlanStep["typedData"]>
  ) => Promise<Hex>;
  /** Resolve once the L1 head has reached `block`. */
  waitForBlock: (block: bigint) => Promise<void>;
  castVote: (plan: VotePlan) => Promise<Hex>;
  onProgress?: (event: PlanProgress) => void;
  /** A refusal by the user is final; anything else (a revert) is worth re-planning. */
  isUserRejection?: (error: unknown) => boolean;
  /** Pause between attempts at a plan request that failed (default 2s). */
  retryDelayMs?: number;
}

export type PlanProgress =
  | { type: "plan"; plan: VotePlan }
  | {
      type: "step";
      step: VotePlanStep;
      status: "running" | "done";
      txHash?: Hex;
    }
  | { type: "vote"; status: "running" | "done"; txHash?: Hex }
  | { type: "replan"; reason: string };

export class VotePlanBlockedError extends Error {
  constructor(public blockers: VotePlan["blockers"]) {
    super(blockers.map((b) => b.message).join(" "));
    this.name = "VotePlanBlockedError";
  }
}

const MAX_ROUNDS = 12;
/** Failed steps re-planned before giving up: another voter can lock or prove first. */
const MAX_REPLANS = 2;
/** Attempts at one plan request: the indexer can fail briefly while the chain moves under it. */
const PLAN_ATTEMPTS = 4;

async function fetchPlanWithRetry(
  deps: PlanRunnerDeps,
  signature: Hex | undefined
): Promise<VotePlan> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.fetchPlan(signature);
    } catch (error) {
      if (attempt >= PLAN_ATTEMPTS) throw error;
      await new Promise((r) => setTimeout(r, deps.retryDelayMs ?? 2_000));
    }
  }
}

export async function runVotePlan(deps: PlanRunnerDeps): Promise<Hex> {
  let signature: Hex | undefined;
  let replans = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const plan = await fetchPlanWithRetry(deps, signature);
    deps.onProgress?.({ type: "plan", plan });
    if (plan.blockers.length) throw new VotePlanBlockedError(plan.blockers);
    const step = plan.steps[0];
    try {
      if (!step) {
        deps.onProgress?.({ type: "vote", status: "running" });
        const txHash = await deps.castVote(plan);
        deps.onProgress?.({ type: "vote", status: "done", txHash });
        return txHash;
      }
      deps.onProgress?.({ type: "step", step, status: "running" });
      if (step.kind === "signature") {
        if (!step.typedData)
          throw new Error("signature step without typed data");
        signature = await deps.signTypedData(step.typedData);
        deps.onProgress?.({ type: "step", step, status: "done" });
        continue;
      }
      if (step.waitForBlock) await deps.waitForBlock(BigInt(step.waitForBlock));
      const txHash = await deps.sendStep(step);
      deps.onProgress?.({ type: "step", step, status: "done", txHash });
    } catch (error) {
      // The chain moved under the plan (someone locked the snapshot or proved the same thing
      // first, or a new assertion confirmed): ask again rather than fail. A refusal is final.
      if (deps.isUserRejection?.(error) || replans >= MAX_REPLANS) throw error;
      replans++;
      if (step?.kind === "bundle" || step?.kind === "checkpoint")
        signature = undefined;
      deps.onProgress?.({
        type: "replan",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw new Error("The vote plan did not settle; try again.");
}
