/* eslint-disable no-process-env */
/**
 * L1 voting registration in the browser: an EOA delegate names a separate voting address on
 * Arbitrum One, which becomes provable once an assertion confirms and is then accepted on
 * Ethereum; a Safe delegate revokes its voting address and names a new one through a Safe
 * transaction. Accounts come from the indexer repo's scenario CLI. A Safe registering through
 * the Safe Transaction Service is safe-service.spec.ts.
 *
 * Runs on the stack e2e/l1-voting/run-worst-case.sh boots:
 *   SPECS=e2e/l1-voting/registration.spec.ts e2e/l1-voting/run-worst-case.sh
 */
import { expect, test } from "@playwright/test";

import { recordedPage, saveVideos, type Wallet } from "./recording";
import { INDEXER_REPO, scenario } from "./scenario";

const INDEXER = process.env.GOVERNANCE_INDEXER_URL ?? "http://localhost:42069";
const SAFE = "0x8Df5b801aD8FD2F9589c284979e6795f418A5c9B";
const SAFE_OWNER_1 = {
  key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
};
const ZERO = "0x0000000000000000000000000000000000000000";

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

const w: Record<string, Wallet> = {};

test("setup: a fresh delegate and voting addresses", async () => {
  test.setTimeout(20 * 60_000);
  w.sep = await sc("new-delegate");
  w.sepVoter = await sc("new-l1-account");
  w.safeVoter = await sc("new-l1-account");
});

test("an EOA names a separate voting address, which accepts on Ethereum", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  const owner = await recordedPage(
    browser,
    w.sep,
    "/delegates/l1-registration"
  );
  await expect(owner.getByTestId("l1-reg-l2-claim")).toContainText(
    "an EOA can sign",
    { timeout: 120_000 }
  );
  await owner.getByTestId("l1-reg-l1-voter").fill(w.sepVoter.address);
  await owner.getByTestId("l1-reg-l2-submit").click();
  await expect(owner.getByTestId("l1-reg-l2-claim")).toContainText(
    w.sepVoter.address,
    { ignoreCase: true, timeout: 120_000 }
  );
  await expect(owner.getByTestId("l1-reg-provable")).toContainText("not yet");
  await sc("settle");
  await expect(owner.getByTestId("l1-reg-provable")).toContainText("yes", {
    timeout: 120_000,
  });

  const voter = await recordedPage(
    browser,
    w.sepVoter,
    "/delegates/l1-registration"
  );
  await voter.getByTestId("l1-reg-delegate").fill(w.sep.address);
  await voter.getByTestId("l1-reg-l1-submit").click();
  await expect(voter.getByTestId("l1-reg-l1-done")).toBeVisible({
    timeout: 120_000,
  });
  const reg = await api(`/api/l1-voting/registrations/${w.sep.address}`);
  expect(reg.l1Claimers.map((c: any) => c.l1Address.toLowerCase())).toContain(
    w.sepVoter.address.toLowerCase()
  );
});

test("a Safe revokes its voting address, then names a new one", async ({
  browser,
}) => {
  test.setTimeout(45 * 60_000);
  const owner = await recordedPage(
    browser,
    SAFE_OWNER_1,
    "/delegates/l1-registration"
  );
  await owner.getByTestId("l1-reg-delegate").fill(SAFE);

  async function safeClaim(l1Voter: string) {
    await owner.getByTestId("l1-reg-l1-voter").fill(l1Voter);
    await owner.getByTestId("l1-reg-safe-prepare").click();
    const hash = (await owner
      .getByTestId("safe-tx-hash")
      .textContent())!.trim();
    const approvals = (await owner
      .getByTestId("safe-approvals")
      .textContent())!;
    if (/of 2/.test(approvals)) {
      await sc("safe-approve", SAFE, hash);
      await owner.getByRole("button", { name: "Refresh approvals" }).click();
    }
    await owner.getByTestId("safe-execute").click();
    await expect(owner.getByTestId("safe-tx-hash")).toHaveCount(0, {
      timeout: 120_000,
    });
  }

  // Revoke: claiming the zero address leaves nothing provable for the Safe.
  await safeClaim(ZERO);
  await expect(owner.getByTestId("l1-reg-l2-claim")).toContainText("revoked", {
    timeout: 120_000,
  });

  await safeClaim(w.safeVoter.address);
  await expect(owner.getByTestId("l1-reg-l2-claim")).toContainText(
    w.safeVoter.address,
    { ignoreCase: true, timeout: 120_000 }
  );
  await sc("settle");
  await expect(owner.getByTestId("l1-reg-provable")).toContainText("yes", {
    timeout: 120_000,
  });
});
