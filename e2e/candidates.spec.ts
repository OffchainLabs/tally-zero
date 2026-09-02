import { expect, test } from "@playwright/test";

import { signedInPage } from "./fixtures/session";
import { DEV_WALLETS } from "./fixtures/wallets";

// Covers GET /api/elections, GET/PUT /api/me/candidate-profile/:electionId, and
// the public GET /api/elections/:id/candidate-profiles/:address.
//
// Candidate profiles are per-election, so every write needs an election that has
// actually been indexed. The testnode bakes no election fixture (the indexer only
// ever writes phase CONTENDER_SUBMISSION, so a synthetic completed election would
// misreport itself — see the plan's dropped items), which means these tests skip
// on a bare stack rather than passing vacuously.
test.describe("candidate profiles", () => {
  test("shows the empty state when no election is indexed", async ({
    browser,
  }) => {
    const page = await signedInPage(
      browser,
      "candidates",
      "/profile/candidate"
    );
    const res = await page.request.get("/api/governance-indexer/api/elections");
    const { elections } = (await res.json()) as { elections: unknown[] };

    test.skip(
      elections.length > 0,
      "an election is indexed, so the empty state is not the case under test"
    );

    await expect(
      page.getByText(/No elections have been indexed yet/)
    ).toBeVisible();
  });

  test.describe("with an indexed election", () => {
    test("saves a version and publishes it to the contender page", async ({
      browser,
    }) => {
      const page = await signedInPage(
        browser,
        "candidates",
        "/profile/candidate"
      );
      const res = await page.request.get(
        "/api/governance-indexer/api/elections"
      );
      const { elections } = (await res.json()) as { elections: unknown[] };

      test.skip(
        elections.length === 0,
        "needs an election indexed on the local stack"
      );

      const name = `E2E Candidate ${Date.now()}`;
      await expect(page.getByTestId("candidate-name")).toBeVisible();
      await page.getByTestId("candidate-name").fill(name);
      await page.getByTestId("candidate-country").fill("Portugal");
      // Stored as a bare handle; the contender page turns it into a URL.
      await page.getByTestId("candidate-twitter").fill("e2e_candidate");
      await page
        .getByTestId("candidate-skills")
        .fill("Solidity, Incident response");
      await page.getByTestId("candidate-motivation").fill("Motivated by e2e.");

      await page.getByTestId("candidate-save").click();
      // Writes are append-only, so the toast names the version it minted.
      await expect(page.getByText(/Saved as version \d+/)).toBeVisible();

      // A reload re-reads it from the indexer rather than local state.
      await page.reload();
      await expect(page.getByTestId("candidate-name")).toHaveValue(name);

      // And it reaches the public contender page, where it is labelled as
      // self-published because this address is not in the candidate registry.
      await page.goto(
        `/security-council/contender/${DEV_WALLETS.candidates.address}`
      );
      await expect(page.getByTestId("candidate-unverified")).toBeVisible();
      await expect(page.getByText(name)).toBeVisible();
      await expect(page.getByText("Incident response")).toBeVisible();
    });
  });
});
