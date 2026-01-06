/**
 * Hook for decoding transaction calldata with caching
 * Parses calldata into human-readable function calls and parameters
 */

import { getErrorMessage } from "@/lib/error-utils";
import { decodeCalldata, type DecodedCalldata } from "@lib/calldata-decoder";
import { useCallback, useEffect, useState } from "react";

/** Options for configuring calldata decoding */
interface UseDecodedCalldataOptions {
  /** The hex-encoded calldata to decode */
  calldata: string;
  /** Optional target contract address for context */
  targetAddress?: string;
  /** Whether decoding is enabled */
  enabled?: boolean;
}

/** Return type for useDecodedCalldata hook */
interface UseDecodedCalldataResult {
  /** Decoded calldata result, or null if not decoded */
  decoded: DecodedCalldata | null;
  /** Whether decoding is in progress */
  isDecoding: boolean;
  /** Error message if decoding failed */
  error: string | null;
  /** Function to retry decoding */
  retry: () => void;
}

/**
 * Hook for decoding transaction calldata into readable format
 * @param options - Decoding options including calldata and target address
 * @returns Decoded result, loading state, error, and retry function
 */
export function useDecodedCalldata({
  calldata,
  targetAddress,
  enabled = true,
}: UseDecodedCalldataOptions): UseDecodedCalldataResult {
  const [decoded, setDecoded] = useState<DecodedCalldata | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decode = useCallback(async () => {
    if (!enabled || !calldata || calldata === "0x") {
      setDecoded(null);
      setIsDecoding(false);
      return;
    }

    setIsDecoding(true);
    setError(null);

    try {
      const result = await decodeCalldata(calldata, targetAddress);
      setDecoded(result);
    } catch (err) {
      setError(getErrorMessage(err, "decode calldata"));
      setDecoded(null);
    } finally {
      setIsDecoding(false);
    }
  }, [calldata, targetAddress, enabled]);

  useEffect(() => {
    decode();
  }, [decode]);

  return {
    decoded,
    isDecoding,
    error,
    retry: decode,
  };
}
