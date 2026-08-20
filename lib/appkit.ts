import type { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  arbitrum,
  arbitrumSepolia,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";

// Single source of truth for the Reown AppKit modal config, shared by the
// normal provider (Web3ModalProviderInner) and the test-wallet provider so the
// network list and metadata never drift between them. Each caller supplies its
// own WagmiAdapter (the normal path uses custom transports; the test path a
// throwaway) — only the modal singleton config lives here.
export const APPKIT_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  arbitrum,
  arbitrumSepolia,
];

export const APPKIT_METADATA = {
  name: "Arbitrum Governance",
  description: "Decentralized voting platform for onchain governance",
  url: "https://alt.gov.arbitrum.foundation",
  icons: ["/favicon/favicon.ico"],
};

let created = false;

/**
 * Initialize the AppKit modal singleton once (idempotent). `useAppKit()` in
 * shared components throws unless this has run, so both providers call it.
 */
export function createGovernanceAppKit(
  projectId: string,
  adapter: WagmiAdapter
): void {
  if (created) return;
  createAppKit({
    adapters: [adapter],
    projectId,
    networks: APPKIT_NETWORKS,
    defaultNetwork: arbitrum,
    metadata: APPKIT_METADATA,
    features: { analytics: true },
  });
  created = true;
}
