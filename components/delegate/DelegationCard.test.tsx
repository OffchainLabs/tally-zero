import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";

import {
  DelegationCard,
  getDelegateButtonLabel,
  getDelegateLinkLabel,
  isUserRejectedError,
} from "./DelegationCard";

const DELEGATE_ADDRESS = "0x1111111111111111111111111111111111111111";
const CONNECTED_ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CURRENT_DELEGATE = "0x2222222222222222222222222222222222222222";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ARB = BigInt("1000000000000000000");

const mocks = vi.hoisted(() => ({
  appKitOpen: vi.fn(),
  refetchCurrentDelegate: vi.fn(),
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

vi.mock("@/lib/delegate-data", () => ({
  useAddressDisplayRecord: mocks.useAddressDisplayRecord,
}));

describe("DelegationCard", () => {
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
    mocks.useReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: mocks.refetchCurrentDelegate,
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

  it("prompts disconnected users to connect a wallet", () => {
    const html = renderCard();

    expect(html).toContain("Connect a wallet to delegate ARB voting power.");
    expect(html).toContain("Connect Wallet");
    expect(html).not.toContain("Your balance:");
    expect(mocks.useBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });

  it("reports invalid delegate addresses and disables delegation", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: { value: ONE_ARB },
      isLoading: false,
    });

    const html = renderCard({ delegateAddress: "not-an-address" });

    expect(html).toContain("Invalid delegate address.");
    expect(html).toContain("Delegate to this address");
    expect(html).toContain('disabled=""');
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: undefined,
        query: { enabled: false },
      })
    );
  });

  it("shows balance loading state while current delegation is loading", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    mocks.useReadContract.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: mocks.refetchCurrentDelegate,
    });

    const html = renderCard();

    expect(html).toContain("Checking current delegation.");
    expect(html).toContain("Your balance:");
    expect(html).toContain("Loading");
  });

  it("asks connected users on the wrong chain to switch to Arbitrum", () => {
    connectWallet();
    mocks.useChainId.mockReturnValue(1);
    mocks.useBalance.mockReturnValue({
      data: { value: ONE_ARB * BigInt(3) },
      isLoading: false,
    });
    mocks.useSwitchChain.mockReturnValue({
      error: null,
      isPending: true,
      switchChain: mocks.switchChain,
    });

    const html = renderCard();

    expect(html).toContain("Switch to Arbitrum");
    expect(html).toContain('disabled=""');
    expect(html).toContain("3 ARB");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });

  it("shows the delegated state when the wallet is already delegated to the profile", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: { value: ONE_ARB },
      isLoading: false,
    });
    mocks.useReadContract.mockReturnValue({
      data: DELEGATE_ADDRESS,
      isLoading: false,
      refetch: mocks.refetchCurrentDelegate,
    });

    const html = renderCard();

    expect(html).toContain("Currently delegated to");
    expect(html).toContain(
      'href="/delegates/0x1111111111111111111111111111111111111111"'
    );
    expect(html).toContain("Profile Delegate");
    expect(html).toContain("Delegated");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });

  it("uses the stored delegate label for current delegate profile links", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: { value: ONE_ARB },
      isLoading: false,
    });
    mocks.useReadContract.mockReturnValue({
      data: CURRENT_DELEGATE,
      isLoading: false,
      refetch: mocks.refetchCurrentDelegate,
    });
    mocks.useAddressDisplayRecord.mockReturnValue({
      address: CURRENT_DELEGATE,
      label: "Stored Delegate",
      picture: null,
      profileUrl: null,
      source: "delegate",
      title: null,
    });
    mocks.useSimulateContract.mockReturnValue({
      data: { request: { to: DELEGATE_ADDRESS } },
      error: null,
      isError: false,
      isFetching: false,
    });

    const html = renderCard();

    expect(mocks.useAddressDisplayRecord).toHaveBeenCalledWith(
      CURRENT_DELEGATE
    );
    expect(html).toContain(
      'href="/delegates/0x2222222222222222222222222222222222222222"'
    );
    expect(html).toContain("Stored Delegate");
    expect(html).not.toContain("0x2222...2222");
    expect(html).toContain("Delegate to this address");
  });

  it("falls back to a shortened current delegate address when no stored label exists", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: { value: ONE_ARB },
      isLoading: false,
    });
    mocks.useReadContract.mockReturnValue({
      data: CURRENT_DELEGATE,
      isLoading: false,
      refetch: mocks.refetchCurrentDelegate,
    });

    const html = renderCard();

    expect(html).toContain("0x2222...2222");
  });

  it("shows the active delegate action when the wallet has ARB and no active delegate", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: { value: ONE_ARB * BigInt(5) },
      isLoading: false,
    });
    mocks.useReadContract.mockReturnValue({
      data: ZERO_ADDRESS,
      isLoading: false,
      refetch: mocks.refetchCurrentDelegate,
    });
    mocks.useSimulateContract.mockReturnValue({
      data: { request: { to: DELEGATE_ADDRESS } },
      error: null,
      isError: false,
      isFetching: false,
    });

    const html = renderCard();

    expect(html).toContain("No active ARB delegate.");
    expect(html).toContain("5 ARB");
    expect(html).toContain("Delegate to this address");
    expect(html).not.toContain("Get some ARB tokens");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [DELEGATE_ADDRESS],
        query: { enabled: true },
      })
    );
  });

  it("hides the delegate button and explains governance participation when ARB balance is zero", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: { value: BigInt(0) },
      isLoading: false,
    });
    mocks.useReadContract.mockReturnValue({
      data: ZERO_ADDRESS,
      isLoading: false,
      refetch: mocks.refetchCurrentDelegate,
    });

    const html = renderCard();

    expect(html).toContain("0 ARB");
    expect(html).toContain(
      "Get some ARB tokens if you want to participate in governance and delegate your voting power."
    );
    expect(html).not.toContain("Delegate to this address");
    expect(mocks.useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { enabled: false },
      })
    );
  });

  it("shows write and receipt progress labels", () => {
    connectWallet();
    mocks.useBalance.mockReturnValue({
      data: { value: ONE_ARB },
      isLoading: false,
    });
    mocks.useSimulateContract.mockReturnValue({
      data: { request: { to: DELEGATE_ADDRESS } },
      error: null,
      isError: false,
      isFetching: false,
    });

    mocks.useWriteContract.mockReturnValue({
      error: null,
      isPending: true,
      writeContract: mocks.writeContract,
    });
    expect(renderCard()).toContain("Delegating");

    mocks.useWriteContract.mockReturnValue({
      error: null,
      isPending: false,
      writeContract: mocks.writeContract,
    });
    mocks.useWaitForTransactionReceipt.mockReturnValue({
      error: null,
      isLoading: true,
      isSuccess: false,
    });
    expect(renderCard()).toContain("Confirming");
  });
});

describe("DelegationCard helper functions", () => {
  describe("getDelegateLinkLabel", () => {
    it("uses stored display record labels before shortened addresses", () => {
      expect(
        getDelegateLinkLabel(CURRENT_DELEGATE, {
          address: CURRENT_DELEGATE,
          label: "Stored Delegate",
          picture: null,
          profileUrl: null,
          source: "delegate",
          title: null,
        })
      ).toBe("Stored Delegate");
    });

    it("falls back to a shortened address without a display label", () => {
      expect(getDelegateLinkLabel(CURRENT_DELEGATE, undefined)).toBe(
        "0x2222...2222"
      );
      expect(
        getDelegateLinkLabel(CURRENT_DELEGATE, {
          address: CURRENT_DELEGATE,
          label: null,
          picture: null,
          profileUrl: null,
          source: "address",
          title: null,
        })
      ).toBe("0x2222...2222");
    });
  });

  describe("getDelegateButtonLabel", () => {
    it("prioritizes confirmation and wallet-write labels", () => {
      expect(
        getDelegateButtonLabel({ isConfirming: true, isWriting: true })
      ).toBe("Confirming");
      expect(
        getDelegateButtonLabel({ isConfirming: false, isWriting: true })
      ).toBe("Delegating");
      expect(
        getDelegateButtonLabel({ isConfirming: false, isWriting: false })
      ).toBe("Delegate to this address");
    });
  });

  describe("isUserRejectedError", () => {
    it("detects user rejection codes", () => {
      expect(isUserRejectedError({ code: 4001 })).toBe(true);
      expect(isUserRejectedError({ code: "ACTION_REJECTED" })).toBe(true);
    });

    it("detects common user rejection messages", () => {
      expect(isUserRejectedError(new Error("User rejected the request"))).toBe(
        true
      );
      expect(isUserRejectedError("user denied transaction signature")).toBe(
        true
      );
      expect(isUserRejectedError("request rejected")).toBe(true);
    });

    it("ignores unrelated errors and empty values", () => {
      expect(isUserRejectedError(null)).toBe(false);
      expect(isUserRejectedError(undefined)).toBe(false);
      expect(isUserRejectedError(new Error("RPC unavailable"))).toBe(false);
      expect(
        isUserRejectedError({ code: -32000, message: "execution reverted" })
      ).toBe(false);
    });
  });
});

function connectWallet() {
  mocks.useAccount.mockReturnValue({
    address: CONNECTED_ACCOUNT,
    isConnected: true,
  });
}

function renderCard({
  delegateAddress = DELEGATE_ADDRESS,
  delegateName = "Profile Delegate",
}: {
  delegateAddress?: string;
  delegateName?: string;
} = {}): string {
  return renderToStaticMarkup(
    <DelegationCard
      delegateAddress={delegateAddress}
      delegateName={delegateName}
    />
  );
}
