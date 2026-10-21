/* eslint-disable no-process-env */
/**
 * Worst case, end to end: Arbitrum One governance is bricked by a bad upgrade, the rollup stops
 * confirming, the indexer loses Ethereum for a while, and the retryable carrying the fix is never
 * auto-redeemed — and the DAO still recovers through L1 voting, with this frontend and the indexer
 * in use the whole time.
 *
 * Users do what users do through the UI (a Safe registering its L1 voter, delegates voting); the
 * scripted steps (core proposals, rollup admin, mining, timelocks) run in the indexer repo
 * (e2e/l1-voting/scenario.ts). Every step is checked on chain by the scenario, through the indexer
 * API, and here in the browser.
 *
 * Run it with e2e/l1-voting/run-worst-case.sh, which boots the whole stack.
 */
import { type Browser, type Page, expect, test } from "@playwright/test";

import { useWallet } from "../fixtures/session";
import { DEV_WALLETS, type DevWallet } from "../fixtures/wallets";
import {
  INDEXER_REPO,
  scenario,
  scenarioState,
  setIndexerL1Rpc,
} from "./scenario";

const INDEXER = process.env.GOVERNANCE_INDEXER_URL ?? "http://localhost:42069";
const L1_CHAIN = 1337;

test.skip(!INDEXER_REPO, "set WORST_CASE_INDEXER_REPO (run-worst-case.sh)");
test.describe.configure({ mode: "serial" });

async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(`${INDEXER}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function eventually<T>(
  label: string,
  probe: () => Promise<T | null | false | undefined>,
  timeoutMs = 300_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const v = await probe();
      if (v) return v;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`timed out: ${label}${last ? ` (${String(last)})` : ""}`);
}

async function walletPage(
  browser: Browser,
  wallet: DevWallet,
  path: string
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await useWallet(page, wallet);
  await page.goto(path);
  return page;
}

let deployment: { governor: string; l2DelegateMapping: string };
const safe = "0x8Df5b801aD8FD2F9589c284979e6795f418A5c9B"; // baked test Safe (owners dev1, dev2)
const safeVoter = DEV_WALLETS.candidates; // the L1 address the Safe registers in this run

const proposalPath = (id: string, tab?: string) =>
  `/proposal/${id}?govId=eip155:${L1_CHAIN}:${deployment.governor}${tab ? `&tab=${tab}` : ""}`;

async function recoveryId(): Promise<string> {
  return (await scenarioState()).recovery.proposalId as string;
}

async function expectStage(page: Page, type: string, status: string) {
  await expect(
    page.locator(`[data-stage-type="${type}"]`).first()
  ).toHaveAttribute("data-stage-status", status, { timeout: 120_000 });
}

test("0. the stack is up and governance works", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await scenario("preflight");
  deployment = await api("/api/l1-voting/deployment");
  await page.goto("/proposals");
  await expect(page.getByText("L1 Voting").first()).toBeVisible({
    timeout: 60_000,
  });
});

test("1. a Safe delegate registers its L1 voter through the UI", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  deployment ??= await api("/api/l1-voting/deployment");
  // Owner #1 builds the Safe transaction; owner #2 approves it (scripted); owner #1 executes.
  const owner = await walletPage(
    browser,
    DEV_WALLETS.profile,
    "/delegates/l1-registration"
  );
  await owner.getByTestId("l1-reg-delegate").fill(safe);
  await owner.getByTestId("l1-reg-l1-voter").fill(safeVoter.address);
  await owner.getByTestId("l1-reg-safe-prepare").click();
  const safeTxHash = (await owner
    .getByTestId("safe-tx-hash")
    .textContent())!.trim();
  await expect(owner.getByTestId("safe-approvals")).toContainText("0 of 2");
  await scenario("safe-approve", safe, safeTxHash);
  await owner.getByRole("button", { name: "Refresh approvals" }).click();
  await expect(owner.getByTestId("safe-approvals")).toContainText("1 of 2");
  await owner.getByTestId("safe-execute").click();
  await expect(owner.getByTestId("l1-reg-l2-claim")).toContainText(
    safeVoter.address,
    { ignoreCase: true, timeout: 120_000 }
  );
  await expect(owner.getByTestId("l1-reg-provable")).toContainText("not yet");

  // The Safe's new voter accepts the Safe on Ethereum.
  const voter = await walletPage(
    browser,
    safeVoter,
    "/delegates/l1-registration"
  );
  await voter.getByTestId("l1-reg-delegate").fill(safe);
  await voter.getByTestId("l1-reg-l1-submit").click();
  await expect(voter.getByTestId("l1-reg-l1-done")).toBeVisible({
    timeout: 120_000,
  });

  // Once Arbitrum confirms the block, Ethereum can see the claim.
  await scenario("settle");
  await owner.reload();
  await owner.getByTestId("l1-reg-delegate").fill(safe);
  await expect(owner.getByTestId("l1-reg-provable")).toContainText("yes", {
    timeout: 120_000,
  });
  const reg = await api(`/api/l1-voting/registrations/${safe}`);
  expect(reg.l2Claim.l1Address.toLowerCase()).toBe(
    safeVoter.address.toLowerCase()
  );
  expect(reg.l1Claimers.map((c: any) => c.l1Address.toLowerCase())).toContain(
    safeVoter.address.toLowerCase()
  );
});

test("2. a bad upgrade bricks the core governor", async ({ page }) => {
  test.setTimeout(150 * 60_000);
  const brick = await scenario("brick");
  const state = await scenarioState();
  const indexed = await api(
    `/api/tally/proposals/${(await api("/api/tally/proposals")).find((p: any) => p.proposalId === state.brickProposalId)?.governorAddress}/${state.brickProposalId}`
  );
  expect(indexed.executionPhase).toBe("FULLY_EXECUTED");
  await page.goto("/proposals");
  await expect(page.getByText("governor upgrade").first()).toBeVisible({
    timeout: 60_000,
  });
  expect(brick.checks.map((c) => c.check)).toContain(
    "core governor reverts every call"
  );
});

test("3. the rollup stalls: no new confirmed state", async () => {
  test.setTimeout(30 * 60_000);
  await scenario("stall");
});

test("4. an L1 proposal to restore the governor goes up during the stall", async ({
  page,
}) => {
  test.setTimeout(60 * 60_000);
  await scenario("propose");
  const id = await recoveryId();
  await page.goto(proposalPath(id));
  await expect(page.getByTestId("l1-proposal-page")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("l1-proposal-state")).toHaveAttribute(
    "data-state",
    "ACTIVE",
    { timeout: 120_000 }
  );
  await expect(
    page.getByText("restore the core governor").first()
  ).toBeVisible();
});

test("5. the first voter votes in the UI on stale state, and locks the snapshot", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  const id = await recoveryId();
  const page = await walletPage(browser, DEV_WALLETS.second, proposalPath(id));
  const panel = page.getByTestId("l1-vote-panel");
  await expect(panel).toBeVisible({ timeout: 120_000 });
  await expect(panel.getByTestId("l1-vote-plan")).toContainText("Checkpoint", {
    timeout: 120_000,
  });
  await panel.getByTestId("l1-vote-support-for").click();
  await panel.getByTestId("l1-vote-submit").click();
  await expect(panel.getByTestId("l1-vote-done")).toBeVisible({
    timeout: 15 * 60_000,
  });
  await expect(
    panel.locator('[data-testid="l1-vote-progress"] [data-kind="bundle"]')
  ).toHaveAttribute("data-status", "done");

  const state = await scenarioState();
  const p = await eventually("snapshot locked and vote indexed", async () => {
    const row = await api(
      `/api/tally/proposals/${deployment.governor.toLowerCase()}/${id}`
    );
    const votes = await api<any[]>(
      `/api/tally/proposals/${deployment.governor.toLowerCase()}/${id}/votes`
    );
    return row.snapshotLocked && votes.length >= 1 ? { row, votes } : null;
  });
  expect(p.votes[0].delegate).toBe(DEV_WALLETS.second.address.toLowerCase());
  // Locked to the stalled assertion: voting carried on with the last confirmed state.
  const plan = await api(
    `/api/l1-voting/vote-plan/${id}?delegate=${safe}&l1Voter=${safeVoter.address}`
  );
  expect(plan.assertionHash).toBe(state.stalledAssertion);
  await page.reload();
  await expect(page.getByTestId("l1-proposal-voters")).toContainText(
    DEV_WALLETS.second.address.slice(0, 6),
    { timeout: 120_000 }
  );
});

test("6. the indexer loses Ethereum; a vote lands anyway and is indexed on recovery", async () => {
  test.setTimeout(30 * 60_000);
  const id = await recoveryId();
  await setIndexerL1Rpc(false);
  try {
    await scenario("direct-vote", 0, 1);
    await new Promise((r) => setTimeout(r, 30_000));
    const health = await fetch(`${INDEXER}/health`).catch(() => null);
    expect(health?.ok, "indexer still serving during the outage").toBe(true);
  } finally {
    await setIndexerL1Rpc(true);
  }
  await eventually(
    "the outage vote is indexed",
    async () => {
      const votes = await api<any[]>(
        `/api/tally/proposals/${deployment.governor.toLowerCase()}/${id}/votes`
      );
      return votes.some(
        (v) => v.voter === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
      );
    },
    600_000
  );
});

test("7. the rollup recovers", async () => {
  test.setTimeout(30 * 60_000);
  await scenario("unstall");
});

test("8. the Safe votes through its L1 voter in the UI", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  const id = await recoveryId();
  const page = await walletPage(browser, safeVoter, proposalPath(id));
  const panel = page.getByTestId("l1-vote-panel");
  await expect(panel.getByTestId("l1-vote-delegate")).toBeVisible({
    timeout: 120_000,
  });
  await panel.getByTestId("l1-vote-delegate").selectOption(safe);
  await expect(panel.getByTestId("l1-vote-power")).toContainText("5,000,000", {
    timeout: 120_000,
  });
  await panel.getByTestId("l1-vote-support-for").click();
  await panel.getByTestId("l1-vote-submit").click();
  await expect(panel.getByTestId("l1-vote-done")).toBeVisible({
    timeout: 15 * 60_000,
  });
  await eventually("the Safe's vote is indexed", async () => {
    const votes = await api<any[]>(
      `/api/tally/proposals/${deployment.governor.toLowerCase()}/${id}/votes`
    );
    return votes.some(
      (v) =>
        v.voter === safeVoter.address.toLowerCase() &&
        v.delegate === safe.toLowerCase()
    );
  });
});

test("9. the proposal passes and executes on Ethereum; the retryable waits", async ({
  page,
}) => {
  test.setTimeout(60 * 60_000);
  await scenario("finish");
  const id = await recoveryId();
  await page.goto(proposalPath(id, "stages"));
  await expectStage(page, "L1_TIMELOCK", "COMPLETED");
  await expectStage(page, "RETRYABLE_EXECUTED", "PENDING");
});

test("10. a manual redeem restores the governor", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await scenario("redeem");
  const id = await recoveryId();
  await page.goto(proposalPath(id, "stages"));
  await expectStage(page, "RETRYABLE_EXECUTED", "COMPLETED");
  const row = await api(
    `/api/tally/proposals/${deployment.governor.toLowerCase()}/${id}`
  );
  expect(row.executionPhase).toBe("FULLY_EXECUTED");
});

test("11. core governance runs end to end again", async ({ page }) => {
  test.setTimeout(150 * 60_000);
  await scenario("continue");
  await page.goto("/proposals");
  await expect(page.getByText("business as usual").first()).toBeVisible({
    timeout: 60_000,
  });
});

test("12. a full re-index reproduces what the live indexer served", async () => {
  test.setTimeout(60 * 60_000);
  await scenario("reindex-check");
});
