import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";

import {
  MyDelegationPanel,
  refreshMyDelegationData,
} from "./MyDelegationPanel";

const CONNECTED_ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CURRENT_DELEGATE = "0x2222222222222222222222222222222222222222";
const ONE_ARB = BigInt("1000000000000000000");
const L2_RPC = "https://arb.example";

const mocks = vi.hoisted(() => ({
  appKitOpen: vi.fn(),
  invalidateQueries: vi.fn(),
  refetchCurrentDelegate: vi.fn(),
  refetchVotingPower: vi.fn(),
  switchChain: vi.fn(),
  useAccount: vi.fn(),
  useAddressDisplayRecord: vi.fn(),
  useBalance: vi.fn(),
  useChainId: vi.fn(),
  useReadContract: vi.fn(),
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

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useBalance: mocks.useBalance,
  useChainId: mocks.useChainId,
  useReadContract: mocks.useReadContract,
  useSimulateContract: mocks.useSimulateContract,
  useSwitchChain: mocks.useSwitchChain,
  useWaitForTransactionReceipt: mocks.useWaitForTransactionReceipt,
  useWriteContract: mocks.useWriteContract,
}));

vi.mock("@/hooks/use-rpc-settings", () => ({
  useRpcSettings: () => ({
    l1Rpc: "https://eth.example",
    l2Rpc: "https://arb.example",
    l1ChunkSize: 1_000,
    l2ChunkSize: 1_000_000,
    isHydrated: true,
  }),
}));

vi.mock("@/components/container/MyDelegatorsList", () => ({
  MyDelegatorsList: ({ delegateAddress }: { delegateAddress: string }) => (
    <div>Delegators for {delegateAddress}</div>
  ),
}));

vi.mock("@/lib/delegate-cache", () => ({
  useAddressDisplayRecord: mocks.useAddressDisplayRecord,
}));

describe("MyDelegationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    mocks.useBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mocks.useChainId.mockReturnValue(ARBITRUM_CHAIN_ID);
    mocks.useReadContract.mockImplementation(({ functionName }) => {
      if (functionName === "getVotes") {
        return {
          data: undefined,
          isPending: false,
          isError: false,
          refetch: mocks.refetchVotingPower,
        };
      }

      return {
        data: undefined,
        isLoading: false,
        refetch: mocks.refetchCurrentDelegate,
      };
    });
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
    mocks.useAddressDisplayRecord.mockReturnValue(undefined);
  });

  it("renders the disconnected state", () => {
    const html = renderPanel();

    expect(html).toContain("Connect a wallet to manage your delegation.");
    expect(html).toContain("Not connected.");
    expect(html).toContain("Connect Wallet");
    expect(html).not.toContain("Delegators for");
  });

  it("renders current delegation details for a connected wallet", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: { value: ONE_ARB * BigInt(2) },
      isLoading: false,
    });
    mocks.useReadContract.mockImplementation(({ functionName }) => {
      if (functionName === "getVotes") {
        return {
          data: ONE_ARB * BigInt(3),
          isPending: false,
          isError: false,
          refetch: mocks.refetchVotingPower,
        };
      }

      return {
        data: CURRENT_DELEGATE,
        isLoading: false,
        refetch: mocks.refetchCurrentDelegate,
      };
    });
    mocks.useAddressDisplayRecord.mockReturnValue({
      address: CURRENT_DELEGATE,
      label: "Stored Delegate",
      picture: null,
      profileUrl: null,
      source: "delegate",
      title: null,
    });

    const html = renderPanel();

    expect(html).toContain("2 ARB");
    expect(html).toContain("3 ARB");
    expect(html).toContain("Stored Delegate");
    expect(html).toContain(
      'href="/delegates/0x2222222222222222222222222222222222222222"'
    );
    expect(html).toContain(`Delegators for ${CONNECTED_ACCOUNT}`);
  });
});

describe("refreshMyDelegationData", () => {
  it("refetches delegate reads and invalidates the delegators query", () => {
    refreshMyDelegationData({
      accountAddress: CONNECTED_ACCOUNT,
      l2Rpc: L2_RPC,
      queryClient: { invalidateQueries: mocks.invalidateQueries },
      refetchCurrentDelegate: mocks.refetchCurrentDelegate,
      refetchVotingPower: mocks.refetchVotingPower,
    });

    expect(mocks.refetchCurrentDelegate).toHaveBeenCalledTimes(1);
    expect(mocks.refetchVotingPower).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["my-delegators", CONNECTED_ACCOUNT, L2_RPC],
      exact: true,
    });
  });
});

function connectWallet() {
  mocks.useAccount.mockReturnValue({
    address: CONNECTED_ACCOUNT,
    isConnected: true,
  });
}

function renderPanel(): string {
  return renderToStaticMarkup(<MyDelegationPanel />);
}
