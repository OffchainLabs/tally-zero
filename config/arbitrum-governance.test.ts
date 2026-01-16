import { describe, expect, it } from "vitest";
import { ProposalState } from "./arbitrum-governance";

describe("ProposalState", () => {
  it("has correct enum values", () => {
    expect(ProposalState.PENDING).toBe(0);
    expect(ProposalState.ACTIVE).toBe(1);
    expect(ProposalState.CANCELED).toBe(2);
    expect(ProposalState.DEFEATED).toBe(3);
    expect(ProposalState.SUCCEEDED).toBe(4);
    expect(ProposalState.QUEUED).toBe(5);
    expect(ProposalState.EXPIRED).toBe(6);
    expect(ProposalState.EXECUTED).toBe(7);
  });
});
