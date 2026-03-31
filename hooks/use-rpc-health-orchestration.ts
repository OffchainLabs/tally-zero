"use client";

/**
 * Hook for orchestrating RPC health checks and auto-start behavior
 * Used by components that need to wait for RPC health before starting operations
 */

import { useCallback, useEffect, useState } from "react";

/** Return type for useRpcHealthOrchestration hook */
export interface RpcHealthOrchestrationResult {
  /** Whether operations have been auto-started */
  autoStarted: boolean;
  /** Whether required RPC endpoints are healthy (null = not checked yet) */
  rpcHealthy: boolean | null;
  /** Callback to pass to RpcStatus component's onHealthChecked prop */
  handleRpcHealthChecked: (
    allHealthy: boolean,
    requiredHealthy: boolean
  ) => void;
  /** Whether operations are ready to start (autoStarted && rpcHealthy) */
  isReady: boolean;
}

interface UseRpcHealthOrchestrationOptions {
  /** Additional condition to wait for before auto-starting (e.g., isProviderReady) */
  additionalReadyCondition?: boolean;
}

/**
 * Hook for orchestrating RPC health checks and auto-start behavior.
 * Provides state management for waiting on RPC health before starting operations.
 *
 * @example
 * const { autoStarted, rpcHealthy, handleRpcHealthChecked, isReady } = useRpcHealthOrchestration();
 *
 * const { data } = useQuery({
 *   enabled: isReady,
 *   // ...
 * });
 *
 * return (
 *   <>
 *     <RpcStatus onHealthChecked={handleRpcHealthChecked} />
 *     {rpcHealthy === false && <RpcError />}
 *     {isReady && <DataDisplay data={data} />}
 *   </>
 * );
 */
export function useRpcHealthOrchestration(
  options: UseRpcHealthOrchestrationOptions = {}
): RpcHealthOrchestrationResult {
  const { additionalReadyCondition = true } = options;
  const [autoStarted, setAutoStarted] = useState(false);
  const [rpcHealthy, setRpcHealthy] = useState<boolean | null>(null);

  const handleRpcHealthChecked = useCallback(
    (_allHealthy: boolean, requiredHealthy: boolean) => {
      setRpcHealthy(requiredHealthy);
    },
    []
  );

  // Auto-start when RPC is healthy and additional conditions are met
  useEffect(() => {
    if (additionalReadyCondition && rpcHealthy === true && !autoStarted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time latch
      setAutoStarted(true);
    }
  }, [additionalReadyCondition, rpcHealthy, autoStarted]);

  return {
    autoStarted,
    rpcHealthy,
    handleRpcHealthChecked,
    isReady: autoStarted && rpcHealthy === true,
  };
}
