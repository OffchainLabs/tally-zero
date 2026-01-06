/**
 * Calldata decoding type definitions
 *
 * Provides types for decoded transaction calldata, parameters,
 * and retryable ticket data from Arbitrum governance transactions.
 */

import type { ChainId } from "@/lib/explorer-utils";

/**
 * Decoded calldata result
 */
export interface DecodedCalldata {
  /** 4-byte function selector (0x prefix) */
  selector: string;
  /** Decoded function name (null if unknown) */
  functionName: string | null;
  /** Full function signature (null if unknown) */
  signature: string | null;
  /** Decoded parameters (null if decoding failed) */
  parameters: DecodedParameter[] | null;
  /** Raw calldata hex string */
  raw: string;
  /** Source of decoding (local ABI, API lookup, or failed) */
  decodingSource: "local" | "api" | "failed";
}

/**
 * Chain context for address resolution
 */
export type ChainContext = ChainId;

/**
 * Decoded parameter with optional nested calldata
 */
export interface DecodedParameter {
  /** Parameter name from ABI */
  name: string;
  /** Solidity type (e.g., "address", "uint256", "bytes") */
  type: string;
  /** Decoded value as string */
  value: string;
  /** Whether this parameter contains nested calldata */
  isNested: boolean;
  /** Nested decoded calldata for bytes parameters */
  nested?: DecodedCalldata;
  /** Decoded elements for bytes[] arrays */
  nestedArray?: DecodedCalldata[];
  /** Block explorer link for address parameters */
  link?: string;
  /** Chain label for display (Arb1, Nova, L1) */
  chainLabel?: string;
  /** Known address label (e.g., "Core Governor", "L1 Timelock") */
  addressLabel?: string;
}

/**
 * Retryable ticket data extracted from L1 calldata
 */
export interface RetryableTicketData {
  /** Target delayed inbox address on L1 */
  targetInbox: string;
  /** Target contract address on L2 */
  l2Target: string;
  /** ETH value to send on L2 (in wei) */
  l2Value: string;
  /** Gas limit for L2 execution */
  gasLimit: string;
  /** Max fee per gas for L2 execution */
  maxFeePerGas: string;
  /** Calldata to execute on L2 */
  l2Calldata: string;
  /** Target L2 chain (arb1, nova, or unknown) */
  chain: "arb1" | "nova" | "unknown";
}

/**
 * Extended DecodedParameter with internal raw bytes array
 */
export interface DecodedParameterWithRaw extends DecodedParameter {
  /** Internal raw bytes array for further processing */
  _rawBytesArray?: string[];
}
