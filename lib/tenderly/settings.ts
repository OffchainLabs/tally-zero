/**
 * Tenderly settings management
 */

import {
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  STORAGE_KEYS,
} from "@config/storage-keys";
import { getStoredJsonString } from "@lib/storage-utils";

import type { TenderlySettings } from "./types";

/**
 * Get current Tenderly configuration from localStorage
 *
 * @returns The current Tenderly settings (org, project, accessToken)
 */
export function getTenderlySettings(): TenderlySettings {
  const org = getStoredJsonString(
    STORAGE_KEYS.TENDERLY_ORG,
    DEFAULT_TENDERLY_ORG
  );
  const project = getStoredJsonString(
    STORAGE_KEYS.TENDERLY_PROJECT,
    DEFAULT_TENDERLY_PROJECT
  );
  const accessToken =
    getStoredJsonString(STORAGE_KEYS.TENDERLY_ACCESS_TOKEN, "") || null;

  return { org, project, accessToken };
}

/**
 * Check if Tenderly is fully configured with custom org/project and access token
 *
 * @returns True if custom org, project, and access token are all set
 */
export function isTenderlyConfigured(): boolean {
  const { org, project, accessToken } = getTenderlySettings();
  return (
    Boolean(org && org !== DEFAULT_TENDERLY_ORG) &&
    Boolean(project && project !== DEFAULT_TENDERLY_PROJECT) &&
    Boolean(accessToken)
  );
}

/**
 * Get the Tenderly dashboard link for a simulation
 *
 * @param simulationId - The simulation ID from Tenderly
 * @returns The full URL to view the simulation in Tenderly dashboard
 */
export function getSimulationLink(simulationId: string): string {
  const { org, project } = getTenderlySettings();
  return `https://dashboard.tenderly.co/public/${org}/${project}/simulator/${simulationId}`;
}
