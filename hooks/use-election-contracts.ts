"use client";

import {
  MAINNET_ELECTION_CONFIG,
  type ElectionConfig,
} from "@gzeoneth/gov-tracker";

import { STORAGE_KEYS } from "@/config/storage-keys";
import { useMemo } from "react";
import { useChainId } from "wagmi";
import { useLocalStorage } from "./use-local-storage";

export interface ElectionContractOverrides {
  nomineeGovernor?: string;
  memberGovernor?: string;
  tokenAddress?: string;
}

const EMPTY_OVERRIDES: ElectionContractOverrides = {};

const SEPOLIA_CONFIG: ElectionConfig = {
  nomineeGovernorAddress: "0xE1DFF2B940940e743675496C91Ab589018282EA0",
  memberGovernorAddress: "0x3D110E6045BC7990f6A2eFfd211852cE5f556736",
  tokenAddress: "0x8e3A45b777F35Aa95829529e33b15815140Ba546",
  chainId: 421614,
};

const CONFIGS: Record<number, ElectionConfig> = {
  [MAINNET_ELECTION_CONFIG.chainId]: MAINNET_ELECTION_CONFIG,
  [SEPOLIA_CONFIG.chainId]: SEPOLIA_CONFIG,
};

export function useElectionContracts(): Required<ElectionConfig> {
  const chainId = useChainId();
  const [overrides] = useLocalStorage<ElectionContractOverrides>(
    STORAGE_KEYS.ELECTION_CONTRACT_OVERRIDES,
    EMPTY_OVERRIDES
  );

  return useMemo(() => {
    const base = CONFIGS[chainId] ?? MAINNET_ELECTION_CONFIG;

    return {
      ...base,
      tokenAddress: base.tokenAddress ?? MAINNET_ELECTION_CONFIG.tokenAddress!,
      ...(overrides?.nomineeGovernor && {
        nomineeGovernorAddress: overrides.nomineeGovernor as `0x${string}`,
      }),
      ...(overrides?.memberGovernor && {
        memberGovernorAddress: overrides.memberGovernor as `0x${string}`,
      }),
      ...(overrides?.tokenAddress && {
        tokenAddress: overrides.tokenAddress as `0x${string}`,
      }),
    };
  }, [chainId, overrides]);
}
