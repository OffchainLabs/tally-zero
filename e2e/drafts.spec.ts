import { expect, test } from "@playwright/test";

import { useLocalStack } from "./fixtures/network";
import { descriptionInput } from "./fixtures/proposal-form";
import { signedInPage } from "./fixtures/session";

// Covers the eight draft routes end to end:
//   POST/GET  /api/me/drafts
//   GET/PATCH /api/me/drafts/:id
//   POST      /api/me/drafts/:id/publish
//   GET       /api/drafts/shared/:slug
//   POST      /api/drafts/shared/:slug/submitted
//   DELETE    /api/me/drafts/:id
//
// One long test rather than several, on purpose. Drafts are server state keyed
// on the signing address, so separate tests would either share a draft (making
// them order-dependent) or each create their own and leave rows behind. A single
// lifecycle creates exactly one draft and deletes it at the end.
test("draft lifecycle: save, reopen, publish, share, mark submitted", async ({
  browser,
}) => {
  const page = await signedInPage(browser, "drafts", "/proposal/new");
  const marker = `E2E draft ${Date.now()}`;

  // --- save ------------------------------------------------------------------
  // The markdown H1 becomes the derived draft name, which is also what the
  // list is asserted on below.
  await descriptionInput(page).fill(
    `# ${marker}\n\nBody written by the drafts e2e spec.`
  );

  await page.getByTestId("open-save-to-drafts").click();
  await expect(page.getByTestId("draft-title-input")).toHaveValue(marker);
  await page.getByTestId("confirm-save-to-drafts").click();
  await expect(page.getByText("Saved to your drafts.")).toBeVisible();

  // --- list ------------------------------------------------------------------
  await page.goto("/drafts");
  const row = page.getByTestId("draft-title").filter({ hasText: marker });
  await expect(row).toBeVisible();

  // --- reopen ----------------------------------------------------------------
  // Proves GET /api/me/drafts/:id and that ?draft= seeds the form instead of
  // the localStorage autosave.
  await page.getByRole("link", { name: "Open in form" }).first().click();
  await expect(descriptionInput(page)).toHaveValue(new RegExp(marker));

  // --- update ----------------------------------------------------------------
  await page.getByTestId("open-save-to-drafts").click();
  // Reopened from a stored draft, so the dialog keeps its name rather than
  // re-deriving one.
  await expect(page.getByTestId("draft-title-input")).toHaveValue(marker);
  await page.getByTestId("confirm-save-to-drafts").click();
  await expect(page.getByText("Draft updated.")).toBeVisible();

  // --- publish ---------------------------------------------------------------
  await page.goto("/drafts");
  await page.getByTestId("publish-draft").first().click();
  await page.getByTestId("confirm-publish").click();
  await expect(page.getByText(/share link is ready/)).toBeVisible();

  // The slug is minted by the server; read it off the link rather than guessing.
  const shareHref = await page
    .locator('a[href^="/drafts/shared/"]')
    .first()
    .getAttribute("href");
  expect(shareHref).toBeTruthy();
  const slug = shareHref!.split("/").pop()!;

  // --- share (no session) ----------------------------------------------------
  // A fresh context with no session: the slug alone is enough to *read* the
  // draft, which is the whole point of publishing.
  const anonContext = await browser.newContext();
  await useLocalStack(anonContext);
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`/drafts/shared/${slug}`);
  await expect(anonPage.getByTestId("shared-draft-title")).toHaveText(marker);
  // Recording a submission is a different matter: that route is behind
  // requireSession, so an anonymous reader is told to sign in rather than
  // handed a form that would 401.
  await expect(anonPage.getByTestId("submit-needs-signin")).toBeVisible();
  await expect(anonPage.getByTestId("mark-submitted")).toBeDisabled();
  await anonContext.close();

  // --- mark submitted, as someone else ---------------------------------------
  // The `second` wallet did not author this draft. The route requires a session
  // but not authorship, because the delegate who actually submits a proposal is
  // usually not the person who drafted it.
  const submitter = await signedInPage(
    browser,
    "second",
    `/drafts/shared/${slug}`
  );
  await submitter.getByTestId("draft-tx-hash").fill(`0x${"ab".repeat(32)}`);
  await submitter
    .getByTestId("draft-governor")
    .fill("0x1111111111111111111111111111111111111111");
  await submitter.getByTestId("draft-proposal-id").fill("12345");
  await submitter.getByTestId("mark-submitted").click();
  await expect(submitter.getByText(/marked submitted/)).toBeVisible();

  // The form is replaced by the record, so the state change is durable.
  await submitter.reload();
  // By role, not text: the page subtitle also says "submitted on chain".
  await expect(
    submitter.getByRole("heading", { name: "Submitted on chain" })
  ).toBeVisible();
  await expect(submitter.getByTestId("mark-submitted")).toHaveCount(0);

  // --- terminal -------------------------------------------------------------
  // `submitted` is the end of the line. Editing, publishing and deleting all
  // require status `draft` (409 not_editable otherwise), so the row must offer
  // none of them — the share link has to keep resolving to what reviewers saw.
  await page.goto("/drafts");
  const submittedRow = page.locator("li", { hasText: marker });
  await expect(submittedRow).toContainText("Submitted");
  await expect(submittedRow.getByTestId("delete-draft")).toHaveCount(0);
  await expect(submittedRow.getByTestId("publish-draft")).toHaveCount(0);
  await expect(
    submittedRow.getByRole("link", { name: "Open in form" })
  ).toHaveCount(0);
});

// DELETE has its own draft because a published one can never be deleted, so the
// lifecycle above has nothing left to remove by the time it finishes.
test("deletes an unpublished draft", async ({ browser }) => {
  const page = await signedInPage(browser, "drafts", "/proposal/new");
  const marker = `E2E disposable ${Date.now()}`;

  await descriptionInput(page).fill(`# ${marker}\n\nCreated to be deleted.`);
  await page.getByTestId("open-save-to-drafts").click();
  await page.getByTestId("confirm-save-to-drafts").click();
  await expect(page.getByText("Saved to your drafts.")).toBeVisible();

  await page.goto("/drafts");
  const row = page.locator("li", { hasText: marker });
  await expect(row).toBeVisible();

  await row.getByTestId("delete-draft").click();
  await row.getByTestId("confirm-delete").click();
  await expect(page.getByText("Draft deleted.")).toBeVisible();
  await expect(page.locator("li", { hasText: marker })).toHaveCount(0);
});

test("refuses to save a draft with no description", async ({ browser }) => {
  const page = await signedInPage(browser, "drafts", "/proposal/new");

  // The API requires a non-empty description, so the button is disabled with the
  // reason rather than letting the request 400.
  const save = page.getByTestId("open-save-to-drafts");
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("title", /description/i);
});

test("an unknown share slug reports itself rather than 500ing", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await useLocalStack(context);
  const page = await context.newPage();

  await page.goto("/drafts/shared/definitely-not-a-real-slug");
  await expect(page.getByTestId("shared-draft-error")).toBeVisible();

  await context.close();
});
