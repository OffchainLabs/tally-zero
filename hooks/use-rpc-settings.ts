"use client";

/**
 * Hook for accessing user-configured RPC settings
 * Provides L1 and L2 RPC URLs with fallbacks to defaults
 */

import {
  ARBITRUM_RPC_URL,
  ETHEREUM_RPC_URL,
} from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";

/** RPC settings with hydration state */
export interface RpcSettings {
  l1Rpc: string;
  l2Rpc: string;
  isHydrated: boolean;
}

/**
 * Hook for accessing RPC settings from localStorage with hydration state.
 * Provides L1 (Ethereum) and L2 (Arbitrum) RPC URLs with sensible defaults.
 */
export function useRpcSettings(): RpcSettings {
  const [storedL1Rpc, , l1RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L1_RPC,
    ""
  );
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );

  return {
    l1Rpc: storedL1Rpc || ETHEREUM_RPC_URL,
    l2Rpc: storedL2Rpc || ARBITRUM_RPC_URL,
    isHydrated: l1RpcHydrated && l2RpcHydrated,
  };
}
