"use client";

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { createClient, custom, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import {
  createConfig,
  createConnector,
  useConnect,
  WagmiProvider,
  type Config,
} from "wagmi";

import { ARBITRUM_RPC_URL } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { APPKIT_NETWORKS, createGovernanceAppKit } from "@/lib/appkit";
import {
  defaultTestWalletChain,
  TEST_WALLET_CHAINS,
  testWalletConnector,
} from "@/lib/test-wallet-connector";

// Shared components (e.g. the nav) call useAppKit(), which throws unless
// createAppKit() has run. In normal mode Web3ModalProviderInner does that; the
// test-wallet path bypasses it, so initialize the same AppKit singleton here
// with a throwaway adapter (wagmi hooks are still governed by the test config
// below — this only satisfies the AppKit modal singleton).
function ensureAppKit() {
  // eslint-disable-next-line no-process-env
  const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "test";
  createGovernanceAppKit(
    projectId,
    new WagmiAdapter({ projectId, networks: APPKIT_NETWORKS })
  );
}

declare global {
  interface Window {
    __TEST_WALLET_KEY__?: string;
    __TEST_WALLET_ADDRESS__?: string;
  }
}

function getStoredL2Rpc(): string {
  try {
    const item = localStorage.getItem(STORAGE_KEYS.L2_RPC);
    if (item) {
      const parsed = JSON.parse(item);
      if (typeof parsed === "string" && parsed) return parsed;
    }
  } catch {
    // fall through to default
  }
  return ARBITRUM_RPC_URL;
}

const testQueryClient = new QueryClient();

function createTestConfig(privateKey: `0x${string}`): Config {
  const account = privateKeyToAccount(privateKey);
  const defaultChain = defaultTestWalletChain();
  // The connect chain goes first: wagmi treats chains[0] as the default.
  const chains = [
    defaultChain,
    ...TEST_WALLET_CHAINS.filter((chain) => chain.id !== defaultChain.id),
  ] as [Chain, ...Chain[]];
  return createConfig({
    chains,
    connectors: [
      testWalletConnector(account, { initialChainId: defaultChain.id }),
    ],
    client({ chain }) {
      return createClient({
        account,
        chain,
        transport: http(),
      });
    },
  });
}

function readOnlyWalletConnector(address: `0x${string}`, rpcUrl: string) {
  // @ts-expect-error -- wagmi withCapabilities conditional type not satisfiable from plain objects
  return createConnector((config) => {
    const rpcRequest = async (method: string, params?: unknown[]) => {
      const transport = http(rpcUrl)({ chain: arbitrum });
      return transport.request({ method, params } as Parameters<
        typeof transport.request
      >[0]);
    };

    const request = async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown[];
    }) => {
      if (method === "eth_chainId") return `0x${arbitrum.id.toString(16)}`;
      if (method === "eth_requestAccounts") return [address];
      if (method === "eth_accounts") return [address];
      if (method === "personal_sign" || method === "eth_signTypedData_v4") {
        throw new Error("read-only test wallet cannot sign");
      }
      if (method === "eth_sendTransaction") {
        throw new Error("read-only test wallet cannot send transactions");
      }
      return rpcRequest(method, params);
    };

    const provider = custom({ request } as Parameters<typeof custom>[0])({
      retryCount: 0,
    });

    return {
      id: "test-wallet-readonly",
      name: "Test Wallet (Read-Only)",
      type: "mock" as const,
      async connect() {
        const chainId = arbitrum.id;
        const accounts = [address] as readonly [`0x${string}`];
        config.emitter.emit("connect", { accounts, chainId });
        return { accounts, chainId };
      },
      async disconnect() {
        config.emitter.emit("disconnect");
      },
      async getAccounts() {
        return [address];
      },
      async getChainId() {
        return arbitrum.id;
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

function createReadOnlyConfig(address: `0x${string}`): Config {
  const rpcUrl = getStoredL2Rpc();
  return createConfig({
    chains: [arbitrum],
    connectors: [readOnlyWalletConnector(address, rpcUrl)],
    client({ chain }) {
      return createClient({
        chain,
        transport: http(rpcUrl),
      });
    },
  });
}

function AutoConnect({ connectorId }: { connectorId: string }) {
  const { connect, connectors } = useConnect();
  useEffect(() => {
    const testConn = connectors.find((c) => c.id === connectorId);
    if (testConn) {
      connect({ connector: testConn });
    }
  }, [connect, connectors, connectorId]);
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
    { mode: "test"; config: Config; connectorId: string } | { mode: "normal" }
  >(() => {
    if (typeof window === "undefined") return { mode: "normal" };
    if (window.__TEST_WALLET_KEY__?.startsWith("0x")) {
      ensureAppKit();
      return {
        mode: "test",
        config: createTestConfig(window.__TEST_WALLET_KEY__ as `0x${string}`),
        connectorId: "test-wallet",
      };
    }
    const readOnlyAddress =
      window.__TEST_WALLET_ADDRESS__ ??
      (() => {
        try {
          return localStorage.getItem("tally-zero-test-wallet-address");
        } catch {
          return null;
        }
      })();
    if (readOnlyAddress?.startsWith("0x")) {
      ensureAppKit();
      return {
        mode: "test",
        config: createReadOnlyConfig(readOnlyAddress as `0x${string}`),
        connectorId: "test-wallet-readonly",
      };
    }
    return { mode: "normal" };
  });

  if (state.mode === "test") {
    return (
      <WagmiProvider config={state.config}>
        <QueryClientProvider client={testQueryClient}>
          <AutoConnect connectorId={state.connectorId} />
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return <>{fallback}</>;
}
