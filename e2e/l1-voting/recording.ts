/* eslint-disable no-process-env */
// Every page a spec opens records video. Each test's recordings are saved under
// $L1_VOTING_VIDEO_DIR (default test-results/l1-voting-videos) as
// "<spec> - <test title> - <n>.webm" once its contexts close.
import {
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { useWallet } from "../fixtures/session";

export const VIDEO_DIR =
  process.env.L1_VOTING_VIDEO_DIR ?? "test-results/l1-voting-videos";

const VIEWPORT = { width: 1280, height: 900 };
const open: { context: BrowserContext; page: Page }[] = [];

export type Wallet = { key: string; address: string };

/** A page with `wallet` connected (or none), recording video, at `path`. */
export async function recordedPage(
  browser: Browser,
  wallet: Wallet | null,
  path: string
): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: `${VIDEO_DIR}/.raw`, size: VIEWPORT },
  });
  const page = await context.newPage();
  if (wallet) await useWallet(page, wallet as never);
  await page.goto(path);
  open.push({ context, page });
  return page;
}

function slug(text: string) {
  return text
    .replace(/[^\w.-]+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Close this test's pages and save their videos under the test's title (call in afterEach). */
export async function saveVideos(testInfo: TestInfo) {
  const pages = open.splice(0);
  const spec = slug(testInfo.titlePath[0] ?? "spec").replace(/\.spec\.ts$/, "");
  let n = 0;
  for (const { context, page } of pages) {
    await context.close();
    const video = page.video();
    if (!video) continue;
    n++;
    const status = testInfo.status === "passed" ? "" : ` [${testInfo.status}]`;
    await video.saveAs(
      `${VIDEO_DIR}/${spec} - ${slug(testInfo.title)} - ${n}${status}.webm`
    );
    await video.delete();
  }
}
