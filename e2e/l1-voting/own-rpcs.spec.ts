/* eslint-disable no-process-env */
/**
 * The indexer is UX only. A compromised indexer cannot get a voter to sign anything L1 voting
 * doesn't need, or misstate what a proposal does; and with no indexer at all, a delegate still
 * votes, building the plan in the browser from their own RPCs with the same library.
 *
 *   Tampered plan      the vote-plan response is rewritten to aim a step at another contract:
 *                      the panel refuses and nothing is sent
 *   Rewritten text     the proposal's description is rewritten: the page shows Ethereum's text,
 *                      flags the mismatch and disables voting
 *   No indexer         every indexer request fails: the page stands on Ethereum alone and the
 *                      delegate votes on their own RPCs
 *
 * Runs on the stack e2e/l1-voting/run-worst-case.sh boots.
 */
import { expect, test, type Page } from "@playwright/test";

import { recordedPage, saveVideos, type Wallet } from "./recording";
import { INDEXER_REPO, scenario } from "./scenario";

const INDEXER = process.env.GOVERNANCE_INDEXER_URL ?? "http://localhost:42069";
const L1_CHAIN = 1337;
const ATTACKER = "0x000000000000000000000000000000000000bAd1";
const INDEXER_PROXY = "**/api/governance-indexer/**";

test.skip(!INDEXER_REPO, "set WORST_CASE_INDEXER_REPO (run-worst-case.sh)");
test.describe.configure({ mode: "serial" });
test.afterEach(async ({}, testInfo) => saveVideos(testInfo));

async function sc<T = any>(step: string, ...args: (string | number)[]) {
  return (await scenario(step, ...args)).checks as unknown as T;
}

async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(`${INDEXER}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

let governor = "";
let proposalId = "";
const page = () =>
  `/proposal/${proposalId}?govId=eip155:${L1_CHAIN}:${governor}`;
const votes = () =>
  api<any[]>(
    `/api/tally/proposals/${governor.toLowerCase()}/${proposalId}/votes`
  );
const panelOf = (p: Page) => p.getByTestId("l1-vote-panel");
const w: Record<string, Wallet> = {};

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

test("setup: delegates and an active proposal", async () => {
  test.setTimeout(30 * 60_000);
  governor = (await api("/api/l1-voting/deployment")).governor;
  for (const name of ["tamper", "rewrite", "own"])
    w[name] = await sc("new-delegate");
  // A confirmed assertion must cover their delegations, or the snapshot proves zero power.
  await sc("settle");
  proposalId = (await sc("propose-l1", "own rpcs case", "active")).proposalId;
});

test("a vote plan aimed at another contract is refused before the wallet sees it", async ({
  browser,
}) => {
  test.setTimeout(20 * 60_000);
  const p = await recordedPage(browser, w.tamper!, page(), (pg) =>
    pg.route(
      "**/api/governance-indexer/api/l1-voting/vote-plan/**",
      async (route) => {
        const response = await route.fetch();
        const plan = await response.json();
        if (plan.steps?.[0]) plan.steps[0].to = ATTACKER;
        else if (plan.vote) plan.vote.to = ATTACKER;
        await route.fulfill({ response, json: plan });
      }
    )
  );
  const panel = panelOf(p);
  await expect(panel.getByTestId("l1-vote-unsafe")).toBeVisible({
    timeout: 120_000,
  });
  await expect(panel.getByTestId("l1-vote-unsafe")).toContainText(ATTACKER, {
    ignoreCase: true,
  });
  await expect(panel.getByTestId("l1-vote-submit")).toBeDisabled();
  // The way out: build the plan from the voter's own RPCs instead.
  await expect(panel.getByTestId("l1-vote-use-own-rpcs")).toBeVisible();
  const cast = await votes();
  expect(cast.some((v) => v.voter === w.tamper!.address.toLowerCase())).toBe(
    false
  );
});

test("an indexer that rewrites the proposal's text cannot get a vote for it", async ({
  browser,
}) => {
  test.setTimeout(20 * 60_000);
  const p = await recordedPage(browser, w.rewrite!, page(), (pg) =>
    pg.route(
      "**/api/governance-indexer/api/tally/proposals/**",
      async (route) => {
        const response = await route.fetch();
        const body = await response.json().catch(() => null);
        if (body && typeof body.description === "string") {
          body.description = "# Harmless housekeeping\n\nNothing to see.";
          await route.fulfill({ response, json: body });
        } else await route.fulfill({ response });
      }
    )
  );
  await expect(p.getByTestId("l1-proposal-mismatch")).toBeVisible({
    timeout: 120_000,
  });
  // The page shows what was proposed on Ethereum, not the indexer's story.
  await expect(p.locator("h1").first()).toContainText("own rpcs case");
  await expect(panelOf(p).getByTestId("l1-vote-stopped")).toContainText(
    "differs"
  );
  await expect(panelOf(p).getByTestId("l1-vote-submit")).toBeDisabled();
});

test("with no indexer at all, a delegate votes on their own RPCs", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  const p = await recordedPage(browser, w.own!, page(), (pg) =>
    pg.route(INDEXER_PROXY, (route) => route.abort("connectionrefused"))
  );
  await expect(p.getByTestId("l1-proposal-indexer-down")).toBeVisible({
    timeout: 120_000,
  });
  await expect(p.getByTestId("l1-proposal-verified")).toBeVisible();
  const panel = panelOf(p);
  await panel.getByTestId("l1-vote-advanced").locator("summary").click();
  await panel.getByTestId("l1-vote-own-rpcs").check();
  await expect(panel).toHaveAttribute("data-plan-source", "own");
  await expect(panel.getByTestId("l1-vote-submit")).toBeEnabled({
    timeout: 120_000,
  });
  await panel.getByTestId("l1-vote-support-for").click();
  await panel.getByTestId("l1-vote-submit").click();
  await expect(panel.getByTestId("l1-vote-done")).toBeVisible({
    timeout: 10 * 60_000,
  });
  // The browser never reached the indexer; the indexer (up for everyone else) indexes the vote.
  await until("the own-RPC vote is indexed", async () =>
    (await votes()).some((v) => v.voter === w.own!.address.toLowerCase())
  );
});
