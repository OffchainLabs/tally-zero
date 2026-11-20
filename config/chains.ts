/**
 * Chains the app talks to, and which of them each governance leg runs on.
 *
 * Production: Arbitrum One for the L2 governors, Ethereum mainnet for the L1
 * voting governor. With `NEXT_PUBLIC_LOCAL_CHAINS=1` the local testnode pair
 * (L1 anvil 1337, L2 nitro 412346) is registered as well and takes over both
 * roles, so the same code paths run against it.
 */

import { defineChain, type Chain } from "viem";
import { arbitrum, mainnet } from "viem/chains";

import { env } from "@/env";

export const LOCAL_L1_CHAIN_ID = 1337;
export const LOCAL_L2_CHAIN_ID = 412346;

export const DEFAULT_LOCAL_L1_RPC_URL = "http://127.0.0.1:8545";
export const DEFAULT_LOCAL_L2_RPC_URL = "http://127.0.0.1:8547";

export function isLocalChainsEnabled(): boolean {
  return env.NEXT_PUBLIC_LOCAL_CHAINS === "1";
}

export const LOCAL_L1_RPC_URL =
  env.NEXT_PUBLIC_LOCAL_L1_RPC || DEFAULT_LOCAL_L1_RPC_URL;
export const LOCAL_L2_RPC_URL =
  env.NEXT_PUBLIC_LOCAL_L2_RPC || DEFAULT_LOCAL_L2_RPC_URL;

export const localL1 = defineChain({
  id: LOCAL_L1_CHAIN_ID,
  name: "Local L1",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_L1_RPC_URL] } },
  testnet: true,
});

export const localArbitrum = defineChain({
  id: LOCAL_L2_CHAIN_ID,
  name: "Local Arbitrum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_L2_RPC_URL] } },
  testnet: true,
});

/** Chain the L1 voting governor lives on: Ethereum, or the local L1 */
export function l1VotingChainId(local = isLocalChainsEnabled()): number {
  return local ? LOCAL_L1_CHAIN_ID : mainnet.id;
}

/** Chain the L2 governors and token live on: Arbitrum One, or the local L2 */
export function l2ChainId(local = isLocalChainsEnabled()): number {
  return local ? LOCAL_L2_CHAIN_ID : arbitrum.id;
}

/** Chain ids an L1 voting governor id (`eip155:<id>:<address>`) may carry */
export const L1_VOTING_CHAIN_IDS: readonly number[] = [
  mainnet.id,
  LOCAL_L1_CHAIN_ID,
];

export function isL1VotingChainId(chainId: number | string | undefined) {
  return chainId !== undefined && L1_VOTING_CHAIN_IDS.includes(Number(chainId));
}

/** The local chains, registered only when the flag is on */
export function localChains(local = isLocalChainsEnabled()): Chain[] {
  return local ? [localL1, localArbitrum] : [];
}
