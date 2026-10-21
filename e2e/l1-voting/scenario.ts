/* eslint-disable no-process-env */
// Bridge to the indexer repo's scripted scenario steps
// (packages/e2e/src/scenario/worst-case.ts): each call runs one step there and
// returns what it checked, or throws with the step's error.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const INDEXER_REPO = process.env.WORST_CASE_INDEXER_REPO ?? "";
export const RPC_PROXY_CONTROL =
  process.env.WORST_CASE_RPC_CONTROL ?? "http://127.0.0.1:28646";

export type StepResult = {
  step: string;
  ok: boolean;
  seconds: number;
  checks: { check: string; ok: boolean; detail?: unknown }[];
};

export async function scenario(
  step: string,
  ...args: (string | number)[]
): Promise<StepResult> {
  const { stdout } = await run(
    "pnpm",
    ["-s", "scenario", step, ...args.map(String)],
    {
      cwd: `${INDEXER_REPO}/packages/e2e`,
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 3 * 60 * 60 * 1000,
    }
  ).catch((error: { stdout?: string; stderr?: string }) => {
    throw new Error(
      `scenario ${step} failed:\n${error.stderr ?? ""}\n${error.stdout ?? ""}`
    );
  });
  const line = stdout.trim().split("\n").at(-1) ?? "";
  const result = JSON.parse(line) as StepResult;
  if (!result.ok) throw new Error(`scenario ${step}: ${line}`);
  return result;
}

export async function scenarioState(): Promise<Record<string, any>> {
  return (await scenario("state")).checks as unknown as Record<string, any>;
}

/** Take the indexer's Ethereum RPC down or bring it back (the orchestrator's proxy). */
export async function setIndexerL1Rpc(up: boolean): Promise<void> {
  const res = await fetch(`${RPC_PROXY_CONTROL}/${up ? "up" : "down"}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`rpc proxy control returned ${res.status}`);
}
