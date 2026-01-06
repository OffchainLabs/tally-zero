/**
 * Calldata Decoder Module
 *
 * Re-exports from the modular calldata library.
 * For new code, prefer importing directly from @lib/calldata.
 */

export {
  decodeCalldata,
  decodeParameters,
  decodeRetryableTicket,
  formatDecodedValue,
  getAddressLabel,
  getChainLabel,
  isLikelyCalldata,
  isRetryableTicketMagic,
  lookup4byteDirectory,
  lookupLocalSignature,
  parseParamTypes,
} from "./calldata";

export type {
  ChainContext,
  DecodedCalldata,
  DecodedParameter,
  DecodedParameterWithRaw,
  RetryableTicketData,
} from "./calldata";
