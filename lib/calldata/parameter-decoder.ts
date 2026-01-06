/**
 * Parameter decoding and formatting utilities
 * Handles ABI parameter parsing, decoding, and display formatting
 */

import { ethers } from "ethers";

import { debug } from "@/lib/debug";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { truncateMiddle } from "@/lib/text-utils";

import { getAddressLabel, getChainLabel } from "./address-utils";
import type { ChainContext, DecodedParameterWithRaw } from "./types";

/**
 * Parse complex parameter types from a function signature
 * Handles nested types like tuples and arrays
 * @param typesStr - The parameter types string (e.g., "address,uint256,bytes[]")
 * @returns Array of individual type strings
 */
export function parseParamTypes(typesStr: string): string[] {
  if (!typesStr.trim()) return [];

  const types: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of typesStr) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;

    if (char === "," && depth === 0) {
      if (current.trim()) types.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) types.push(current.trim());
  return types;
}

/**
 * Check if a value looks like calldata (for nested decoding)
 * @param value - The hex string to check
 * @returns True if the value appears to be valid calldata with a 4-byte selector
 */
export function isLikelyCalldata(value: string): boolean {
  if (!value.startsWith("0x")) return false;
  if (value.length < 10) return false;
  // Must have at least 4-byte selector
  return /^0x[a-f0-9]{8,}$/i.test(value);
}

/**
 * Format a decoded value for display
 * Handles BigNumbers, ETH values, addresses, and arrays
 * @param value - The decoded value to format
 * @param type - The Solidity type of the value
 * @returns Human-readable string representation
 */
export function formatDecodedValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return "null";

  // Handle BigNumber
  if (ethers.BigNumber.isBigNumber(value)) {
    // Check if likely an ETH value (> 0.001 ETH and type is uint256)
    if (
      type.includes("uint256") &&
      value.gt(ethers.utils.parseEther("0.001"))
    ) {
      try {
        const ethValue = ethers.utils.formatEther(value);
        if (parseFloat(ethValue) < 1000000) {
          return `${value.toString()} (${ethValue} ETH)`;
        }
      } catch {
        // Fall through to default
      }
    }
    return value.toString();
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const formatted = value.map((v) =>
      formatDecodedValue(v, type.replace("[]", ""))
    );
    return `[${formatted.join(", ")}]`;
  }

  // Handle bytes and hex strings - truncate long values in the middle
  if (type === "bytes" || type.startsWith("bytes")) {
    return truncateMiddle(String(value), 34, 32);
  }

  return String(value);
}

/**
 * Decode parameters from calldata using ethers.js AbiCoder
 * @param calldata - The hex-encoded calldata string
 * @param signature - The function signature (e.g., "transfer(address,uint256)")
 * @param chainContext - Chain context for address resolution (default: "arb1")
 * @returns Array of decoded parameters with metadata, or null if decoding fails
 */
export function decodeParameters(
  calldata: string,
  signature: string,
  chainContext: ChainContext = "arb1"
): DecodedParameterWithRaw[] | null {
  try {
    // Extract parameter types from signature
    const match = signature.match(/\(([^)]*)\)/);
    if (!match) return null;

    const paramTypesStr = match[1];
    if (!paramTypesStr) return [];

    const paramTypes = parseParamTypes(paramTypesStr);
    if (paramTypes.length === 0) return [];

    const encodedParams = "0x" + calldata.slice(10);

    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(paramTypes, encodedParams);

    return paramTypes.map((type, index) => {
      const value = decoded[index];
      const formattedValue = formatDecodedValue(value, type);
      const rawValue = type === "bytes" ? String(value) : formattedValue;
      const isNested = type === "bytes" && isLikelyCalldata(rawValue);
      // Check for bytes[] array type
      const isBytesArray = type === "bytes[]" && Array.isArray(value);

      let link: string | undefined;
      let chainLabel: string | undefined;
      let addressLabel: string | undefined;
      if (type === "address") {
        link = getAddressExplorerUrl(String(value), chainContext);
        chainLabel = getChainLabel(chainContext);
        addressLabel = getAddressLabel(String(value), chainContext);
      }

      return {
        name: `arg${index}`,
        type,
        value: formattedValue,
        isNested: isNested || isBytesArray,
        link,
        chainLabel,
        addressLabel,
        // Store raw bytes array for later decoding
        _rawBytesArray: isBytesArray ? value.map(String) : undefined,
      } as DecodedParameterWithRaw;
    });
  } catch (error) {
    debug.calldata("failed to decode parameters: %O", error);
    return null;
  }
}
