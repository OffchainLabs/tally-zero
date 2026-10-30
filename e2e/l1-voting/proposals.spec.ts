/* eslint-disable no-process-env */
/**
 * L1 voting proposals in the UI: they show up in the proposal list, and the detail page follows
 * each one through its outcome (pending, active, defeated, short of quorum, cancelled in the
 * timelock, executed), with lifecycle stages from the indexer. Proposals and votes come from the
 * indexer repo's scenario CLI; voting through the UI is covered by the voting specs.
 *
 * Runs on the stack e2e/l1-voting/run-worst-case.sh boots:
 *   SPECS=e2e/l1-voting/proposals.spec.ts e2e/l1-voting/run-worst-case.sh
 */
import { expect, test, type Page } from "@playwright/test";

import { recordedPage, saveVideos, type Wallet } from "./recording";
import { INDEXER_REPO, scenario } from "./scenario";

const INDEXER = process.env.GOVERNANCE_INDEXER_URL ?? "http://localhost:42069";
const L1_CHAIN = 1337;
const WHALE =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

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

async function expectState(p: Page, state: string) {
  await expect(p.getByTestId("l1-proposal-state")).toHaveAttribute(
    "data-state",
    state,
    { timeout: 180_000 }
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

const ids: Record<string, string> = {};
const descriptions: Record<string, string> = {};
let small: Wallet;

test("setup: a small delegate and two fresh proposals", async () => {
  test.setTimeout(30 * 60_000);
  small = await sc("new-delegate");
  await sc("settle");
  const pending = await sc("propose-l1", "pending list case");
  ids.pending = pending.proposalId;
  descriptions.pending = pending.description;
  const active = await sc("propose-l1", "active list case", "active");
  ids.active = active.proposalId;
  descriptions.active = active.description;
  const listed = await api<any[]>("/api/tally/proposals");
  governor = listed.find(
    (p) => p.governorType === "L1_VOTING" && p.proposalId === ids.active
  )?.governorAddress;
  expect(governor).toBeTruthy();
});

test("list: L1 voting proposals appear with their governor", async ({
  browser,
}) => {
  test.setTimeout(10 * 60_000);
  const list = await recordedPage(browser, null, "/proposals");
  await expect(list.getByText("L1 Voting").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(list.getByText("active list case").first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(list.getByText("pending list case").first()).toBeVisible();
});

test("detail: pending and active proposals show their state", async ({
  browser,
}) => {
  test.setTimeout(10 * 60_000);
  const pending = await recordedPage(browser, null, page(ids.pending));
  await expectState(pending, "PENDING");
  const active = await recordedPage(browser, null, page(ids.active));
  await expectState(active, "ACTIVE");
  await expect(active.getByTestId("l1-tallies")).toBeVisible();
});

test("outcomes: defeated, short of quorum, cancelled and executed proposals", async ({
  browser,
}) => {
  test.setTimeout(90 * 60_000);
  for (const name of ["defeated", "noQuorum", "cancelled", "executed"]) {
    const created = await sc("propose-l1", `${name} case`, "active");
    ids[name] = created.proposalId;
    descriptions[name] = created.description;
  }
  await sc("vote-as", WHALE, 0, ids.defeated);
  await sc("vote-as", small.key, 1, ids.noQuorum); // far below quorum
  await sc("vote-as", WHALE, 1, ids.cancelled);
  await sc("vote-as", WHALE, 1, ids.executed);
  await sc("mine-through-voting", ids.executed);
  await sc("queue-cancel", descriptions.cancelled);
  await sc("queue-execute", descriptions.executed);

  const defeated = await recordedPage(browser, null, page(ids.defeated));
  await expectState(defeated, "DEFEATED");
  await expect(defeated.locator('[data-stage-type="L1_TIMELOCK"]')).toHaveCount(
    0
  );

  const noQuorum = await recordedPage(browser, null, page(ids.noQuorum));
  await expectState(noQuorum, "DEFEATED");

  const cancelled = await recordedPage(browser, null, page(ids.cancelled));
  await expectState(cancelled, "CANCELED");
  await expectStage(cancelled, "L1_TIMELOCK", "CANCELED");

  const executed = await recordedPage(browser, null, page(ids.executed));
  await expectState(executed, "EXECUTED");
  await expectStage(executed, "L1_TIMELOCK", "COMPLETED");
  expect((await proposal(ids.executed)).executionPhase).toBe("FULLY_EXECUTED");
});
