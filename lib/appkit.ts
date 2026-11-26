import type { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  arbitrum,
  arbitrumSepolia,
  mainnet,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";

import { isL1VotingChainId, localChains } from "@/config/chains";

// Single source of truth for the Reown AppKit modal config, shared by the
// normal provider (Web3ModalProviderInner) and the test-wallet provider so the
// network list and metadata never drift between them. Each caller supplies its
// own WagmiAdapter (the normal path uses custom transports; the test path a
// throwaway) — only the modal singleton config lives here.
// Mainnet is where the L1 voting governor lives; the local testnode chains are
// appended only under NEXT_PUBLIC_LOCAL_CHAINS=1.
export const APPKIT_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  arbitrum,
  arbitrumSepolia,
  mainnet,
  ...localChains(),
];

export const APPKIT_METADATA = {
  name: "Arbitrum Governance",
  description: "Decentralized voting platform for onchain governance",
  url: "https://alt.gov.arbitrum.foundation",
  icons: ["/favicon/favicon.ico"],
};

// AppKit 1.8's SafeLocalStorageKeys.ACTIVE_CAIP_NETWORK_ID (@reown/appkit-common,
// not a direct dependency). AppKit restores this network on load and connects
// to it, so a wallet is asked to switch there.
const ACTIVE_NETWORK_STORAGE_KEY = "@appkit/active_caip_network_id";

/**
 * Start a visit on Arbitrum One when the last one ended on an L1 voting chain.
 * Main did not list Ethereum, so AppKit fell back to Arbitrum One; now that
 * it does, a session that ended there would make the next connect ask a
 * wallet sitting on Arbitrum One to switch to Ethereum, and refusing fails
 * the connection. Ethereum is only needed for an L1 vote, whose form asks for
 * the switch itself.
 */
export function resetStoredL1Network(
  storage?: Pick<Storage, "getItem" | "setItem">
): void {
  try {
    // Reading window.localStorage itself throws when site data is blocked.
    const store =
      storage ??
      (typeof window === "undefined" ? undefined : window.localStorage);
    const stored = store?.getItem(ACTIVE_NETWORK_STORAGE_KEY);
    const [namespace, chainId] = stored?.split(":") ?? [];
    if (namespace === "eip155" && isL1VotingChainId(chainId)) {
      store?.setItem(ACTIVE_NETWORK_STORAGE_KEY, `eip155:${arbitrum.id}`);
    }
  } catch {
    // AppKit cannot read a stored network then either.
  }
}

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
  resetStoredL1Network();
  createAppKit({
    adapters: [adapter],
    projectId,
    networks: APPKIT_NETWORKS,
    defaultNetwork: arbitrum,
    metadata: APPKIT_METADATA,
    // Reown Cloud analytics would report wallet-modal activity (with device
    // and network metadata) to a third party. Kept off for GDPR.
    features: { analytics: false },
  });
  created = true;
}
