"use client";

/**
 * Hook for copying text to clipboard with feedback state
 * Provides a copy function and a copied state that auto-resets
 */

import { COPY_SUCCESS_TIMEOUT_MS } from "@/config/storage-keys";
import { useCallback, useState } from "react";

/** Return type for useCopyToClipboard hook */
interface UseCopyToClipboardResult {
  /** Whether text was recently copied */
  copied: boolean;
  /** Function to copy text to clipboard */
  copy: (text: string) => Promise<void>;
}

/**
 * Hook for copying text to clipboard with visual feedback
 * @returns Object with copied state and copy function
 * @example
 * const { copied, copy } = useCopyToClipboard();
 * <button onClick={() => copy('Hello')}>
 *   {copied ? 'Copied!' : 'Copy'}
 * </button>
 */
export function useCopyToClipboard(): UseCopyToClipboardResult {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers or restricted contexts
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_SUCCESS_TIMEOUT_MS);
  }, []);

  return { copied, copy };
}
