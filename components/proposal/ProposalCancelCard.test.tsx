import { renderToStaticMarkup } from "react-dom/server";
import { keccak256, stringToBytes } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import { GOVERNORS } from "@/config/governors";

import {
  ProposalCancelCard,
  getProposalCancelButtonLabel,
} from "./ProposalCancelCard";

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

  it("does not render a connect prompt for pending proposals when wallet is unconnected", () => {
    const html = renderCard();

    expect(html).not.toContain("Proposal Cancellation");
    expect(html).not.toContain("Connect Wallet");
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
});

describe("getProposalCancelButtonLabel", () => {
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
