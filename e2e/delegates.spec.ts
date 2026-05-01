import { expect, test } from "@playwright/test";

test("delegates page loads with non-empty rows", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/delegates");

  // Wait for the delegate table to render at least one row.
  // The DelegatesTable component renders a <section id="delegates-table">
  // containing a <table> with TanStack-driven <tbody><tr> rows. The 30s
  // timeout accounts for cold-path SQLite worker init (manifest fetch +
  // wasm load + first range request) on the first visit.
  await expect(
    page.locator("#delegates-table table tbody tr").first()
  ).toBeVisible({ timeout: 30_000 });

  expect(consoleErrors).toEqual([]);
});
