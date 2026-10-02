import { GOVERNORS } from "@/config/governors";
import { describe, expect, it } from "vitest";
import { checkDraftReceipt } from "./submission";
import {
  draft,
  governor,
  proposalId,
  receipt,
  txHash,
} from "./submission-fixtures";
const target = "0x2222222222222222222222222222222222222222" as const;

describe("published draft receipt check", () => {
  it("takes matching submission details from the confirmed governor event", () => {
    expect(checkDraftReceipt(receipt(), draft)).toEqual({
      kind: "match",
      submission: {
        transactionHash: txHash,
        governorAddress: governor,
        proposalId,
      },
    });
  });
  it("rejects reverted receipts and missing or unrelated logs", () => {
    expect(checkDraftReceipt(receipt({ status: "reverted" }), draft).kind).toBe(
      "missing"
    );
    expect(checkDraftReceipt(receipt({ address: target }), draft).kind).toBe(
      "missing"
    );
    expect(checkDraftReceipt({ ...receipt(), logs: [] }, draft).kind).toBe(
      "missing"
    );
    expect(
      checkDraftReceipt(
        { ...receipt(), logs: [{ ...receipt().logs[0], data: "0x" }] },
        draft
      ).kind
    ).toBe("missing");
  });
  it("identifies a different proposal, governor, or changed frozen contents", () => {
    expect(
      checkDraftReceipt(receipt({ eventProposalId: "42" }), draft).kind
    ).toBe("different");
    expect(
      checkDraftReceipt(
        receipt({ address: GOVERNORS.core.address as `0x${string}` }),
        draft
      ).kind
    ).toBe("different");
    expect(
      checkDraftReceipt(receipt(), { ...draft, description: "# Changed" }).kind
    ).toBe("different");
    expect(
      checkDraftReceipt(receipt(), {
        ...draft,
        actions: [{ target, value: "1", calldata: "0x" }],
      }).kind
    ).toBe("different");
  });
  it("does not record a private or already submitted draft", () => {
    expect(
      checkDraftReceipt(receipt(), { ...draft, status: "draft" }).kind
    ).toBe("missing");
    expect(
      checkDraftReceipt(receipt(), { ...draft, status: "submitted" }).kind
    ).toBe("missing");
  });
});
