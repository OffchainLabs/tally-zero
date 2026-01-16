/**
 * Multicall3 utilities for batching multiple contract read calls
 *
 * Uses the canonical Multicall3 contract deployed at the same address
 * on Ethereum, Arbitrum, and most EVM chains.
 */

import { ethers } from "ethers";

/** Multicall3 contract address (same on all major chains) */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
];

/** Input for a single multicall call */
export interface MulticallInput {
  target: string;
  allowFailure: boolean;
  callData: string;
}

/** Result from a single multicall call */
export interface MulticallResult {
  success: boolean;
  returnData: string;
}

/**
 * Execute multiple contract calls in a single RPC request
 *
 * @param provider - Ethers provider
 * @param calls - Array of call inputs (target, allowFailure, callData)
 * @returns Array of results (success, returnData)
 */
export async function multicall(
  provider: ethers.providers.Provider,
  calls: MulticallInput[]
): Promise<MulticallResult[]> {
  if (calls.length === 0) return [];

  const multicallContract = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_ABI,
    provider
  );

  const results = await multicallContract.aggregate3(calls);

  return results.map(
    (r: { success: boolean; returnData: string }): MulticallResult => ({
      success: r.success,
      returnData: r.returnData,
    })
  );
}

/**
 * Helper to encode a contract call for multicall
 *
 * @param contractInterface - Ethers contract interface
 * @param functionName - Function to call
 * @param args - Function arguments
 * @returns Encoded calldata
 */
export function encodeCall(
  contractInterface: ethers.utils.Interface,
  functionName: string,
  args: unknown[]
): string {
  return contractInterface.encodeFunctionData(functionName, args);
}

/**
 * Helper to decode a multicall result
 *
 * @param contractInterface - Ethers contract interface
 * @param functionName - Function that was called
 * @param returnData - Raw return data from multicall
 * @returns Decoded result
 */
export function decodeResult<T>(
  contractInterface: ethers.utils.Interface,
  functionName: string,
  returnData: string
): T {
  const decoded = contractInterface.decodeFunctionResult(
    functionName,
    returnData
  );
  return decoded[0] as T;
}
