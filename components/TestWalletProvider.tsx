"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { createClient, custom, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import {
  createConfig,
  createConnector,
  useConnect,
  WagmiProvider,
  type Config,
} from "wagmi";

declare global {
  interface Window {
    __TEST_WALLET_KEY__?: string;
  }
}

const testQueryClient = new QueryClient();

function testWalletConnector(account: ReturnType<typeof privateKeyToAccount>) {
  const rpcUrl = arbitrumSepolia.rpcUrls.default.http[0];

  // @ts-expect-error -- wagmi withCapabilities conditional type not satisfiable from plain objects
  return createConnector((config) => {
    const rpcRequest = async (method: string, params?: unknown[]) => {
      const transport = http(rpcUrl)({ chain: arbitrumSepolia });
      return transport.request({ method, params } as Parameters<
        typeof transport.request
      >[0]);
    };

    // eslint-disable-next-line -- wagmi connector request handler needs flexible types
    const request = async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown[];
    }) => {
      if (method === "eth_chainId")
        return `0x${arbitrumSepolia.id.toString(16)}`;
      if (method === "eth_requestAccounts") return [account.address];
      if (method === "eth_accounts") return [account.address];

      if (method === "eth_signTypedData_v4") {
        const [, dataString] = params as [string, string];
        const typedData = JSON.parse(dataString);
        console.log("[TestWallet] signTypedData called", typedData.primaryType);
        try {
          const sig = await account.signTypedData({
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
          console.log(
            "[TestWallet] signTypedData success",
            sig.substring(0, 20)
          );
          return sig;
        } catch (err) {
          console.error("[TestWallet] signTypedData error", err);
          throw err;
        }
      }

      if (method === "personal_sign") {
        const [data] = params as [Hex];
        return account.signMessage({ message: { raw: data } });
      }

      if (method === "eth_estimateGas") {
        console.log("[TestWallet] estimateGas called");
        try {
          const result = await rpcRequest(method, params);
          console.log("[TestWallet] estimateGas success:", result);
          return result;
        } catch (err) {
          console.error("[TestWallet] estimateGas error:", err);
          throw err;
        }
      }

      if (method === "eth_sendTransaction") {
        console.log("[TestWallet] sendTransaction called");
        const [txParams] = params as [Record<string, unknown>];
        const nonce = (await rpcRequest("eth_getTransactionCount", [
          account.address,
          "pending",
        ])) as Hex;
        const gasPrice = (await rpcRequest("eth_gasPrice")) as Hex;
        const gas =
          (txParams.gas as Hex) ||
          ((await rpcRequest("eth_estimateGas", [
            { ...txParams, from: account.address },
          ])) as Hex);

        const signedTx = await account.signTransaction({
          to: txParams.to as `0x${string}`,
          data: txParams.data as `0x${string}`,
          value: txParams.value ? BigInt(txParams.value as string) : BigInt(0),
          nonce: Number(nonce),
          gasPrice: BigInt(gasPrice),
          gas: BigInt(gas),
          chainId: arbitrumSepolia.id,
          type: "legacy",
        });

        return rpcRequest("eth_sendRawTransaction", [signedTx]);
      }

      return rpcRequest(method, params);
    };

    const provider = custom({ request } as Parameters<typeof custom>[0])({
      retryCount: 0,
    });

    return {
      id: "test-wallet",
      name: "Test Wallet",
      type: "mock" as const,
      async connect() {
        const chainId = arbitrumSepolia.id;
        const accounts = [account.address] as readonly [`0x${string}`];
        config.emitter.emit("connect", { accounts, chainId });
        return { accounts, chainId };
      },
      async disconnect() {
        config.emitter.emit("disconnect");
      },
      async getAccounts() {
        return [account.address];
      },
      async getChainId() {
        return arbitrumSepolia.id;
      },
      async isAuthorized() {
        return true;
      },
      async switchChain({ chainId }: { chainId: number }) {
        config.emitter.emit("change", { chainId });
        const chain = config.chains.find((c) => c.id === chainId);
        if (!chain) throw new Error(`Chain ${chainId} not configured`);
        return chain;
      },
      onAccountsChanged() {},
      onChainChanged() {},
      onConnect() {},
      onDisconnect() {},
      async getProvider() {
        return provider;
      },
    };
  });
}

function createTestConfig(privateKey: `0x${string}`): Config {
  const account = privateKeyToAccount(privateKey);
  return createConfig({
    chains: [arbitrumSepolia],
    connectors: [testWalletConnector(account)],
    client({ chain }) {
      return createClient({
        account,
        chain,
        transport: http(),
      });
    },
  });
}

function AutoConnect() {
  const { connect, connectors } = useConnect();
  useEffect(() => {
    const testConn = connectors.find((c) => c.id === "test-wallet");
    if (testConn) {
      connect({ connector: testConn });
    }
  }, [connect, connectors]);
  return null;
}

export default function TestWalletProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [state] = useState<
    { mode: "test"; config: Config } | { mode: "normal" }
  >(() => {
    if (
      typeof window !== "undefined" &&
      window.__TEST_WALLET_KEY__?.startsWith("0x")
    ) {
      return {
        mode: "test",
        config: createTestConfig(window.__TEST_WALLET_KEY__ as `0x${string}`),
      };
    }
    return { mode: "normal" };
  });

  if (state.mode === "test") {
    return (
      <WagmiProvider config={state.config}>
        <QueryClientProvider client={testQueryClient}>
          <AutoConnect />
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return <>{fallback}</>;
}
