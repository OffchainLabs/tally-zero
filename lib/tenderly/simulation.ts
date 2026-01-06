/**
 * Basic Tenderly simulation functions
 */

import { L1_TIMELOCK } from "@config/arbitrum-governance";

import { getL1TimelockAlias } from "./address-alias";
import { CHAIN_IDS } from "./constants";
import { getSimulationLink, getTenderlySettings } from "./settings";
import type {
  ChainType,
  SimulationResult,
  SimulationWithLink,
  TenderlySimulationRequest,
  TenderlySimulationResponse,
} from "./types";

/**
 * Get the Tenderly network ID for a chain
 */
function getNetworkIdForChain(chain: ChainType): string {
  switch (chain) {
    case "L1":
      return CHAIN_IDS.ethereum;
    case "Arb1":
      return CHAIN_IDS.arb1;
    case "Nova":
      return CHAIN_IDS.nova;
    default:
      return CHAIN_IDS.arb1;
  }
}

/**
 * Get the appropriate sender address for simulation on a chain
 */
function getSenderForChain(chain: ChainType): string {
  if (chain === "L1") {
    return L1_TIMELOCK.address;
  }
  return getL1TimelockAlias();
}

/**
 * Execute a basic transaction simulation on Tenderly
 */
export async function simulateTransaction(params: {
  networkId: string;
  from: string;
  to: string;
  input: string;
  value?: string;
}): Promise<SimulationResult> {
  const { org, project, accessToken } = getTenderlySettings();

  const endpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/simulate`;

  const requestBody: TenderlySimulationRequest = {
    network_id: params.networkId,
    from: params.from,
    to: params.to,
    input: params.input,
    value: params.value || "0",
    gas: 10000000,
    save: true,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers["X-Access-Key"] = accessToken;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tenderly API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as TenderlySimulationResponse;

  if (!data.simulation?.id) {
    throw new Error("No simulation ID returned from Tenderly");
  }

  return {
    simulationId: data.simulation.id,
    success: data.simulation.status,
  };
}

/**
 * Simulate an Arbitrum retryable ticket (L1->L2 message)
 */
export async function simulateRetryableTicket(params: {
  l2Target: string;
  l2Calldata: string;
  l2Value?: string;
  chain: "arb1" | "nova" | "unknown";
}): Promise<SimulationWithLink> {
  const chainKey = params.chain === "unknown" ? "arb1" : params.chain;
  const networkId = CHAIN_IDS[chainKey];
  const fromAddress = getL1TimelockAlias();

  const result = await simulateTransaction({
    networkId,
    from: fromAddress,
    to: params.l2Target,
    input: params.l2Calldata,
    value: params.l2Value,
  });

  return {
    simulationId: result.simulationId,
    link: getSimulationLink(result.simulationId),
    success: result.success,
  };
}

/**
 * Simulate a generic call on any supported chain
 */
export async function simulateCall(params: {
  target: string;
  calldata: string;
  value?: string;
  chain: ChainType;
  from?: string;
}): Promise<SimulationWithLink> {
  const networkId = getNetworkIdForChain(params.chain);
  const fromAddress = params.from || getSenderForChain(params.chain);

  const result = await simulateTransaction({
    networkId,
    from: fromAddress,
    to: params.target,
    input: params.calldata,
    value: params.value,
  });

  return {
    simulationId: result.simulationId,
    link: getSimulationLink(result.simulationId),
    success: result.success,
  };
}
