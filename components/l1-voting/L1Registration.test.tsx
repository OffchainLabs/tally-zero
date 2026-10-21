// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { getAddress, type Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mergedSignatures, type SafeTxState } from "@/lib/l1-voting/safe";

import { L1Registration } from "./L1Registration";

const SAFE = getAddress("0x5afe00000000000000000000000000000000beef");
const ALICE = getAddress("0x00000000000000000000000000000000000a11ce");
const BOB = getAddress("0x00000000000000000000000000000000000000b0");
const L2_MAPPING = getAddress("0x00000000000000000000000000000000000d0e12");
const SAFE_TX_HASH = `0x${"5a".repeat(32)}` as Hex;
const ALICE_SIG = `0x${"aa".repeat(64)}1b` as Hex;
const BOB_SIG = `0x${"bb".repeat(64)}1c` as Hex;
const SERVICE = "https://safe.test";

const safeState: SafeTxState = {
  safe: SAFE,
  call: { to: L2_MAPPING, data: "0x1234" },
  nonce: BigInt(3),
  safeTxHash: SAFE_TX_HASH,
  threshold: 2,
  owners: [ALICE, BOB],
  approvedBy: [],
};

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  fetch: vi.fn(),
  readSafeTx: vi.fn(),
  writeContractAsync: vi.fn(),
  signTypedDataAsync: vi.fn(),
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: vi.fn() }),
}));
vi.mock("@/hooks/use-siwe", () => ({
  useSiwe: () => ({ effectiveAddress: SAFE }),
}));
vi.mock("@/hooks/use-ensure-chain", () => ({
  useEnsureChain: () => ({
    ensure: async () => {},
    isWrongNetwork: false,
    isSwitching: false,
  }),
}));
vi.mock("@/lib/l1-voting/api", () => ({
  l1VotingApi: {
    deployment: async () => ({
      l2DelegateMapping: L2_MAPPING,
      l1DelegateMapping: getAddress(
        "0x00000000000000000000000000000000000d0e11"
      ),
    }),
    registration: async () => ({
      l2Claim: null,
      l2ClaimProvable: false,
      l1Claimers: [],
    }),
  },
}));
vi.mock("@/lib/l1-voting/safe", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/l1-voting/safe")>()),
  readSafeTx: mocks.readSafeTx,
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: ALICE, isConnected: true }),
  usePublicClient: () => ({
    getCode: async () => "0x6080",
    readContract: async () => "0x0000000000000000000000000000000000000000",
    waitForTransactionReceipt: async () => ({ status: "success" }),
  }),
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync }),
  useSignTypedData: () => ({ signTypedDataAsync: mocks.signTypedDataAsync }),
}));

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
  });
}

function byTestId(container: HTMLElement, id: string) {
  return container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
}

async function renderPrepared() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <L1Registration />
    </QueryClientProvider>
  );
  const prepare = await waitFor(() => {
    const button = byTestId(view.container, "l1-reg-safe-prepare");
    expect(button).not.toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(false);
    return button!;
  });
  await act(async () => {
    fireEvent.click(prepare);
  });
  await waitFor(() =>
    expect(byTestId(view.container, "safe-tx-hash")?.textContent).toBe(
      SAFE_TX_HASH
    )
  );
  return view;
}

describe("L1Registration Safe paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.readSafeTx.mockResolvedValue(safeState);
    mocks.signTypedDataAsync.mockResolvedValue(ALICE_SIG);
    mocks.writeContractAsync.mockResolvedValue(`0x${"cd".repeat(32)}`);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the on-chain approval path alone on the local chains", async () => {
    mocks.env.NEXT_PUBLIC_LOCAL_CHAINS = "1";
    const { container } = await renderPrepared();

    expect(byTestId(container, "safe-approvals")?.textContent).toContain(
      "0 of 2"
    );
    expect(byTestId(container, "safe-approve")).not.toBeNull();
    expect(byTestId(container, "safe-service-propose")).toBeNull();
    expect(byTestId(container, "safe-service-confirmations")).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("proposes to the service with an EIP-712 signature on the L2's domain", async () => {
    mocks.env.NEXT_PUBLIC_SAFE_TX_SERVICE_URL = SERVICE;
    mocks.fetch
      .mockResolvedValueOnce(json(404, { detail: "Not found." }))
      .mockResolvedValueOnce(json(201))
      .mockResolvedValue(
        json(200, {
          count: 1,
          results: [
            { owner: ALICE, signature: ALICE_SIG, signatureType: "EOA" },
          ],
        })
      );
    const { container } = await renderPrepared();

    const propose = await waitFor(() => {
      expect(
        byTestId(container, "safe-service-confirmations")?.textContent
      ).toBe("not proposed yet");
      return byTestId(container, "safe-service-propose")!;
    });
    await act(async () => {
      fireEvent.click(propose);
    });

    expect(mocks.signTypedDataAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        account: ALICE,
        primaryType: "SafeTx",
        domain: { chainId: 42161, verifyingContract: SAFE },
      })
    );
    const [url, init] = mocks.fetch.mock.calls[1];
    expect(url).toBe(`${SERVICE}/api/v1/safes/${SAFE}/multisig-transactions/`);
    expect(JSON.parse(init.body)).toMatchObject({
      contractTransactionHash: SAFE_TX_HASH,
      sender: ALICE,
      signature: ALICE_SIG,
      nonce: "3",
    });
    await waitFor(() =>
      expect(
        byTestId(container, "safe-service-confirmations")?.textContent
      ).toBe(ALICE)
    );
    // Proposed and signed by this owner: nothing left to sign
    expect(byTestId(container, "safe-service-propose")).toBeNull();
    expect(byTestId(container, "safe-service-confirm")).toBeNull();
  });

  it("lets another owner confirm, then executes with the merged signatures", async () => {
    mocks.env.NEXT_PUBLIC_SAFE_TX_SERVICE_URL = SERVICE;
    const bobOnly = json(200, {
      count: 1,
      results: [{ owner: BOB, signature: BOB_SIG, signatureType: "EOA" }],
    });
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? json(201) : bobOnly.clone()
    );
    const { container } = await renderPrepared();

    const confirm = await waitFor(
      () => byTestId(container, "safe-service-confirm")!
    );
    await act(async () => {
      fireEvent.click(confirm);
    });
    const post = mocks.fetch.mock.calls.find(
      ([, init]) => init?.method === "POST"
    )!;
    expect(post[0]).toBe(
      `${SERVICE}/api/v1/multisig-transactions/${SAFE_TX_HASH}/confirmations/`
    );
    expect(JSON.parse(post[1].body)).toEqual({ signature: ALICE_SIG });

    // Bob signed off chain and Alice executes: 2 of 2
    const execute = byTestId(container, "safe-execute") as HTMLButtonElement;
    await waitFor(() => expect(execute.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(execute);
    });

    const exec = mocks.writeContractAsync.mock.calls.find(
      ([args]) => args.functionName === "execTransaction"
    )![0];
    expect(exec.args.at(-1)).toBe(
      mergedSignatures(
        safeState,
        [{ owner: BOB, signature: BOB_SIG, kind: "EIP712" }],
        ALICE
      )
    );
  });
});
