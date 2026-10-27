import type {
  PinnedDeployment,
  VotePlan,
} from "@offchainlabs/l1-voting-proving";
import { encodeFunctionData, erc20Abi, getAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkPlan, loadDeployment, UnsafePlanError } from "./trust";

const mocks = vi.hoisted(() => ({
  local: false,
  deployment: vi.fn(),
  pinDeployment: vi.fn(),
  knownDeployment: vi.fn(),
}));
vi.mock("@/config/chains", () => ({
  isLocalChainsEnabled: () => mocks.local,
  LOCAL_L2_CHAIN_ID: 412346,
}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/lib/l1-voting/api", () => ({
  l1VotingApi: { deployment: mocks.deployment },
}));
vi.mock("@offchainlabs/l1-voting-proving", async (importActual) => ({
  ...(await importActual<typeof import("@offchainlabs/l1-voting-proving")>()),
  knownDeployment: mocks.knownDeployment,
  pinDeployment: mocks.pinDeployment,
}));

const addr = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const deployment = {
  governor: addr(1),
  stateMirror: addr(3),
  l1DelegateMapping: addr(4),
  multicall3: addr(5),
  excludeAddress: addr(6),
  l1ChainId: 1,
} as PinnedDeployment;
const delegate = addr(0xd1);
const plan = (steps: VotePlan["steps"]): VotePlan => ({
  proposalId: "7",
  governor: deployment.governor,
  chainId: 1,
  delegate,
  l1Voter: delegate,
  state: "ACTIVE",
  snapshotLocked: true,
  snapshotBlock: "1",
  checkpointBlock: "1",
  assertionHash: null,
  provenVotingPower: null,
  blockers: [],
  steps,
  vote: { to: deployment.governor, chainId: 1 },
  head: "2",
});
const ctx = { deployment, proposalId: "7", delegate, l1Voter: delegate };

describe("checkPlan", () => {
  it("passes a plan with nothing left but the vote", () => {
    expect(checkPlan(plan([]), ctx).steps).toEqual([]);
  });

  it("throws before anything is sent when a step is not L1 voting's", () => {
    const evil = plan([
      {
        kind: "l1Claim",
        label: "Claim your delegate",
        signer: "l1Voter",
        chainId: 1,
        to: addr(0xbad),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [addr(0xbad), BigInt(1)],
        }),
      },
    ]);
    expect(() => checkPlan(evil, ctx)).toThrow(UnsafePlanError);
  });

  it("throws when the vote would go anywhere but the pinned governor", () => {
    expect(() =>
      checkPlan({ ...plan([]), vote: { to: addr(0xbad), chainId: 1 } }, ctx)
    ).toThrow(/doesn't recognise/);
  });
});

describe("loadDeployment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the pinned deployment and never asks the indexer", async () => {
    mocks.knownDeployment.mockReturnValue(deployment);
    await expect(loadDeployment({} as never, 1)).resolves.toBe(deployment);
    expect(mocks.deployment).not.toHaveBeenCalled();
  });

  it("has no deployment where L1 voting isn't deployed", async () => {
    mocks.knownDeployment.mockReturnValue(undefined);
    mocks.local = false;
    await expect(loadDeployment({} as never, 1)).resolves.toBeNull();
    expect(mocks.deployment).not.toHaveBeenCalled();
  });

  it("on the local testnode, reads the deployment from the chain, from the governor", async () => {
    mocks.knownDeployment.mockReturnValue(undefined);
    mocks.local = true;
    mocks.deployment.mockResolvedValue({
      governor: deployment.governor,
      l2ChainId: 412346,
      multicall3: deployment.multicall3,
    });
    mocks.pinDeployment.mockResolvedValue(deployment);
    await expect(loadDeployment({} as never, 1337)).resolves.toBe(deployment);
    expect(mocks.pinDeployment).toHaveBeenCalledWith(
      {},
      deployment.governor,
      expect.objectContaining({ l2ChainId: 412346 })
    );
  });
});
