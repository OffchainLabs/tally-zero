/**
 * Retryable ticket decoding utilities
 * Handles Arbitrum L1→L2 retryable ticket data extraction
 */

import { ethers } from "ethers";

import { debug } from "@/lib/debug";
import type { RetryableTicketData } from "./types";

/** Magic address indicating bytes contain a retryable ticket tuple (not calldata) */
const RETRYABLE_TICKET_MAGIC = "0xa723c008e76e379c55599d2e4d93879beafda79c";

/** Arbitrum One delayed inbox address */
const ARB1_INBOX = "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f";

/** Arbitrum Nova delayed inbox address */
const NOVA_INBOX = "0xc4448b71118c9071bcb9734a0eac55d18a153949";

/**
 * Check if target is the retryable ticket magic address
 * @param target - The target address to check
 * @returns True if the address is the retryable ticket magic address
 */
export function isRetryableTicketMagic(target: string): boolean {
  return target.toLowerCase() === RETRYABLE_TICKET_MAGIC;
}

/**
 * Decode retryable ticket data from bytes (not calldata - raw ABI encoded tuple)
 * @param bytes - The hex-encoded bytes containing the retryable ticket tuple
 * @returns Decoded retryable ticket data, or null if decoding fails
 */
export function decodeRetryableTicket(
  bytes: string
): RetryableTicketData | null {
  try {
    const abiCoder = new ethers.utils.AbiCoder();
    // Decode as tuple: (address, address, uint256, uint256, uint256, bytes)
    const decoded = abiCoder.decode(
      ["address", "address", "uint256", "uint256", "uint256", "bytes"],
      bytes
    );

    const targetInbox = decoded[0].toLowerCase();
    let chain: "arb1" | "nova" | "unknown" = "unknown";
    if (targetInbox === ARB1_INBOX) {
      chain = "arb1";
    } else if (targetInbox === NOVA_INBOX) {
      chain = "nova";
    }

    return {
      targetInbox: decoded[0],
      l2Target: decoded[1],
      l2Value: decoded[2].toString(),
      gasLimit: decoded[3].toString(),
      maxFeePerGas: decoded[4].toString(),
      l2Calldata: decoded[5],
      chain,
    };
  } catch (error) {
    debug.calldata("failed to decode retryable ticket: %O", error);
    return null;
  }
}
