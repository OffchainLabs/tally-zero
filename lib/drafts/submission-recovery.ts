import { isAddress, isHash } from "viem";

const RECOVERY_CHANGE_EVENT = "arbitrum:draft-submission-recovery";

export type PendingDraftSubmission = {
  transactionHash: `0x${string}`;
  governorAddress: string;
  /** When the wallet broadcast the hash, in ms since the epoch. */
  broadcastAt: number;
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
      // An entry written before broadcast times existed counts from this read,
      // so it does not become discardable the moment the field ships.
      broadcastAt: Number.isFinite(value.broadcastAt)
        ? value.broadcastAt
        : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Stamps the broadcast time; returns the entry as stored. */
export function savePendingSubmission(
  key: string,
  submission: Omit<PendingDraftSubmission, "broadcastAt">
): PendingDraftSubmission {
  const entry = { ...submission, broadcastAt: Date.now() };
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
    window.dispatchEvent(
      new CustomEvent(RECOVERY_CHANGE_EVENT, { detail: key })
    );
  } catch {
    // Recording and the in-page retry still work when browser storage is disabled.
  }
  return entry;
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
      window.dispatchEvent(
        new CustomEvent(RECOVERY_CHANGE_EVENT, { detail: key })
      );
    }
  } catch {
    // Storage may be disabled.
  }
}

/** Observe both other-tab storage writes and broadcasts from detached forms. */
export function subscribePendingSubmission(key: string, onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) onChange();
  };
  const onRecoveryChange = (event: Event) => {
    if ((event as CustomEvent<string>).detail === key) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(RECOVERY_CHANGE_EVENT, onRecoveryChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(RECOVERY_CHANGE_EVENT, onRecoveryChange);
  };
}
