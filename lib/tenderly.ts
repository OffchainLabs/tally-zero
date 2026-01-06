/**
 * Tenderly Simulation Module
 *
 * Re-exports from the modular tenderly library.
 * For new code, prefer importing directly from @lib/tenderly.
 */

export {
  CHAIN_IDS,
  FUNCTION_SELECTORS,
  calculateAddressAlias,
  getL1TimelockAlias,
  getSimulationLink,
  getTenderlySettings,
  isTenderlyConfigured,
  simulateCall,
  simulateRetryableTicket,
  simulateTimelockBatch,
  simulateTransaction,
} from "./tenderly/index";

export type {
  ChainType,
  SimulationResult,
  TenderlySimulationRequest,
  TenderlySimulationResponse,
} from "./tenderly/index";
