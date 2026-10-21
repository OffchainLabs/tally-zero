import {
  numberToHex,
  parseTransaction,
  recoverMessageAddress,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

import { LOCAL_L1_CHAIN_ID, LOCAL_L2_CHAIN_ID } from "@/config/chains";

import {
  createTestWalletProvider,
  defaultTestWalletChain,
  TEST_WALLET_CHAINS,
  testWalletConnector,
  type RpcRequest,
} from "./test-wallet-connector";

// Anvil's first dev key; never holds anything real.
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

function fakeRpc() {
  const calls: { chainId: number; method: string; params?: unknown[] }[] = [];
  const rpcRequest: RpcRequest = async (chain, method, params) => {
    calls.push({ chainId: chain.id, method, params });
    if (method === "eth_getTransactionCount") return "0x7";
    if (method === "eth_gasPrice") return "0x3b9aca00";
    if (method === "eth_estimateGas") return "0x5208";
    if (method === "eth_sendRawTransaction") return "0xhash";
    return `${method}@${chain.id}`;
  };
  return { calls, rpcRequest };
}

describe("defaultTestWalletChain", () => {
  it("connects on the local L2 under local chains, else Arbitrum Sepolia", () => {
    expect(defaultTestWalletChain(true).id).toBe(LOCAL_L2_CHAIN_ID);
    expect(defaultTestWalletChain(false).id).toBe(arbitrumSepolia.id);
  });

  it("supports both testnode chains and Arbitrum Sepolia", () => {
    expect(TEST_WALLET_CHAINS.map((chain) => chain.id).sort()).toEqual(
      [arbitrumSepolia.id, LOCAL_L1_CHAIN_ID, LOCAL_L2_CHAIN_ID].sort()
    );
  });
});

describe("createTestWalletProvider", () => {
  it("switches chains through wallet_switchEthereumChain", async () => {
    const onChainChanged = vi.fn();
    const wallet = createTestWalletProvider({
      account,
      initialChainId: LOCAL_L2_CHAIN_ID,
      onChainChanged,
      rpcRequest: fakeRpc().rpcRequest,
    });

    expect(await wallet.request({ method: "eth_chainId" })).toBe(
      numberToHex(LOCAL_L2_CHAIN_ID)
    );

    await wallet.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: numberToHex(LOCAL_L1_CHAIN_ID) }],
    });

    expect(onChainChanged).toHaveBeenCalledWith(LOCAL_L1_CHAIN_ID);
    expect(await wallet.request({ method: "eth_chainId" })).toBe(
      numberToHex(LOCAL_L1_CHAIN_ID)
    );
  });

  it("does not report a change when switching to the current chain", () => {
    const onChainChanged = vi.fn();
    const wallet = createTestWalletProvider({
      account,
      initialChainId: LOCAL_L1_CHAIN_ID,
      onChainChanged,
    });

    wallet.switchChain(LOCAL_L1_CHAIN_ID);
    expect(onChainChanged).not.toHaveBeenCalled();
  });

  it("rejects an unsupported chain with EIP-1193 code 4902", async () => {
    const wallet = createTestWalletProvider({
      account,
      initialChainId: LOCAL_L2_CHAIN_ID,
    });

    await expect(
      wallet.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: numberToHex(10) }],
      })
    ).rejects.toMatchObject({ code: 4902 });
    expect(wallet.getChainId()).toBe(LOCAL_L2_CHAIN_ID);
  });

  it("routes passthrough RPC to the selected chain", async () => {
    const { calls, rpcRequest } = fakeRpc();
    const wallet = createTestWalletProvider({
      account,
      initialChainId: LOCAL_L2_CHAIN_ID,
      rpcRequest,
    });

    expect(await wallet.request({ method: "eth_blockNumber" })).toBe(
      `eth_blockNumber@${LOCAL_L2_CHAIN_ID}`
    );
    wallet.switchChain(LOCAL_L1_CHAIN_ID);
    expect(await wallet.request({ method: "eth_blockNumber" })).toBe(
      `eth_blockNumber@${LOCAL_L1_CHAIN_ID}`
    );
    expect(calls.map((call) => call.chainId)).toEqual([
      LOCAL_L2_CHAIN_ID,
      LOCAL_L1_CHAIN_ID,
    ]);
  });

  it("signs transactions for the selected chain and sends them there", async () => {
    const { calls, rpcRequest } = fakeRpc();
    const wallet = createTestWalletProvider({
      account,
      initialChainId: LOCAL_L2_CHAIN_ID,
      rpcRequest,
    });
    wallet.switchChain(LOCAL_L1_CHAIN_ID);

    const hash = await wallet.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: account.address,
          to: "0x000000000000000000000000000000000000dEaD",
          data: "0x1234",
        },
      ],
    });

    expect(hash).toBe("0xhash");
    const send = calls.find((call) => call.method === "eth_sendRawTransaction");
    expect(send?.chainId).toBe(LOCAL_L1_CHAIN_ID);

    const raw = send!.params![0] as Hex;
    const tx = parseTransaction(raw);
    expect(tx.chainId).toBe(LOCAL_L1_CHAIN_ID);
    expect(tx.nonce).toBe(7);
    expect(tx.gas).toBe(BigInt(21000));
    expect(
      await recoverTransactionAddress({
        serializedTransaction: raw as Parameters<
          typeof recoverTransactionAddress
        >[0]["serializedTransaction"],
      })
    ).toBe(account.address);
  });

  it("signs personal_sign and typed data with the account", async () => {
    const wallet = createTestWalletProvider({
      account,
      initialChainId: LOCAL_L1_CHAIN_ID,
    });

    const message = "0x68656c6c6f" as Hex;
    const personal = (await wallet.request({
      method: "personal_sign",
      params: [message, account.address],
    })) as Hex;
    expect(
      await recoverMessageAddress({
        message: { raw: message },
        signature: personal,
      })
    ).toBe(account.address);

    const typedData = {
      domain: { name: "Test", chainId: LOCAL_L1_CHAIN_ID },
      types: { Ping: [{ name: "n", type: "uint256" }] },
      primaryType: "Ping" as const,
      message: { n: "1" },
    };
    const typed = (await wallet.request({
      method: "eth_signTypedData_v4",
      params: [account.address, JSON.stringify(typedData)],
    })) as Hex;
    expect(
      await recoverTypedDataAddress({
        ...typedData,
        message: { n: BigInt(1) },
        signature: typed,
      })
    ).toBe(account.address);
  });
});

describe("testWalletConnector", () => {
  function setup() {
    const emit = vi.fn();
    const chains = TEST_WALLET_CHAINS as readonly Chain[];
    const connector = testWalletConnector(account, {
      initialChainId: LOCAL_L2_CHAIN_ID,
      rpcRequest: fakeRpc().rpcRequest,
    })({ chains, emitter: { emit } } as never);
    return { connector, emit };
  }

  it("connects on the initial chain", async () => {
    const { connector, emit } = setup();
    const result = await connector.connect();
    expect(result.chainId).toBe(LOCAL_L2_CHAIN_ID);
    expect(emit).toHaveBeenCalledWith("connect", {
      accounts: [account.address],
      chainId: LOCAL_L2_CHAIN_ID,
    });
  });

  it("switches chain, emits change, and moves the provider", async () => {
    const { connector, emit } = setup();
    const chain = await connector.switchChain!({ chainId: LOCAL_L1_CHAIN_ID });

    expect(chain.id).toBe(LOCAL_L1_CHAIN_ID);
    expect(emit).toHaveBeenCalledWith("change", {
      chainId: LOCAL_L1_CHAIN_ID,
    });
    expect(await connector.getChainId()).toBe(LOCAL_L1_CHAIN_ID);

    const provider = (await connector.getProvider()) as {
      request: (args: { method: string }) => Promise<unknown>;
    };
    expect(await provider.request({ method: "eth_chainId" })).toBe(
      numberToHex(LOCAL_L1_CHAIN_ID)
    );
  });

  it("refuses a chain the config does not carry", async () => {
    const { connector } = setup();
    await expect(connector.switchChain!({ chainId: 10 })).rejects.toThrow(
      "Chain 10 not configured"
    );
  });

  it("refuses the next user actions like a wallet's Reject when asked to", async () => {
    const scope = globalThis as { __TEST_WALLET_REJECT__?: number };
    scope.__TEST_WALLET_REJECT__ = 1;
    const provider = createTestWalletProvider({
      account: privateKeyToAccount(
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
      ),
      initialChainId: 412346,
      rpcRequest: async () => "0x1",
    });
    await expect(
      provider.request({ method: "personal_sign", params: ["0x01"] })
    ).rejects.toMatchObject({ code: 4001 });
    // Only one: the next signature goes through.
    await expect(
      provider.request({ method: "personal_sign", params: ["0x01"] })
    ).resolves.toMatch(/^0x/);
    delete scope.__TEST_WALLET_REJECT__;
  });
});
