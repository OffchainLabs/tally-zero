"use client";

/**
 * Hook for initializing and managing RPC provider readiness
 * Consolidates the common pattern of creating RPC provider on mount
 */

import { createRpcProvider } from "@/lib/rpc-utils";
import { useEffect, useState } from "react";

/** Return type for useRpcProvider hook */
export interface UseRpcProviderResult {
  /** Whether provider is ready for use */
  isReady: boolean;
  /** Error if provider initialization failed */
  error: Error | null;
}

/**
 * Hook for initializing an RPC provider
 * Handles async initialization and cleanup
 *
 * @param rpcUrl - The RPC URL to connect to
 * @returns Provider readiness state and any error
 *
 * @example
 * ```tsx
 * function MyComponent({ rpcUrl }) {
 *   const { isReady, error } = useRpcProvider(rpcUrl);
 *
 *   if (error) return <Error error={error} />;
 *   if (!isReady) return <Loading />;
 *
 *   // Provider is ready, proceed with RPC calls
 * }
 * ```
 */
export function useRpcProvider(rpcUrl: string): UseRpcProviderResult {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset on rpcUrl change */
    setIsReady(false);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    createRpcProvider(rpcUrl)
      .then(() => {
        if (!cancelled) setIsReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err as Error);
      });

    return () => {
      cancelled = true;
    };
  }, [rpcUrl]);

  return { isReady, error };
}
