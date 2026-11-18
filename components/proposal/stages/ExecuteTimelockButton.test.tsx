// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { BigNumber } from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADDRESSES, hashOperation } from "@gzeoneth/gov-tracker";

import { ARBITRUM_CHAIN_ID } from "@/config/arbitrum-governance";
import type { TimelockOperationInfo } from "@/hooks/use-timelock-operation";

import { ExecuteTimelockButton } from "./ExecuteTimelockButton";

/**
 * The executable operation sits in an L2 timelock, so `execute` must reach
 * Arbitrum. A wallet on Ethereum is asked to switch; nothing is sent to an
 * address that holds no timelock there.
 */

const EXECUTOR = "0x1111111111111111111111111111111111111111";
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

const mocks = vi.hoisted(() => ({
  sendTransaction: vi.fn(),
  switchChainAsync: vi.fn(),
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  useEstimateGas: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useChainId: mocks.useChainId,
  useEstimateGas: mocks.useEstimateGas,
  useSendTransaction: () => ({
    data: undefined,
    isPending: false,
    sendTransaction: mocks.sendTransaction,
    error: null,
  }),
  useSwitchChain: () => ({
    switchChainAsync: mocks.switchChainAsync,
    isPending: false,
  }),
  useWaitForTransactionReceipt: mocks.useWaitForTransactionReceipt,
}));

const params = {
  target: EXECUTOR,
  value: "0",
  data: "0x",
  predecessor: ZERO_BYTES32,
};

const operation: TimelockOperationInfo = {
  ...params,
  operationId: hashOperation({
    ...params,
    value: BigNumber.from(0),
    salt: ZERO_BYTES32,
  }),
  delay: "0",
  txHash: ZERO_BYTES32,
  blockNumber: 1,
  timestamp: 1,
  timelockAddress: ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
};

function connectOn(chainId: number) {
  mocks.useAccount.mockReturnValue({
    address: EXECUTOR,
    isConnected: true,
    chainId,
  });
  mocks.useChainId.mockReturnValue(chainId);
}

describe("ExecuteTimelockButton chain pinning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useEstimateGas.mockReturnValue({
      error: null,
      isError: false,
      isLoading: false,
    });
    mocks.useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
    });
    mocks.switchChainAsync.mockResolvedValue(undefined);
    connectOn(ARBITRUM_CHAIN_ID);
  });

  afterEach(cleanup);

  it("sends the execution pinned to Arbitrum", async () => {
    const view = render(<ExecuteTimelockButton operation={operation} />);

    expect(mocks.useEstimateGas).toHaveBeenLastCalledWith(
      expect.objectContaining({ account: EXECUTOR, chainId: ARBITRUM_CHAIN_ID })
    );
    expect(mocks.useWaitForTransactionReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ chainId: ARBITRUM_CHAIN_ID })
    );
    fireEvent.click(view.getByRole("button", { name: "Execute Operation" }));

    await waitFor(() =>
      expect(mocks.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: ARBITRUM_CHAIN_ID,
          to: ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
        })
      )
    );
    expect(mocks.switchChainAsync).not.toHaveBeenCalled();
  });

  it("asks a wallet on Ethereum to switch instead of executing", async () => {
    connectOn(1);
    const view = render(<ExecuteTimelockButton operation={operation} />);

    expect(
      view.queryByRole("button", { name: "Execute Operation" })
    ).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Switch to Arbitrum" }));

    await waitFor(() =>
      expect(mocks.switchChainAsync).toHaveBeenCalledWith({
        chainId: ARBITRUM_CHAIN_ID,
      })
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });
});
