/**
 * Tenderly Simulation Module
 *
 * Provides utilities for simulating Arbitrum governance transactions
 * using the Tenderly API.
 */

export { calculateAddressAlias, getL1TimelockAlias } from "./address-alias";
export { CHAIN_IDS, FUNCTION_SELECTORS } from "./constants";
export {
  getSimulationLink,
  getTenderlySettings,
  isTenderlyConfigured,
} from "./settings";
export {
  simulateCall,
  simulateRetryableTicket,
  simulateTransaction,
} from "./simulation";
export { simulateTimelockBatch } from "./timelock-simulation";
export type {
  ChainType,
  SimulationResult,
  SimulationWithLink,
  TenderlySettings,
  TenderlySimulationRequest,
  TenderlySimulationResponse,
} from "./types";
