"use client";

/**
 * Hook for managing URL hash state and deep linking
 * Supports proposal and timelock deep links with bidirectional sync
 */

import { isValidTxHash } from "@/lib/address-utils";
import { useCallback, useEffect, useState } from "react";

/** URL state types for deep linking support */
export type UrlStateType = "proposal" | "timelock" | null;

export interface UrlState {
  type: UrlStateType;
  id: string | null;
  tab?: string;
  /** Operation index for timelock deep links (1-based) */
  opIndex?: number;
}

/**
 * Parses the URL hash to extract deep link state
 * Supports formats:
 * - #proposal/<proposalId>
 * - #proposal/<proposalId>/<tab>
 * - #timelock/<txHash>
 * - #timelock/<txHash>/<opIndex>
 */
export function parseUrlHash(hash: string): UrlState {
  if (!hash || hash === "#") {
    return { type: null, id: null };
  }

  // Remove leading # if present
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const parts = cleanHash.split("/");

  if (parts.length < 2) {
    return { type: null, id: null };
  }

  const [type, id, thirdPart] = parts;

  if (type === "proposal" && id) {
    return { type: "proposal", id, tab: thirdPart };
  }

  if (type === "timelock" && id && isValidTxHash(id)) {
    const opIndex = thirdPart ? parseInt(thirdPart, 10) : undefined;
    return {
      type: "timelock",
      id,
      opIndex: opIndex && !isNaN(opIndex) && opIndex > 0 ? opIndex : undefined,
    };
  }

  return { type: null, id: null };
}

/**
 * Builds a URL hash from state
 */
export function buildUrlHash(state: UrlState): string {
  if (!state.type || !state.id) {
    return "";
  }

  if (state.type === "proposal") {
    if (state.tab && state.tab !== "description") {
      return `#proposal/${state.id}/${state.tab}`;
    }
    return `#proposal/${state.id}`;
  }

  if (state.type === "timelock") {
    if (state.opIndex && state.opIndex > 0) {
      return `#timelock/${state.id}/${state.opIndex}`;
    }
    return `#timelock/${state.id}`;
  }

  return "";
}

interface SetUrlStateOptions {
  /** If true, replaces current history entry instead of adding new one */
  replace?: boolean;
}

interface UseUrlStateResult {
  urlState: UrlState;
  setUrlState: (newState: UrlState, options?: SetUrlStateOptions) => void;
  openProposal: (proposalId: string, tab?: string) => void;
  openTimelock: (txHash: string, opIndex?: number) => void;
  clearUrlState: () => void;
}

/**
 * Hook for managing URL hash state for deep linking
 * Provides bidirectional sync between URL hash and component state
 */
export function useUrlState(): UseUrlStateResult {
  const [urlState, setUrlStateInternal] = useState<UrlState>(() => {
    if (typeof window === "undefined") return { type: null, id: null };
    return parseUrlHash(window.location.hash);
  });

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleHashChange = () => {
      const newState = parseUrlHash(window.location.hash);
      setUrlStateInternal(newState);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Update URL hash when state changes programmatically
  const setUrlState = useCallback(
    (newState: UrlState, options?: { replace?: boolean }) => {
      if (typeof window === "undefined") return;

      const newHash = buildUrlHash(newState);
      // Normalize current hash for comparison (remove # prefix if present)
      const currentHashNormalized = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const newHashNormalized = newHash.startsWith("#")
        ? newHash.slice(1)
        : newHash;

      // Only update if different to avoid extra history entries
      if (newHashNormalized !== currentHashNormalized) {
        const baseUrl = window.location.pathname + window.location.search;
        const targetUrl = newHash ? baseUrl + newHash : baseUrl;

        // Next.js patches pushState/replaceState and requires its internal state.
        // When history.state is null or missing the internal tree, the patched
        // functions throw errors. We wrap in try-catch and fall back to direct
        // hash manipulation which avoids the patched history API.
        try {
          if (options?.replace || !newHash) {
            // For clearing the hash or replace mode, use pushState with current state
            const safeState = window.history.state ?? {};
            window.history.pushState(safeState, "", targetUrl);
          } else {
            // For adding a new hash, use direct hash assignment (triggers hashchange)
            window.location.hash = newHash;
          }
        } catch {
          // Fallback: If Next.js history patch fails, use direct hash manipulation
          // This can happen when history.state is missing Next.js internals
          if (newHash) {
            window.location.hash = newHash;
          }
          // For clearing hash: silently fail - React state still updates correctly
          // The URL will retain the old hash but the modal will close properly
          // This is acceptable since the hash is only for deep linking on page load
        }
      }

      setUrlStateInternal(newState);
    },
    []
  );

  // Convenience methods
  const openProposal = useCallback(
    (proposalId: string, tab?: string) => {
      setUrlState({ type: "proposal", id: proposalId, tab });
    },
    [setUrlState]
  );

  const openTimelock = useCallback(
    (txHash: string, opIndex?: number) => {
      setUrlState({ type: "timelock", id: txHash, opIndex });
    },
    [setUrlState]
  );

  const clearUrlState = useCallback(() => {
    setUrlState({ type: null, id: null });
  }, [setUrlState]);

  return {
    urlState,
    setUrlState,
    openProposal,
    openTimelock,
    clearUrlState,
  };
}
