/**
 * Types for Tenderly simulation integration
 */

/** Request body for Tenderly simulation API */
export interface TenderlySimulationRequest {
  /** Network ID (e.g., "1" for mainnet, "42161" for Arbitrum) */
  network_id: string;
  /** Address initiating the transaction */
  from: string;
  /** Target contract address */
  to: string;
  /** Encoded transaction input data */
  input: string;
  /** Wei value to send */
  value: string;
  /** Gas limit */
  gas: number;
  /** Whether to save the simulation */
  save: boolean;
  /** Whether to save even if simulation fails */
  save_if_fails?: boolean;
  /** Block header overrides */
  block_header?: {
    number?: string;
    timestamp: string;
  };
  /** State overrides for simulation */
  state_objects?: Record<
    string,
    { balance?: string; storage?: Record<string, string> }
  >;
}

/** Response from Tenderly simulation API */
export interface TenderlySimulationResponse {
  /** Simulation metadata */
  simulation: {
    /** Unique simulation ID */
    id: string;
    /** Whether the transaction succeeded */
    status: boolean;
  };
  /** Transaction execution details */
  transaction?: {
    /** Call trace with potential errors */
    call_trace?: Array<{
      error?: string;
    }>;
  };
}

/** Basic simulation result */
export interface SimulationResult {
  /** Tenderly simulation ID */
  simulationId: string;
  /** Whether the simulation succeeded */
  success: boolean;
}

/** Simulation result with Tenderly dashboard link */
export interface SimulationWithLink extends SimulationResult {
  /** URL to view simulation in Tenderly dashboard */
  link: string;
}

/** Tenderly configuration settings */
export interface TenderlySettings {
  /** Tenderly organization slug */
  org: string;
  /** Tenderly project slug */
  project: string;
  /** Tenderly API access token */
  accessToken: string | null;
}

/** Response from storage encoding API */
export interface StorageEncodingResponse {
  /** State overrides keyed by address */
  stateOverrides: Record<string, { value: Record<string, string> }>;
}

/** Chain type identifier for simulation targeting */
export type ChainType = "L1" | "Arb1" | "Nova" | "unknown";
