/**
 * Governor configuration for Arbitrum DAO governance
 * Defines Core and Treasury governors with their respective timelocks
 */

import { addressesEqual, findByAddress } from "@/lib/address-utils";
import type { StageType } from "@/types/proposal-stage";
import { ADDRESSES } from "@gzeoneth/gov-tracker";

/** Governor type identifier */
export type GovernorType = "core" | "treasury";

/** Configuration for a governor contract */
export interface GovernorConfig {
  /** Governor contract address */
  address: string;
  /** Governor type identifier */
  type: GovernorType;
  /** Display name (e.g., "Core Governor") */
  name: string;
  /** Brief description of the governor's purpose */
  description: string;
  /** L2 timelock contract address */
  l2TimelockAddress: string;
  /** L2 timelock delay as human-readable string (e.g., "8 days") */
  l2TimelockDelay: string;
  /** L1 timelock contract address (null for Treasury) */
  l1TimelockAddress: string | null;
  /** L1 timelock delay as human-readable string (null for Treasury) */
  l1TimelockDelay: string | null;
  /** Whether proposals require L1 round-trip */
  hasL1Timelock: boolean;
  /** Final stage in the proposal lifecycle */
  finalStage: StageType;
}

const CORE_GOVERNOR_CONFIG: GovernorConfig = {
  address: ADDRESSES.CONSTITUTIONAL_GOVERNOR,
  type: "core",
  name: "Core Governor",
  description: "Constitutional and non-emergency proposals",
  l2TimelockAddress: ADDRESSES.L2_CONSTITUTIONAL_TIMELOCK,
  l2TimelockDelay: "8 days",
  l1TimelockAddress: ADDRESSES.L1_TIMELOCK,
  l1TimelockDelay: "3 days",
  hasL1Timelock: true,
  finalStage: "RETRYABLE_EXECUTED",
};

const TREASURY_GOVERNOR_CONFIG: GovernorConfig = {
  address: ADDRESSES.NON_CONSTITUTIONAL_GOVERNOR,
  type: "treasury",
  name: "Treasury Governor",
  description: "Treasury and funding proposals",
  l2TimelockAddress: ADDRESSES.L2_NON_CONSTITUTIONAL_TIMELOCK,
  l2TimelockDelay: "3 days",
  l1TimelockAddress: null,
  l1TimelockDelay: null,
  hasL1Timelock: false,
  finalStage: "L2_TIMELOCK",
};

export const GOVERNORS: Record<GovernorType, GovernorConfig> = {
  core: CORE_GOVERNOR_CONFIG,
  treasury: TREASURY_GOVERNOR_CONFIG,
};

export const GOVERNOR_LIST: GovernorConfig[] = Object.values(GOVERNORS);

/**
 * Get governor configuration by contract address
 * @param address - The governor contract address to look up
 * @returns The governor configuration if found, undefined otherwise
 */
export function getGovernorByAddress(
  address: string
): GovernorConfig | undefined {
  return findByAddress(GOVERNOR_LIST, address);
}

/**
 * Check if an address is the Core Governor contract
 * @param address - The address to check
 * @returns True if the address matches the Core Governor
 */
export function isCoreGovernor(address: string): boolean {
  return addressesEqual(address, CORE_GOVERNOR_CONFIG.address);
}

/**
 * Check if an address is the Treasury Governor contract
 * @param address - The address to check
 * @returns True if the address matches the Treasury Governor
 */
export function isTreasuryGovernor(address: string): boolean {
  return addressesEqual(address, TREASURY_GOVERNOR_CONFIG.address);
}

/**
 * Check if an address is any Arbitrum DAO governor (Core or Treasury)
 * @param address - The address to check
 * @returns True if the address matches either governor
 */
export function isArbitrumGovernor(address: string): boolean {
  return isCoreGovernor(address) || isTreasuryGovernor(address);
}

/**
 * Get the final lifecycle stage for a governor's proposals
 * @param governorAddress - The governor contract address
 * @returns The final stage type, or undefined if governor not found
 */
export function getFinalStageForGovernor(
  governorAddress: string
): StageType | undefined {
  const config = getGovernorByAddress(governorAddress);
  return config?.finalStage;
}

/**
 * Get the type of governor for a given address
 * @param address - The governor contract address
 * @returns The governor type ("core" or "treasury"), or undefined if not found
 */
export function getGovernorType(address: string): GovernorType | undefined {
  const config = getGovernorByAddress(address);
  return config?.type;
}

/**
 * Determine governor type from governor name string
 * Used for display logic in UI components
 */
export function getGovernorTypeFromName(
  governorName: string | undefined
): GovernorType {
  if (!governorName) return "treasury";
  return governorName.toLowerCase().includes("core") ? "core" : "treasury";
}
