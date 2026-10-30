// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import {
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type Hex,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TimelockExecution } from "@/lib/timelock-execution";

import { ExecuteTimelockButton } from "./ExecuteTimelockButton";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  ensure: vi.fn(),
  sendTransaction: vi.fn(),
  useEstimateGas: vi.fn(),
  usePublicClient: vi.fn(),
  useEnsureChain: vi.fn(),
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-ensure-chain", () => ({
  useEnsureChain: (chainId: number) => {
    mocks.useEnsureChain(chainId);
    return { ensure: mocks.ensure, isWrongNetwork: false, isSwitching: false };
  },
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true }),
  useEstimateGas: (args: unknown) => {
    mocks.useEstimateGas(args);
    return { error: null, isError: false, isLoading: false };
  },
  usePublicClient: (args: unknown) => {
    mocks.usePublicClient(args);
    return { getGasPrice: async () => BigInt(1), readContract: vi.fn() };
  },
  useSendTransaction: () => ({
    data: undefined,
    isPending: false,
    sendTransaction: mocks.sendTransaction,
    error: null,
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
  }),
}));

const TIMELOCK_ABI = parseAbi([
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) payable",
]);
const TIMELOCK = getAddress("0x0000000000000000000000000000000000000ae1");
const TARGET = getAddress("0x00000000000000000000000000000000000000a1");
const SALT = `0x${"22".repeat(32)}` as Hex;
const ZERO = `0x${"0".repeat(64)}` as Hex;

// A governor queues even a single call as a batch.
const execution: TimelockExecution = {
  operationId: keccak256(
    encodeAbiParameters(
      parseAbiParameters("address[], uint256[], bytes[], bytes32, bytes32"),
      [[TARGET], [BigInt(3)], ["0xabcd"], ZERO, SALT]
    )
  ),
  timelockAddress: TIMELOCK,
  calls: [{ target: TARGET, value: "3", data: "0xabcd" }],
  predecessor: ZERO,
  salt: SALT,
  chainId: 1,
};

function renderButton(operation: TimelockExecution) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExecuteTimelockButton operation={operation} />
    </QueryClientProvider>
  );
}

describe("ExecuteTimelockButton with an indexer operation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it("executes the batch with the known salt on the operation's chain", async () => {
    const { getByText } = renderButton(execution);

    await waitFor(() => getByText("Execute Operation"));
    expect(mocks.useEnsureChain).toHaveBeenCalledWith(1);
    expect(mocks.usePublicClient).toHaveBeenCalledWith({ chainId: 1 });
    await waitFor(() =>
      expect(mocks.useEstimateGas).toHaveBeenLastCalledWith(
        expect.objectContaining({ chainId: 1, value: BigInt(3) })
      )
    );

    await act(async () => {
      fireEvent.click(getByText("Execute Operation"));
    });

    expect(mocks.ensure).toHaveBeenCalled();
    const sent = mocks.sendTransaction.mock.calls[0][0];
    expect(sent).toMatchObject({ to: TIMELOCK, value: BigInt(3), chainId: 1 });
    const decoded = decodeFunctionData({ abi: TIMELOCK_ABI, data: sent.data });
    expect(decoded.functionName).toBe("executeBatch");
    expect(decoded.args).toEqual([
      [TARGET],
      [BigInt(3)],
      ["0xabcd"],
      ZERO,
      SALT,
    ]);
  });

  it("asks for the salt when the indexer's does not produce the id", () => {
    const { getByText } = renderButton({
      ...execution,
      salt: `0x${"33".repeat(32)}`,
    });
    expect(getByText("Operation requires a non-zero salt")).toBeTruthy();
  });

  it("does not send when the wallet refuses to switch chains", async () => {
    mocks.ensure.mockRejectedValue(new Error("rejected"));
    const { getByText } = renderButton(execution);
    await waitFor(() =>
      expect(
        (getByText("Execute Operation") as HTMLButtonElement).disabled
      ).toBe(false)
    );
    await act(async () => {
      fireEvent.click(getByText("Execute Operation"));
    });
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });
});
