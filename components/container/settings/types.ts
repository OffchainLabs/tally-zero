import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
} from "@/config/storage-keys";

/**
 * Settings form state for all input fields
 */
export interface SettingsFormState {
  l2RpcInput: string;
  l1RpcInput: string;
  blockRangeInput: string;
  l1BlockRangeInput: string;
  daysInput: string;
  ttlInput: number;
  ttlCustomInput: string;
  tenderlyOrgInput: string;
  tenderlyProjectInput: string;
  tenderlyAccessTokenInput: string;
}

/**
 * Get default form state
 */
export function getDefaultFormState(): SettingsFormState {
  return {
    l2RpcInput: "",
    l1RpcInput: "",
    blockRangeInput: String(DEFAULT_FORM_VALUES.blockRange),
    l1BlockRangeInput: String(DEFAULT_FORM_VALUES.l1BlockRange),
    daysInput: String(DEFAULT_FORM_VALUES.daysToSearch),
    ttlInput: DEFAULT_CACHE_TTL_MS / 1000,
    ttlCustomInput: String(DEFAULT_CACHE_TTL_MS / 1000),
    tenderlyOrgInput: DEFAULT_TENDERLY_ORG,
    tenderlyProjectInput: DEFAULT_TENDERLY_PROJECT,
    tenderlyAccessTokenInput: "",
  };
}

/**
 * Stored settings values from localStorage
 */
export interface StoredSettings {
  storedL2Rpc: string;
  storedL1Rpc: string;
  blockRange: number;
  l1BlockRange: number;
  daysToSearch: number;
  cacheTtl: number;
  skipBundledCache: boolean;
  tenderlyOrg: string;
  tenderlyProject: string;
  tenderlyAccessToken: string;
}
