/* eslint-disable no-process-env */
/**
 * A Safe registers its L1 voting address with signatures collected off chain through a real Safe
 * Transaction Service (e2e/l1-voting/safe-tx-service.sh runs safe-global's service against the
 * testnode's L2), then executes with them. Checked in the page, against the service's own API,
 * on chain, and through the indexer.
 *
 * Runs on the stack e2e/l1-voting/run-worst-case.sh boots, which starts the service for this spec.
 */
import { expect, test } from "@playwright/test";

import { DEV_WALLETS } from "../fixtures/wallets";
import { recordedPage, saveVideos } from "./recording";
import { INDEXER_REPO, scenario } from "./scenario";

const INDEXER = process.env.GOVERNANCE_INDEXER_URL ?? "http://localhost:42069";
const SERVICE = process.env.NEXT_PUBLIC_SAFE_TX_SERVICE_URL ?? "";
const SAFE = "0x8Df5b801aD8FD2F9589c284979e6795f418A5c9B";

test.skip(
  !INDEXER_REPO || !SERVICE,
  "needs run-worst-case.sh with the local Safe Transaction Service"
);
test.describe.configure({ mode: "serial" });
test.afterEach(async ({}, testInfo) => saveVideos(testInfo));

async function json<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

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

test("a 2-of-2 Safe registers through the Safe Transaction Service, signed off chain", async ({
  browser,
}) => {
  test.setTimeout(30 * 60_000);
  await scenario("safe-threshold", SAFE, 2);
  await until("the service sees the new threshold", async () => {
    const info = await json(`${SERVICE}/api/v1/safes/${SAFE}/`);
    return info.threshold === 2;
  });
  const voter = (await scenario("new-l1-account")).checks as unknown as {
    address: string;
  };

  // Owner #1 builds the transaction and proposes it to the other owners through the service.
  const first = await recordedPage(
    browser,
    DEV_WALLETS.profile,
    "/delegates/l1-registration"
  );
  await first.getByTestId("l1-reg-delegate").fill(SAFE);
  await first.getByTestId("l1-reg-l1-voter").fill(voter.address);
  await first.getByTestId("l1-reg-safe-prepare").click();
  const safeTxHash = (await first
    .getByTestId("safe-tx-hash")
    .textContent())!.trim();
  await expect(first.getByTestId("safe-service-confirmations")).toContainText(
    "not proposed yet"
  );
  await first.getByTestId("safe-service-propose").click();
  await expect(first.getByTestId("safe-service-confirmations")).toContainText(
    DEV_WALLETS.profile.address,
    { ignoreCase: true, timeout: 60_000 }
  );
  const proposed = await json(
    `${SERVICE}/api/v1/multisig-transactions/${safeTxHash}/`
  );
  expect(proposed.safe.toLowerCase()).toBe(SAFE.toLowerCase());
  expect(proposed.confirmations).toHaveLength(1);
  expect(proposed.isExecuted).toBe(false);
  // Off chain only: nothing approved on chain yet, so one owner cannot execute.
  await expect(first.getByTestId("safe-execute")).toBeDisabled();

  // Owner #2 finds the same transaction and adds its signature through the service.
  const second = await recordedPage(
    browser,
    DEV_WALLETS.second,
    "/delegates/l1-registration"
  );
  await second.getByTestId("l1-reg-delegate").fill(SAFE);
  await second.getByTestId("l1-reg-l1-voter").fill(voter.address);
  await second.getByTestId("l1-reg-safe-prepare").click();
  await expect(second.getByTestId("safe-tx-hash")).toHaveText(safeTxHash);
  await expect(second.getByTestId("safe-service-confirmations")).toContainText(
    DEV_WALLETS.profile.address,
    { ignoreCase: true, timeout: 60_000 }
  );
  await second.getByTestId("safe-service-confirm").click();
  await expect(second.getByTestId("safe-service-confirmations")).toContainText(
    DEV_WALLETS.second.address,
    { ignoreCase: true, timeout: 60_000 }
  );
  const confirmed = await json(
    `${SERVICE}/api/v1/multisig-transactions/${safeTxHash}/`
  );
  expect(confirmed.confirmations).toHaveLength(2);

  // Either owner can now execute with the two off-chain signatures.
  await second.getByTestId("safe-execute").click();
  await expect(second.getByTestId("l1-reg-l2-claim")).toContainText(
    voter.address,
    {
      ignoreCase: true,
      timeout: 120_000,
    }
  );
  await until("the indexer has the Safe's new claim", async () => {
    const reg = await json(`${INDEXER}/api/l1-voting/registrations/${SAFE}`);
    return (
      reg.l2Claim?.l1Address?.toLowerCase() === voter.address.toLowerCase()
    );
  });
  await until("the service indexed the execution", async () => {
    const tx = await json(
      `${SERVICE}/api/v1/multisig-transactions/${safeTxHash}/`
    );
    return tx.isExecuted && tx.isSuccessful;
  });
});
