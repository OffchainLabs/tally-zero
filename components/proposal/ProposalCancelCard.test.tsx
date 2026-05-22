import { renderToStaticMarkup } from "react-dom/server";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  stringToBytes,
  toFunctionSelector,
  type Abi,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS } from "@/config/governors";

import {
  ProposalCancelCard,
  buildCancelArgs,
  getProposalCancelButtonLabel,
  getProposalCancelSimulationErrorMessage,
  getProposalCancelVisibility,
  isUserRejectedError,
} from "./ProposalCancelCard";

const OZ_GOVERNOR_CANCEL_SELECTOR = "0x452115d6";
const OZ_GOVERNOR_CANCEL_SIGNATURE =
  "cancel(address[],uint256[],bytes[],bytes32)";

const CANCEL_ABI = [
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "calldatas", type: "bytes[]" },
      { name: "descriptionHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

const PROPOSER = "0x1111111111111111111111111111111111111111";
const OTHER_ACCOUNT = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  appKitOpen: vi.fn(),
  switchChain: vi.fn(),
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  useSimulateContract: vi.fn(),
  useSwitchChain: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
  writeContract: vi.fn(),
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({
    open: mocks.appKitOpen,
  }),
}));

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useChainId: mocks.useChainId,
  useSimulateContract: mocks.useSimulateContract,
  useSwitchChain: mocks.useSwitchChain,
  useWaitForTransactionReceipt: mocks.useWaitForTransactionReceipt,
  useWriteContract: mocks.useWriteContract,
}));

function resetMocks() {
  vi.clearAllMocks();

  mocks.useAccount.mockReturnValue({
    address: undefined,
    isConnected: false,
  });
  mocks.useChainId.mockReturnValue(ARBITRUM_CHAIN_ID);
  mocks.useSimulateContract.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
  });
  mocks.useSwitchChain.mockReturnValue({
    error: null,
    isPending: false,
    switchChain: mocks.switchChain,
  });
  mocks.useWaitForTransactionReceipt.mockReturnValue({
    error: null,
    isLoading: false,
    isSuccess: false,
  });
  mocks.useWriteContract.mockReturnValue({
    error: null,
    isPending: false,
    writeContract: mocks.writeContract,
  });
}

describe("ProposalCancelCard", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("renders a connect prompt for pending proposals with a known proposer", () => {
    const html = renderCard();

    expect(html).toContain("Proposal Cancellation");
    expect(html).toContain("Connect Wallet");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });

  it("does not render for non-pending proposals", () => {
    connectWallet(PROPOSER);

    const html = renderCard({ state: "Active" });

    expect(html).toBe("");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });

  it("does not render for a connected non-proposer", () => {
    connectWallet(OTHER_ACCOUNT);

    const html = renderCard();

    expect(html).toBe("");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });

  it("does not render when proposer metadata is missing", () => {
    connectWallet(PROPOSER);

    const html = renderCard({ proposer: "Unknown" });

    expect(html).toBe("");
  });

  it("asks the proposer to switch to Arbitrum on the wrong chain", () => {
    connectWallet(PROPOSER);
    mocks.useChainId.mockReturnValue(1);

    const html = renderCard();

    expect(html).toContain("Switch to Arbitrum");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });

  it("simulates cancel(address[],uint256[],bytes[],bytes32) for the connected proposer", () => {
    connectWallet(PROPOSER);
    mocks.useSimulateContract.mockReturnValue({
      data: { request: { address: GOVERNORS.treasury.address } },
      error: null,
      isError: false,
      isFetching: false,
    });

    const html = renderCard({
      targets: [PROPOSER],
      values: ["0"],
      calldatas: ["0x12345678"],
      description: "# Test Proposal",
    });

    expect(html).toContain("Cancel Proposal");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        account: PROPOSER,
        args: [
          [PROPOSER],
          [BigInt(0)],
          ["0x12345678"],
          keccak256(stringToBytes("# Test Proposal")),
        ],
        chainId: ARBITRUM_CHAIN_ID,
        functionName: "cancel",
        query: { enabled: true },
      })
    );
  });

  it("does not simulate when proposal has no action data", () => {
    connectWallet(PROPOSER);

    renderCard();

    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });
});

describe("ProposalCancelCard - proposer verification", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("enables simulation when connected wallet matches proposer (exact)", () => {
    connectWallet(PROPOSER);

    renderCard({
      targets: [PROPOSER],
      values: ["0"],
      calldatas: ["0x"],
      description: "test",
    });

    const call = mocks.useSimulateContract.mock.calls.at(-1)?.[0];
    expect(call?.query).toEqual({ enabled: true });
    expect(call?.account).toBe(PROPOSER);
  });

  it("enables simulation when connected wallet matches proposer (case-insensitive)", () => {
    const MIXED_CASE_PROPOSER = "0xAaBbCcDdEeFfaAbBcCdDeEfFAaBbCcDdEeFfAaBb";
    const LOWER_CASE_WALLET = MIXED_CASE_PROPOSER.toLowerCase();
    connectWallet(LOWER_CASE_WALLET);

    renderCard({
      proposer: MIXED_CASE_PROPOSER,
      targets: [PROPOSER],
      values: ["0"],
      calldatas: ["0x"],
      description: "test",
    });

    const call = mocks.useSimulateContract.mock.calls.at(-1)?.[0];
    expect(call?.query).toEqual({ enabled: true });
    expect(call?.account).toBe(LOWER_CASE_WALLET);
  });

  it("disables simulation and hides card when connected wallet does not match proposer", () => {
    connectWallet(OTHER_ACCOUNT);

    const html = renderCard({
      targets: [PROPOSER],
      values: ["0"],
      calldatas: ["0x"],
      description: "test",
    });

    expect(html).toBe("");
    const call = mocks.useSimulateContract.mock.calls.at(-1)?.[0];
    expect(call?.query).toEqual({ enabled: false });
    expect(call?.account).toBeUndefined();
  });

  it("does not pass an account to the simulation when wallet is disconnected", () => {
    renderCard({
      targets: [PROPOSER],
      values: ["0"],
      calldatas: ["0x"],
      description: "test",
    });

    const call = mocks.useSimulateContract.mock.calls.at(-1)?.[0];
    expect(call?.account).toBeUndefined();
    expect(call?.query).toEqual({ enabled: false });
  });

  it("does not enable simulation on wrong chain even if connected wallet is proposer", () => {
    connectWallet(PROPOSER);
    mocks.useChainId.mockReturnValue(1);

    renderCard({
      targets: [PROPOSER],
      values: ["0"],
      calldatas: ["0x"],
      description: "test",
    });

    const call = mocks.useSimulateContract.mock.calls.at(-1)?.[0];
    expect(call?.query).toEqual({ enabled: false });
  });
});

describe("ProposalCancelCard - tx shape matches OZ Governor cancel ABI", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("invokes the cancel function with the OZ-standard signature", () => {
    connectWallet(PROPOSER);
    renderCard({
      targets: [PROPOSER],
      values: ["0"],
      calldatas: ["0x"],
      description: "test",
    });

    const call = mocks.useSimulateContract.mock.calls.at(-1)?.[0];
    expect(call?.functionName).toBe("cancel");
    expect(call?.address).toBe(GOVERNORS.treasury.address);
    expect(call?.chainId).toBe(ARBITRUM_CHAIN_ID);
    expect(call?.abi).toEqual([
      {
        type: "function",
        name: "cancel",
        stateMutability: "nonpayable",
        inputs: [
          { name: "targets", type: "address[]" },
          { name: "values", type: "uint256[]" },
          { name: "calldatas", type: "bytes[]" },
          { name: "descriptionHash", type: "bytes32" },
        ],
        outputs: [{ name: "", type: "uint256" }],
      },
    ]);
  });

  it("produces encoded calldata whose selector matches the OZ Governor cancel selector", () => {
    expect(toFunctionSelector(OZ_GOVERNOR_CANCEL_SIGNATURE)).toBe(
      OZ_GOVERNOR_CANCEL_SELECTOR
    );

    const args = buildCancelArgs({
      id: "123",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["0"],
      signatures: [""],
      calldatas: ["0xdeadbeef"],
      startBlock: "1",
      endBlock: "2",
      description: "# Cancel Me",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });
    expect(args).not.toBeNull();

    const encoded = encodeFunctionData({
      abi: CANCEL_ABI,
      functionName: "cancel",
      args: args!,
    });
    expect(encoded.slice(0, 10)).toBe(OZ_GOVERNOR_CANCEL_SELECTOR);
  });

  it("encodes args that round-trip through decodeFunctionData", () => {
    const targets = [PROPOSER, OTHER_ACCOUNT];
    const values = ["1000000000000000000", "0"];
    const calldatas = ["0x12345678", "0xabcdef00"];
    const description = "# Multi-action proposal";

    const args = buildCancelArgs({
      id: "456",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.core.address,
      targets,
      values,
      signatures: ["", ""],
      calldatas,
      startBlock: "1",
      endBlock: "2",
      description,
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });
    expect(args).not.toBeNull();

    const encoded = encodeFunctionData({
      abi: CANCEL_ABI,
      functionName: "cancel",
      args: args!,
    });
    const decoded = decodeFunctionData({ abi: CANCEL_ABI, data: encoded });

    expect(decoded.functionName).toBe("cancel");
    expect(decoded.args).toEqual([
      targets,
      [BigInt(values[0]), BigInt(values[1])],
      calldatas,
      keccak256(stringToBytes(description)),
    ]);
  });

  it("computes descriptionHash as keccak256(utf8(description)) to match OZ hashProposal", () => {
    const description = "# Proposal title\n\nSome details";

    const args = buildCancelArgs({
      id: "789",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["0"],
      signatures: [""],
      calldatas: ["0x"],
      startBlock: "1",
      endBlock: "2",
      description,
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    const descriptionHash = args![3];
    expect(descriptionHash).toBe(keccak256(stringToBytes(description)));

    // OZ hashProposal: uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash)))
    const encodedTuple = encodeAbiParameters(
      [
        { type: "address[]" },
        { type: "uint256[]" },
        { type: "bytes[]" },
        { type: "bytes32" },
      ],
      args!
    );
    const proposalId = BigInt(keccak256(encodedTuple));
    expect(proposalId).toBeGreaterThan(BigInt(0));
  });

  it("passes proposal args through useSimulateContract in the exact ABI tuple order", () => {
    connectWallet(PROPOSER);
    const targets = [PROPOSER, OTHER_ACCOUNT];
    const values = ["0", "42"];
    const calldatas = ["0xaa", "0xbb"];
    const description = "Cancel test";

    renderCard({ targets, values, calldatas, description });

    const call = mocks.useSimulateContract.mock.calls.at(-1)?.[0];
    expect(call?.args).toEqual([
      targets,
      [BigInt(0), BigInt(42)],
      calldatas,
      keccak256(stringToBytes(description)),
    ]);
  });

  it("converts string values to bigint for the uint256[] argument", () => {
    const args = buildCancelArgs({
      id: "1",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["1000000000000000000"],
      signatures: [""],
      calldatas: ["0x"],
      startBlock: "1",
      endBlock: "2",
      description: "test",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    expect(args).not.toBeNull();
    expect(args![1][0]).toBe(BigInt("1000000000000000000"));
    expect(typeof args![1][0]).toBe("bigint");
  });

  it("rejects malformed proposal data so we never encode an invalid cancel call", () => {
    // Non-hex calldata
    expect(
      buildCancelArgs({
        id: "1",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: [PROPOSER],
        values: ["0"],
        signatures: [""],
        calldatas: ["not-hex"],
        startBlock: "1",
        endBlock: "2",
        description: "test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
      })
    ).toBeNull();

    // Invalid address in targets
    expect(
      buildCancelArgs({
        id: "1",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: ["0xnot-an-address"],
        values: ["0"],
        signatures: [""],
        calldatas: ["0x"],
        startBlock: "1",
        endBlock: "2",
        description: "test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
      })
    ).toBeNull();

    // Length mismatch between arrays
    expect(
      buildCancelArgs({
        id: "1",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: [PROPOSER, OTHER_ACCOUNT],
        values: ["0"],
        signatures: [""],
        calldatas: ["0x"],
        startBlock: "1",
        endBlock: "2",
        description: "test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
      })
    ).toBeNull();

    // Non-numeric value
    expect(
      buildCancelArgs({
        id: "1",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: [PROPOSER],
        values: ["not-a-number"],
        signatures: [""],
        calldatas: ["0x"],
        startBlock: "1",
        endBlock: "2",
        description: "test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
      })
    ).toBeNull();
  });
});

describe("ProposalCancelCard helpers", () => {
  it("derives visibility from state, proposer, governor, and wallet", () => {
    expect(
      getProposalCancelVisibility({
        accountAddress: undefined,
        governorAddress: GOVERNORS.treasury.address,
        isConnected: false,
        proposer: PROPOSER,
        state: "Pending",
      })
    ).toBe("connect");
    expect(
      getProposalCancelVisibility({
        accountAddress: PROPOSER,
        governorAddress: GOVERNORS.treasury.address,
        isConnected: true,
        proposer: PROPOSER,
        state: "Pending",
      })
    ).toBe("cancel");
    expect(
      getProposalCancelVisibility({
        accountAddress: OTHER_ACCOUNT,
        governorAddress: GOVERNORS.treasury.address,
        isConnected: true,
        proposer: PROPOSER,
        state: "Pending",
      })
    ).toBe("hidden");
  });

  it("prioritizes cancellation button progress labels", () => {
    expect(
      getProposalCancelButtonLabel({
        isConfirmed: true,
        isConfirming: true,
        isSimulating: true,
        isSwitchingChain: true,
        isWriting: true,
      })
    ).toBe("Proposal Canceled");
    expect(
      getProposalCancelButtonLabel({
        isConfirmed: false,
        isConfirming: true,
        isSimulating: true,
        isSwitchingChain: true,
        isWriting: true,
      })
    ).toBe("Confirming");
    expect(
      getProposalCancelButtonLabel({
        isConfirmed: false,
        isConfirming: false,
        isSimulating: false,
        isSwitchingChain: false,
        isWriting: false,
      })
    ).toBe("Cancel Proposal");
  });

  it("returns cancellation-specific simulation errors", () => {
    expect(
      getProposalCancelSimulationErrorMessage(
        new Error("execution reverted: only proposer")
      )
    ).toBe("Only the proposal creator can cancel this proposal.");
    expect(
      getProposalCancelSimulationErrorMessage(
        new Error("execution reverted: proposal not pending")
      )
    ).toBe("Proposal cancellation is only available before voting starts.");
    expect(
      getProposalCancelSimulationErrorMessage(
        new Error("Governor: too late to cancel")
      )
    ).toBe("Proposal cancellation is only available before voting starts.");
    expect(
      getProposalCancelSimulationErrorMessage(
        new Error("Governor: unknown proposal id")
      )
    ).toBe(
      "Proposal data does not match the on-chain proposal. Cannot cancel."
    );
  });

  it("builds cancel args from a proposal", () => {
    const args = buildCancelArgs({
      id: "123",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [PROPOSER],
      values: ["0"],
      signatures: [""],
      calldatas: ["0x12345678"],
      startBlock: "1",
      endBlock: "2",
      description: "# Test Proposal",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    expect(args).toEqual([
      [PROPOSER],
      [BigInt(0)],
      ["0x12345678"],
      keccak256(stringToBytes("# Test Proposal")),
    ]);
  });

  it("returns null cancel args when targets are missing", () => {
    const args = buildCancelArgs({
      id: "123",
      proposer: PROPOSER,
      contractAddress: GOVERNORS.treasury.address,
      targets: [],
      values: [],
      signatures: [],
      calldatas: [],
      startBlock: "1",
      endBlock: "2",
      description: "# Test Proposal",
      networkId: String(ARBITRUM_CHAIN_ID),
      state: "Pending",
    });

    expect(args).toBeNull();
  });

  it("detects wallet rejection errors", () => {
    expect(isUserRejectedError({ code: 4001 })).toBe(true);
    expect(isUserRejectedError("user denied transaction signature")).toBe(true);
    expect(isUserRejectedError(new Error("RPC unavailable"))).toBe(false);
  });
});

function connectWallet(address: string) {
  mocks.useAccount.mockReturnValue({
    address,
    isConnected: true,
  });
}

function renderCard(
  proposalOverrides: Partial<
    Parameters<typeof ProposalCancelCard>[0]["proposal"]
  > = {}
): string {
  return renderToStaticMarkup(
    <ProposalCancelCard
      proposal={{
        id: "123",
        proposer: PROPOSER,
        contractAddress: GOVERNORS.treasury.address,
        targets: [],
        values: [],
        signatures: [],
        calldatas: [],
        startBlock: "1",
        endBlock: "2",
        description: "Proposal # Test",
        networkId: String(ARBITRUM_CHAIN_ID),
        state: "Pending",
        ...proposalOverrides,
      }}
    />
  );
}
