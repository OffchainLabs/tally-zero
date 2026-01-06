/**
 * Calldata decoder with recursive nested decoding support
 * Decodes governance proposal calldata including retryable tickets and nested calls
 */

import { ethers } from "ethers";

import { getAddressExplorerUrl } from "@/lib/explorer-utils";

import { getAddressLabel, getChainLabel } from "./address-utils";
import {
  decodeParameters,
  formatDecodedValue,
  isLikelyCalldata,
  parseParamTypes,
} from "./parameter-decoder";
import {
  decodeRetryableTicket,
  isRetryableTicketMagic,
} from "./retryable-ticket";
import { lookup4byteDirectory, lookupLocalSignature } from "./signature-lookup";
import type {
  ChainContext,
  DecodedCalldata,
  DecodedParameterWithRaw,
} from "./types";

/** Maximum recursion depth for nested calldata decoding */
const MAX_DEPTH = 3;

/**
 * Process nested calldata in parameters
 * Handles bytes[] arrays and single bytes parameters for recursive decoding
 */
async function processNestedParams(
  params: DecodedParameterWithRaw[] | null,
  signature: string,
  calldata: string,
  depth: number,
  nestedContext: ChainContext
): Promise<void> {
  if (!params || depth >= MAX_DEPTH) return;

  const match = signature.match(/\(([^)]*)\)/);
  if (!match) return;

  const paramTypes = parseParamTypes(match[1]);
  const abiCoder = new ethers.utils.AbiCoder();

  // For scheduleBatch, get the targets array to check for retryable ticket magic
  let targets: string[] = [];
  const addressArrayIndex = paramTypes.indexOf("address[]");
  if (addressArrayIndex !== -1) {
    try {
      const decoded = abiCoder.decode(paramTypes, "0x" + calldata.slice(10));
      targets = decoded[addressArrayIndex].map((a: string) => a.toLowerCase());
    } catch {
      // Ignore
    }
  }

  for (const param of params) {
    if (!param.isNested) continue;

    const paramIndex = params.indexOf(param);
    const paramType = paramTypes[paramIndex];

    try {
      const decoded = abiCoder.decode(paramTypes, "0x" + calldata.slice(10));

      // Handle bytes[] array - decode each element
      if (paramType === "bytes[]" && param._rawBytesArray) {
        const nestedArray: DecodedCalldata[] = [];
        for (let i = 0; i < param._rawBytesArray.length; i++) {
          const bytesItem = param._rawBytesArray[i];
          const target = targets[i];

          // Check if this is a retryable ticket (target is magic address)
          if (target && isRetryableTicketMagic(target)) {
            const retryable = decodeRetryableTicket(bytesItem);
            if (retryable) {
              // Determine the L2 chain for this retryable
              const l2Chain: ChainContext =
                retryable.chain === "arb1"
                  ? "arb1"
                  : retryable.chain === "nova"
                    ? "nova"
                    : "arb1";
              const chainLabel =
                retryable.chain === "arb1"
                  ? "Arbitrum One"
                  : retryable.chain === "nova"
                    ? "Nova"
                    : "Unknown L2";

              // Decode the l2Calldata if it looks like calldata (on the L2 chain)
              let nestedL2Call: DecodedCalldata | undefined;
              if (isLikelyCalldata(retryable.l2Calldata)) {
                nestedL2Call = await decodeCalldata(
                  retryable.l2Calldata,
                  retryable.l2Target,
                  depth + 1,
                  l2Chain // L2 calldata is on the target chain
                );
              }

              const retryableDecoded: DecodedCalldata = {
                selector: "",
                functionName: `Retryable Ticket → ${chainLabel}`,
                signature: null,
                parameters: [
                  {
                    name: "inbox",
                    type: "address",
                    value: retryable.targetInbox,
                    isNested: false,
                    link: getAddressExplorerUrl(
                      retryable.targetInbox,
                      "ethereum"
                    ),
                    chainLabel: "L1",
                    addressLabel: getAddressLabel(
                      retryable.targetInbox,
                      "ethereum"
                    ),
                  },
                  {
                    name: "l2Target",
                    type: "address",
                    value: retryable.l2Target,
                    isNested: false,
                    link: getAddressExplorerUrl(retryable.l2Target, l2Chain),
                    chainLabel: getChainLabel(l2Chain),
                    addressLabel: getAddressLabel(retryable.l2Target, l2Chain),
                  },
                  {
                    name: "l2Value",
                    type: "uint256",
                    value: formatDecodedValue(
                      ethers.BigNumber.from(retryable.l2Value),
                      "uint256"
                    ),
                    isNested: false,
                  },
                  {
                    name: "gasLimit",
                    type: "uint256",
                    value: retryable.gasLimit,
                    isNested: false,
                  },
                  {
                    name: "maxFeePerGas",
                    type: "uint256",
                    value: retryable.maxFeePerGas,
                    isNested: false,
                  },
                  {
                    name: "l2Calldata",
                    type: "bytes",
                    value: retryable.l2Calldata,
                    isNested: !!nestedL2Call,
                    nested: nestedL2Call,
                  },
                ],
                raw: bytesItem,
                decodingSource: "local",
              };
              nestedArray.push(retryableDecoded);
              continue;
            }
          }

          // Normal calldata decoding (use nestedContext for chain)
          if (isLikelyCalldata(bytesItem)) {
            const decodedItem = await decodeCalldata(
              bytesItem,
              target,
              depth + 1,
              nestedContext
            );
            nestedArray.push(decodedItem);
          }
        }
        if (nestedArray.length > 0) {
          param.nestedArray = nestedArray;
        }
        // Clean up temp property
        delete param._rawBytesArray;
      }
      // Handle single bytes - decode nested
      else if (paramType === "bytes") {
        const rawBytes = String(decoded[paramIndex]);
        if (isLikelyCalldata(rawBytes)) {
          param.nested = await decodeCalldata(
            rawBytes,
            undefined,
            depth + 1,
            nestedContext
          );
          param.value = rawBytes;
        }
      }
    } catch {
      // Ignore nested decoding errors
    }
  }
}

/**
 * Decode calldata with recursive nested decoding support
 * @param calldata - The hex-encoded calldata string
 * @param _targetAddress - Optional target contract address (unused, reserved)
 * @param depth - Current recursion depth (default: 0)
 * @param chainContext - Chain context for address resolution (default: "arb1")
 * @returns Decoded calldata with function name, parameters, and nested calls
 */
export async function decodeCalldata(
  calldata: string,
  _targetAddress?: string,
  depth = 0,
  chainContext: ChainContext = "arb1"
): Promise<DecodedCalldata> {
  // Handle empty or invalid calldata
  if (!calldata || calldata === "0x" || calldata.length < 10) {
    return {
      selector: "",
      functionName: null,
      signature: null,
      parameters: null,
      raw: calldata,
      decodingSource: "failed",
    };
  }

  const selector = calldata.slice(0, 10).toLowerCase();

  // Determine context for nested calls based on function
  // sendTxToL1 means nested content is on L1 (ethereum)
  const isSendTxToL1 = selector === "0x928c169a";
  const nestedContext: ChainContext = isSendTxToL1 ? "ethereum" : chainContext;

  // 1. Try local registry first
  const localSignature = lookupLocalSignature(selector);
  if (localSignature) {
    const params = decodeParameters(calldata, localSignature, chainContext);
    const functionName = localSignature.split("(")[0];

    // For sendTxToL1, fix the first parameter (address) to use ethereum context
    if (isSendTxToL1 && params && params[0]?.type === "address") {
      const addr = params[0].value;
      params[0].link = getAddressExplorerUrl(addr, "ethereum");
      params[0].chainLabel = getChainLabel("ethereum");
      params[0].addressLabel = getAddressLabel(addr, "ethereum");
    }

    // Recursively decode nested calldata
    await processNestedParams(
      params,
      localSignature,
      calldata,
      depth,
      nestedContext
    );

    return {
      selector,
      functionName,
      signature: localSignature,
      parameters: params,
      raw: calldata,
      decodingSource: "local",
    };
  }

  // 2. Try 4byte.directory API
  const apiSignature = await lookup4byteDirectory(selector);
  if (apiSignature) {
    const params = decodeParameters(calldata, apiSignature, chainContext);
    const functionName = apiSignature.split("(")[0];

    // Recursively decode nested calldata
    await processNestedParams(
      params,
      apiSignature,
      calldata,
      depth,
      nestedContext
    );

    return {
      selector,
      functionName,
      signature: apiSignature,
      parameters: params,
      raw: calldata,
      decodingSource: "api",
    };
  }

  // 3. Return undecoded result
  return {
    selector,
    functionName: null,
    signature: null,
    parameters: null,
    raw: calldata,
    decodingSource: "failed",
  };
}
