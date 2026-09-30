import type { DraftSubmission } from "@/lib/siwe/types";

/** Stored metadata is only a recovery hint; callers must verify its receipt. */
export function readPendingSubmission(key: string): DraftSubmission | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (
      !value ||
      typeof value.transactionHash !== "string" ||
      !/^0x[\da-f]{64}$/i.test(value.transactionHash) ||
      typeof value.governorAddress !== "string" ||
      !/^0x[\da-f]{40}$/i.test(value.governorAddress) ||
      typeof value.proposalId !== "string" ||
      !/^\d{1,78}$/.test(value.proposalId)
    ) {
      return null;
    }
    return {
      transactionHash: value.transactionHash,
      governorAddress: value.governorAddress,
      proposalId: value.proposalId,
    };
  } catch {
    return null;
  }
}

export function savePendingSubmission(
  key: string,
  submission: DraftSubmission
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
