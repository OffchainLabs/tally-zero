import { isAddress, isHash } from "viem";

export type PendingDraftSubmission = {
  transactionHash: `0x${string}`;
  governorAddress: string;
};

/** Stored metadata is only a recovery hint; callers must verify its receipt. */
export function readPendingSubmission(
  key: string
): PendingDraftSubmission | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (
      !value ||
      typeof value.transactionHash !== "string" ||
      !isHash(value.transactionHash) ||
      typeof value.governorAddress !== "string" ||
      !isAddress(value.governorAddress, { strict: false })
    ) {
      return null;
    }
    return {
      transactionHash: value.transactionHash,
      governorAddress: value.governorAddress,
    };
  } catch {
    return null;
  }
}

export function savePendingSubmission(
  key: string,
  submission: PendingDraftSubmission
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(submission));
  } catch {
    // Recording and the in-page retry still work when browser storage is disabled.
  }
}

export function clearPendingSubmission(
  key: string,
  transactionHash: string
): void {
  try {
    // An older request must not delete a newer recovery entry from another tab.
    if (
      readPendingSubmission(key)?.transactionHash.toLowerCase() ===
      transactionHash.toLowerCase()
    ) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage may be disabled.
  }
}
