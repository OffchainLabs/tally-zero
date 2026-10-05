import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftSubmissionStorageKey } from "@/config/storage-keys";

import {
  clearPendingSubmission,
  readPendingSubmission,
  savePendingSubmission,
} from "./submission-recovery";

const subject = "0x1111111111111111111111111111111111111111";
const key = draftSubmissionStorageKey("d1", subject);
const submission = {
  transactionHash: `0x${"ab".repeat(32)}` as `0x${string}`,
  governorAddress: "0x2222222222222222222222222222222222222222",
};

describe("submission recovery storage", () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: vi.fn((name: string) => entries.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => entries.set(name, value)),
    removeItem: vi.fn((name: string) => entries.delete(name)),
  };

  beforeEach(() => {
    entries.clear();
    vi.clearAllMocks();
    vi.stubGlobal("window", { localStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps recovery separate for each draft and subject, normalizing address case", () => {
    savePendingSubmission(key, submission);
    expect(
      readPendingSubmission(
        draftSubmissionStorageKey("d1", subject.toUpperCase())
      )
    ).toEqual(submission);
    expect(
      readPendingSubmission(draftSubmissionStorageKey("d2", subject))
    ).toBeNull();
    expect(
      readPendingSubmission(
        draftSubmissionStorageKey("d1", submission.governorAddress)
      )
    ).toBeNull();
  });

  it.each([
    "not json",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...submission, transactionHash: "0x1234" }),
    JSON.stringify({ ...submission, governorAddress: "invalid" }),
  ])("ignores malformed recovery metadata: %s", (value) => {
    entries.set(key, value);
    expect(readPendingSubmission(key)).toBeNull();
  });

  it("does not let an older completed request delete a newer transaction", () => {
    savePendingSubmission(key, submission);
    clearPendingSubmission(key, `0x${"cd".repeat(32)}`);
    expect(readPendingSubmission(key)).toEqual(submission);
    clearPendingSubmission(key, submission.transactionHash.toUpperCase());
    expect(readPendingSubmission(key)).toBeNull();
  });

  it("tolerates unavailable storage", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("Storage disabled");
      },
    });
    expect(readPendingSubmission(key)).toBeNull();
    expect(() => savePendingSubmission(key, submission)).not.toThrow();
    expect(() =>
      clearPendingSubmission(key, submission.transactionHash)
    ).not.toThrow();
  });
});
