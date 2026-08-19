import { expect, test } from "@playwright/test";

import { useLocalStack } from "./fixtures/network";

/**
 * Governance-core coverage: the proposal lifecycle view.
 *
 * This is the browser half of a ladder. `selectRelevantStageTypes` in
 * `components/proposal/stages/stage-utils.ts` decides which stages a proposal
 * will go through, and its unit tests pin that selection against the real
 * gov-tracker list. This spec proves the selection actually reaches the DOM
 * across the RSC/client boundary — a unit test cannot show that the Lifecycle
 * tab renders what the selector returns.
 *
 * No session and no wallet: these pages are public reads, so this spec spends
 * no SIWE nonce and needs no entry in DEV_WALLETS / AUTH_WALLETS.
 *
 * Deliberately not covered here, both for want of a fixture rather than intent:
 *  - the Treasury 4-stage path. gov-tracker's bundled cache contains 85
 *    proposals and every one is Core, so there is no Treasury proposal to
 *    navigate to. Proving that path in a browser needs a stubbed indexer
 *    response; the selection itself is unit-tested.
 *  - the Defeated 2-stage path, for the same reason.
 */

// A Core-governor proposal from gov-tracker's bundled cache, so the page is
// prerendered by generateStaticParams and needs no indexer round-trip to load.
const CORE_PROPOSAL_ID =
  "60371879178081104082641012273221287927865067413661362234634146098631763379427";

/** The full Core lifecycle, in gov-tracker's order. */
const CORE_STAGES = [
  "Proposal Created",
  "Voting Active",
  "Proposal Queued",
  "L2 Timelock",
  "L2→L1 Message",
  "L1 Timelock",
  "Retryable Executed",
];

/** Stages that only exist for Security Council election proposals. */
const ELECTION_STAGES = [
  "Create Election",
  "Nominee Election",
  "Nominee Vetting",
  "Member Election",
];

test.describe("proposal lifecycle", () => {
  // Both chains are Nitro compiled to wasm, served over HTTP by
  // e2e/support/browser-nitro-host.mjs (L1 on :8545, L2 on :8547). Everything
  // that would leave the machine stays blocked, so a failed engine cannot be
  // masked by a public endpoint answering instead.
  test.beforeEach(async ({ page }) => {
    await useLocalStack(page);
  });

  test("renders the full Core L1 round-trip on the Lifecycle tab", async ({
    page,
  }) => {
    await page.goto(`/proposal/${CORE_PROPOSAL_ID}`);

    // The lifecycle lives behind its own tab; the stage tracker does not mount
    // until it is opened, so a spec that only visits the page sees no stages.
    await page.getByRole("tab", { name: "Lifecycle" }).click();
    await expect(page.getByText(CORE_STAGES[0]!).first()).toBeVisible();

    const headings = await page.locator("h4").allTextContents();

    // Exact list, in order: this is what selectRelevantStageTypes returns for a
    // live Core proposal, so it catches both a wrong filter and a wrong order.
    expect(headings).toEqual(CORE_STAGES);
  });

  test("omits the election-only stages for an ordinary proposal", async ({
    page,
  }) => {
    await page.goto(`/proposal/${CORE_PROPOSAL_ID}`);
    await page.getByRole("tab", { name: "Lifecycle" }).click();
    await expect(page.getByText(CORE_STAGES[0]!).first()).toBeVisible();

    const headings = await page.locator("h4").allTextContents();
    for (const electionStage of ELECTION_STAGES) {
      expect(headings).not.toContain(electionStage);
    }
  });

  test("labels the proposal with its governor and quorum type", async ({
    page,
  }) => {
    await page.goto(`/proposal/${CORE_PROPOSAL_ID}`);

    // Governor identification drives the whole lifecycle selection, so a wrong
    // label here means the stage list below it is wrong too.
    await expect(page.getByText("Core Governor").first()).toBeVisible();
    await expect(page.getByText("Constitutional Quorum").first()).toBeVisible();
  });
});
