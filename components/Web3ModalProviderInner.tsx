"use client";

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { arbitrum, arbitrumSepolia, mainnet } from "@reown/appkit/networks";
import { type ReactNode } from "react";
import { http } from "viem";
import { WagmiProvider, type Config } from "wagmi";

import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import { localChains } from "@/config/chains";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { APPKIT_NETWORKS, createGovernanceAppKit } from "@/lib/appkit";
import { env } from "../env";

// Get project ID from environment
const projectId = env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is not defined");
}

/** Read a stored RPC from localStorage (JSON-encoded by useLocalStorage) */
function getStoredRpc(key: string, fallback: string): string {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      if (typeof parsed === "string" && parsed) return parsed;
    }
  } catch {}
  return fallback;
}

const transportOptions = {
  batch: { wait: 50 },
  retryCount: 2,
  retryDelay: 1000,
};

// Configure custom transport with rate limiting settings
// Reads the user's stored RPC at module load so wagmi hooks
// use the same endpoint as the rest of the election flow.
const customTransports = {
  [arbitrum.id]: http(
    getStoredRpc(STORAGE_KEYS.L2_RPC, ARBITRUM_RPC_URL),
    transportOptions
  ),
  [arbitrumSepolia.id]: http(
    "https://sepolia-rollup.arbitrum.io/rpc",
    transportOptions
  ),
  [mainnet.id]: http(
    getStoredRpc(STORAGE_KEYS.L1_RPC, ETHEREUM_RPC_URL),
    transportOptions
  ),
  ...Object.fromEntries(
    localChains().map((chain) => [
      chain.id,
      http(chain.rpcUrls.default.http[0], transportOptions),
    ])
  ),
};

// Configure Wagmi Adapter with custom transports
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: APPKIT_NETWORKS,
  transports: customTransports,
});

// Create the modal singleton (shared networks/metadata; see lib/appkit).
createGovernanceAppKit(projectId, wagmiAdapter);

export default function Web3ModalProviderInner({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      {children}
    </WagmiProvider>
  );
}
