import type { Locator, Page } from "@playwright/test";

/**
 * The proposal description input.
 *
 * MDEditor renders its own textarea and its prop types reject extra attributes,
 * so there is no data-testid to hang this on. `.w-md-editor-text-input` is the
 * library's documented class for that element, and CreateProposalForm already
 * depends on sibling classes (`.w-md-editor-toolbar`) in its tooltip
 * MutationObserver — so this leans on the same contract rather than bending
 * production code to suit a test.
 */
export function descriptionInput(page: Page): Locator {
  return page.locator("textarea.w-md-editor-text-input");
}
