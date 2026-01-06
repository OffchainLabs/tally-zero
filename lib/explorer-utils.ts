/**
 * Block explorer URL utilities
 * Centralized explorer URL generation for Ethereum, Arbitrum One, and Arbitrum Nova
 */

export type ChainId = "ethereum" | "arb1" | "nova";

const EXPLORER_BASE_URLS: Record<ChainId, string> = {
  ethereum: "https://etherscan.io",
  arb1: "https://arbiscan.io",
  nova: "https://nova.arbiscan.io",
};

/**
 * Get block explorer base URL for a chain
 * @param chain - The chain identifier
 * @returns The base URL for the chain's block explorer
 */
export function getExplorerBaseUrl(chain: ChainId): string {
  return EXPLORER_BASE_URLS[chain];
}

/**
 * Get block explorer URL for an address
 * @param address - The Ethereum address
 * @param chain - The chain identifier (defaults to arb1)
 * @returns The full explorer URL for the address
 */
export function getAddressExplorerUrl(
  address: string,
  chain: ChainId = "arb1"
): string {
  return `${EXPLORER_BASE_URLS[chain]}/address/${address}`;
}

/**
 * Get block explorer URL for a transaction hash
 * @param hash - The transaction hash
 * @param chain - The chain identifier (defaults to arb1)
 * @returns The full explorer URL for the transaction
 */
export function getTxExplorerUrl(
  hash: string,
  chain: ChainId = "arb1"
): string {
  return `${EXPLORER_BASE_URLS[chain]}/tx/${hash}`;
}

/**
 * Get explorer name for a chain
 * @param chain - The chain identifier
 * @returns Human-readable explorer name
 */
export function getExplorerName(chain: ChainId): string {
  switch (chain) {
    case "ethereum":
      return "Etherscan";
    case "arb1":
      return "Arbiscan";
    case "nova":
      return "Nova Explorer";
  }
}
