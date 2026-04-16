"use client";

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  arbitrum,
  arbitrumSepolia,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { type ReactNode } from "react";
import { http } from "viem";
import { WagmiProvider, type Config } from "wagmi";

import { ARBITRUM_RPC_URL } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { env } from "../env";

// Get project ID from environment
const projectId = env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is not defined");
}

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  arbitrum,
  arbitrumSepolia,
];

// Metadata for your app
const metadata = {
  name: "Arbitrum Governance",
  description: "Decentralized voting platform for onchain governance",
  url: "https://alt.gov.arbitrum.foundation",
  icons: ["/favicon/favicon.ico"],
};

/** Read stored L2 RPC from localStorage (JSON-encoded by useLocalStorage) */
function getStoredL2Rpc(): string {
  try {
    const item = localStorage.getItem(STORAGE_KEYS.L2_RPC);
    if (item) {
      const parsed = JSON.parse(item);
      if (typeof parsed === "string" && parsed) return parsed;
    }
  } catch {}
  return ARBITRUM_RPC_URL;
}

// Configure custom transport with rate limiting settings
// Reads the user's stored RPC at module load so wagmi hooks
// use the same endpoint as the rest of the election flow.
const customTransports = {
  [arbitrum.id]: http(getStoredL2Rpc(), {
    batch: { wait: 50 },
    retryCount: 2,
    retryDelay: 1000,
  }),
  [arbitrumSepolia.id]: http("https://sepolia-rollup.arbitrum.io/rpc", {
    batch: { wait: 50 },
    retryCount: 2,
    retryDelay: 1000,
  }),
};

// Configure Wagmi Adapter with custom transports
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  transports: customTransports,
});

// Create modal instance
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: arbitrum,
  metadata,
  features: {
    analytics: true,
  },
});

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
