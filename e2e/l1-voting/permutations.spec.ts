/* eslint-disable no-process-env */
/**
 * Voting on L1 voting proposals in the browser, recorded. Each case gets fresh delegates and
 * proposals from the indexer repo's scenario CLI, then the vote panel is driven and checked
 * against the chain and the indexer API: a pending proposal; two first voters racing to lock;
 * a wallet that rejects; nothing left to prove; already voted; no power; the indexer going down
 * with the panel open.
 *
 * Runs on the stack e2e/l1-voting/run-worst-case.sh boots:
 *   SPECS=e2e/l1-voting/permutations.spec.ts e2e/l1-voting/run-worst-case.sh
 */
/**
 * Every L1 voting case a delegate can meet, in the browser, recorded. Each case gets fresh
 * delegates and proposals from the indexer repo's scenario CLI, then the UI is driven and checked
 * against the chain and the indexer API.
 *
 *   Registration  EOA status; an EOA naming a separate voting address on Arbitrum One;
 *                 confirmation; accepting on Ethereum; a Safe revoking; a Safe registering
 *                 too late for a locked snapshot
 *   Voting        a pending proposal; two first voters racing to lock; a wallet that rejects;
 *                 a separate voting address; nothing left to prove; already voted; no power;
 *                 the indexer going down with the panel open
 *   Outcomes      defeated; short of quorum; cancelled in the timelock; executed
 *
 * Runs on the stack e2e/l1-voting/run-worst-case.sh boots (PERMUTATIONS=1).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import { recordedPage, saveVideos, type Wallet } from "./recording";
import { INDEXER_REPO, scenario } from "./scenario";

const INDEXER = process.env.GOVERNANCE_INDEXER_URL ?? "http://localhost:42069";
const L1_CHAIN = 1337;

test.skip(!INDEXER_REPO, "set WORST_CASE_INDEXER_REPO (run-worst-case.sh)");
test.describe.configure({ mode: "serial" });
test.afterEach(async ({}, testInfo) => saveVideos(testInfo));

/** Run a scenario command and return what it produced. */
async function sc<T = any>(step: string, ...args: (string | number)[]) {
  return (await scenario(step, ...args)).checks as unknown as T;
}

async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(`${INDEXER}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

let governor = "";
const page = (id: string) =>
  `/proposal/${id}?govId=eip155:${L1_CHAIN}:${governor}`;
const proposal = (id: string) =>
  api(`/api/tally/proposals/${governor.toLowerCase()}/${id}`);
const votes = (id: string) =>
  api<any[]>(`/api/tally/proposals/${governor.toLowerCase()}/${id}/votes`);

async function until<T>(
  label: string,
  probe: () => Promise<T | null | false>,
  ms = 300_000
) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await probe().catch(() => null);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`timed out: ${label}`);
}

/** Kill the orchestrator's indexer process; its supervisor brings it back after a pause. */
async function killIndexer() {
  await promisify(execFile)("pkill", ["-f", "start --schema worst_case_"]);
}

function panelOf(p: Page) {
  return p.getByTestId("l1-vote-panel");
}

async function vote(p: Page, support: "for" | "against" | "abstain") {
  const panel = panelOf(p);
  await expect(panel.getByTestId("l1-vote-submit")).toBeEnabled({
    timeout: 120_000,
  });
  await panel.getByTestId(`l1-vote-support-${support}`).click();
  await panel.getByTestId("l1-vote-submit").click();
  await expect(panel.getByTestId("l1-vote-done")).toBeVisible({
    timeout: 10 * 60_000,
  });
}

async function expectBlocker(p: Page, code: string) {
  await expect(
    panelOf(p).locator(`[data-testid="l1-vote-blockers"] [data-code="${code}"]`)
  ).toBeVisible({ timeout: 120_000 });
  await expect(panelOf(p).getByTestId("l1-vote-submit")).toBeDisabled();
}

async function expectState(p: Page, state: string) {
  await expect(p.getByTestId("l1-proposal-state")).toHaveAttribute(
    "data-state",
    state,
    {
      timeout: 180_000,
    }
  );
}

async function expectStage(p: Page, type: string, status: string) {
  const lifecycle = p.getByRole("tab", { name: "Lifecycle" });
  await lifecycle.waitFor({ timeout: 120_000 });
  await lifecycle.click();
  await expect(
    p.locator(`[data-stage-type="${type}"]`).first()
  ).toHaveAttribute("data-stage-status", status, { timeout: 180_000 });
}

// Accounts and proposals shared across the serial cases.
const w: Record<string, Wallet> = {};
const ids: Record<string, string> = {};

test("setup: fresh delegates for every case", async () => {
  test.setTimeout(30 * 60_000);
  governor = (await api("/api/l1-voting/deployment")).governor;
  for (const name of ["race1", "race2", "reject", "proven", "outage"])
    w[name] = await sc("new-delegate");
  w.powerless = await sc("new-l1-account");
});

test("voting: a pending proposal cannot be voted on yet", async ({
  browser,
}) => {
  test.setTimeout(20 * 60_000);
  const pending = await sc("propose-l1", "pending case");
  const p = await recordedPage(browser, w.race1, page(pending.proposalId));
  await expectState(p, "PENDING");
  await expectBlocker(p, "NOT_ACTIVE");
});

test("voting: two first voters race to lock the snapshot; both votes land", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  const main = await sc("propose-l1", "main voting case", "active");
  ids.main = main.proposalId;
  const [a, b] = await Promise.all([
    recordedPage(browser, w.race1, page(ids.main)),
    recordedPage(browser, w.race2, page(ids.main)),
  ]);
  await expectState(a, "ACTIVE");
  // Both plans include the checkpoint and the lock before either sends anything.
  for (const p of [a, b])
    await expect(panelOf(p).locator('[data-kind="checkpoint"]')).toBeVisible({
      timeout: 120_000,
    });
  await Promise.all([vote(a, "for"), vote(b, "against")]);
  await until("both votes and the lock indexed", async () => {
    const [row, v] = [await proposal(ids.main), await votes(ids.main)];
    return row.snapshotLocked && v.length >= 2;
  });
});

test("voting: a wallet that rejects can retry and vote", async ({
  browser,
}) => {
  test.setTimeout(20 * 60_000);
  const p = await recordedPage(browser, w.reject, page(ids.main));
  const panel = panelOf(p);
  await expect(panel.getByTestId("l1-vote-submit")).toBeEnabled({
    timeout: 120_000,
  });
  await p.evaluate(() => {
    (
      window as unknown as { __TEST_WALLET_REJECT__?: number }
    ).__TEST_WALLET_REJECT__ = 1;
  });
  await panel.getByTestId("l1-vote-submit").click();
  await expect(panel.getByTestId("l1-vote-submit")).toBeEnabled({
    timeout: 120_000,
  });
  await expect(panel.getByTestId("l1-vote-done")).toHaveCount(0);
  await vote(p, "for");
});

test("voting: with every proof already in place, only the vote is left", async ({
  browser,
}) => {
  test.setTimeout(20 * 60_000);
  await sc("prove-only", w.proven.key, ids.main);
  const p = await recordedPage(browser, w.proven, page(ids.main));
  const plan = panelOf(p).getByTestId("l1-vote-plan");
  await expect(plan.locator("li")).toHaveCount(1, { timeout: 120_000 });
  await expect(plan.locator('[data-kind="vote"]')).toBeVisible();
  await vote(p, "abstain");
});

test("voting: already voted, and no voting power, are refused with a reason", async ({
  browser,
}) => {
  test.setTimeout(20 * 60_000);
  const voted = await recordedPage(browser, w.race1, page(ids.main));
  await expectBlocker(voted, "ALREADY_VOTED");
  const none = await recordedPage(browser, w.powerless, page(ids.main));
  await expectBlocker(none, "NO_VOTING_POWER");
});

test("voting: the indexer goes down with the panel open, comes back, and the vote goes through", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  const p = await recordedPage(browser, w.outage, page(ids.main));
  await expect(panelOf(p).getByTestId("l1-vote-submit")).toBeEnabled({
    timeout: 120_000,
  });
  // The orchestrator restarts a killed indexer after a 45s outage (run-worst-case.sh).
  await killIndexer();
  await expect(panelOf(p).getByTestId("l1-vote-error")).toBeVisible({
    timeout: 120_000,
  });
  await expect(panelOf(p).getByTestId("l1-vote-error")).toHaveCount(0, {
    timeout: 10 * 60_000,
  });
  await vote(p, "for");
});
