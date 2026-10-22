import { describe, expect, it, vi } from "vitest";

import type { VotePlan, VotePlanStep } from "./api";
import { runVotePlan, VotePlanBlockedError } from "./run-plan";

const plan = (
  steps: VotePlanStep[],
  blockers: VotePlan["blockers"] = []
): VotePlan =>
  ({
    proposalId: "1",
    governor: "0x0000000000000000000000000000000000000001",
    chainId: 1337,
    delegate: "0x0000000000000000000000000000000000000002",
    l1Voter: "0x0000000000000000000000000000000000000002",
    state: "ACTIVE",
    snapshotLocked: false,
    snapshotBlock: "10",
    checkpointBlock: null,
    assertionHash: null,
    provenVotingPower: null,
    blockers,
    steps,
    vote: { to: "0x0000000000000000000000000000000000000001", chainId: 1337 },
    head: "11",
  }) as VotePlan;

const step = (
  kind: VotePlanStep["kind"],
  extra: Partial<VotePlanStep> = {}
): VotePlanStep => ({
  kind,
  label: kind,
  signer: "any",
  chainId: 1337,
  to: "0x0000000000000000000000000000000000000003",
  data: "0x",
  ...extra,
});

describe("runVotePlan", () => {
  it("sends one step per round, signs when asked, and votes once nothing is left", async () => {
    const typedData = { domain: {}, types: {}, primaryType: "X", message: {} };
    const plans = [
      plan([step("l1Claim"), step("checkpoint")]),
      plan([step("checkpoint")]),
      plan([step("signature", { typedData, to: undefined, data: undefined })]),
      plan([step("bundle", { waitForBlock: "12" })]),
      plan([]),
    ];
    const fetchPlan = vi.fn(async (_signature?: string) => plans.shift()!);
    const sendStep = vi.fn(
      async (s: VotePlanStep) => `0x${s.kind}` as `0x${string}`
    );
    const signTypedData = vi.fn(async () => "0x5167" as `0x${string}`);
    const waitForBlock = vi.fn(async () => {});
    const castVote = vi.fn(async () => "0xv07e" as `0x${string}`);

    const tx = await runVotePlan({
      fetchPlan,
      sendStep,
      signTypedData,
      waitForBlock,
      castVote,
    });

    expect(tx).toBe("0xv07e");
    expect(sendStep.mock.calls.map(([s]) => s.kind)).toEqual([
      "l1Claim",
      "checkpoint",
      "bundle",
    ]);
    expect(signTypedData).toHaveBeenCalledWith(typedData);
    // The signature rides along on every later plan request.
    expect(fetchPlan.mock.calls.map(([sig]) => sig)).toEqual([
      undefined,
      undefined,
      undefined,
      "0x5167",
      "0x5167",
    ]);
    expect(waitForBlock).toHaveBeenCalledWith(BigInt(12));
    expect(castVote).toHaveBeenCalledTimes(1);
  });

  it("stops on a blocker without sending anything", async () => {
    const sendStep = vi.fn();
    await expect(
      runVotePlan({
        fetchPlan: async () =>
          plan([], [{ code: "NO_VOTING_POWER", message: "No power." }]),
        sendStep,
        signTypedData: vi.fn(),
        waitForBlock: vi.fn(),
        castVote: vi.fn(),
      })
    ).rejects.toBeInstanceOf(VotePlanBlockedError);
    expect(sendStep).not.toHaveBeenCalled();
  });

  it("re-plans after a step reverts, but not after the user refuses", async () => {
    const plans = [
      plan([step("bundle")]), // reverts: someone locked first
      plan([step("bundle", { calls: ["Prove your voting power"] })]),
      plan([]),
    ];
    const sendStep = vi
      .fn()
      .mockRejectedValueOnce(new Error("execution reverted: SNAPSHOT_LOCKED"))
      .mockResolvedValueOnce("0xb0" as `0x${string}`);
    const events: string[] = [];
    const tx = await runVotePlan({
      fetchPlan: async () => plans.shift()!,
      sendStep,
      signTypedData: vi.fn(),
      waitForBlock: vi.fn(),
      castVote: async () => "0xv" as `0x${string}`,
      isUserRejection: () => false,
      onProgress: (e) => events.push(e.type),
    });
    expect(tx).toBe("0xv");
    expect(sendStep).toHaveBeenCalledTimes(2);
    expect(events).toContain("replan");

    const refused = new Error("User rejected the request.");
    await expect(
      runVotePlan({
        fetchPlan: async () => plan([step("bundle")]),
        sendStep: vi.fn().mockRejectedValue(refused),
        signTypedData: vi.fn(),
        waitForBlock: vi.fn(),
        castVote: vi.fn(),
        isUserRejection: (e) => e === refused,
      })
    ).rejects.toBe(refused);
  });

  it("retries a plan request the indexer fails briefly, then gives up", async () => {
    const fetchPlan = vi
      .fn()
      .mockResolvedValueOnce(plan([step("l1Claim")]))
      .mockRejectedValueOnce(new Error("Indexer upstream error"))
      .mockRejectedValueOnce(new Error("Indexer upstream error"))
      .mockResolvedValueOnce(plan([]));
    const tx = await runVotePlan({
      fetchPlan,
      sendStep: async () => "0xc1" as `0x${string}`,
      signTypedData: vi.fn(),
      waitForBlock: vi.fn(),
      castVote: async () => "0xv" as `0x${string}`,
      retryDelayMs: 0,
    });
    expect(tx).toBe("0xv");
    expect(fetchPlan).toHaveBeenCalledTimes(4);

    const down = new Error("Indexer upstream error");
    const failing = vi.fn().mockRejectedValue(down);
    await expect(
      runVotePlan({
        fetchPlan: failing,
        sendStep: vi.fn(),
        signTypedData: vi.fn(),
        waitForBlock: vi.fn(),
        castVote: vi.fn(),
        retryDelayMs: 0,
      })
    ).rejects.toBe(down);
    expect(failing).toHaveBeenCalledTimes(4);
  });
});
