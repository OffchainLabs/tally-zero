/**
 * Timelock-specific simulation utilities
 */

import { encodeAbiParameters, keccak256 } from "viem";

import { CHAIN_IDS, FUNCTION_SELECTORS } from "./constants";
import { getSimulationLink, getTenderlySettings } from "./settings";
import type {
  ChainType,
  SimulationWithLink,
  StorageEncodingResponse,
  TenderlySimulationRequest,
  TenderlySimulationResponse,
} from "./types";

/**
 * Hash a batch operation using OpenZeppelin TimelockController algorithm
 */
function hashOperationBatchOz(
  targets: `0x${string}`[],
  values: bigint[],
  calldatas: `0x${string}`[],
  predecessor: `0x${string}`,
  salt: `0x${string}`
): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "address[]" },
      { type: "uint256[]" },
      { type: "bytes[]" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [targets, values, calldatas, predecessor, salt]
  );
  return keccak256(encoded);
}

/**
 * Encode storage overrides using Tenderly's API
 */
async function encodeStorageOverrides(
  networkId: string,
  contractAddress: string,
  storageObj: Record<string, string>
): Promise<Record<string, string>> {
  const { org, project, accessToken } = getTenderlySettings();

  if (!accessToken) {
    throw new Error("Tenderly access token required for storage encoding");
  }

  const endpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/contracts/encode-states`;

  const requestBody = {
    networkID: networkId,
    stateOverrides: {
      [contractAddress]: { value: storageObj },
    },
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Key": accessToken,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Tenderly encode API error (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as StorageEncodingResponse;
  const override = data.stateOverrides[contractAddress.toLowerCase()];
  if (!override) {
    throw new Error(
      `Storage encoding response missing contract ${contractAddress}. Keys: ${Object.keys(data.stateOverrides || {}).join(", ")}`
    );
  }
  return override.value;
}

function getNetworkId(chain: ChainType): string {
  switch (chain) {
    case "ethereum":
      return CHAIN_IDS.ethereum;
    case "arb1":
      return CHAIN_IDS.arb1;
    case "nova":
      return CHAIN_IDS.nova;
    default:
      return CHAIN_IDS.ethereum;
  }
}

/**
 * Decode scheduleBatch calldata to extract operation parameters
 */
function decodeScheduleBatchCalldata(calldata: string): {
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
  predecessor: `0x${string}`;
  salt: `0x${string}`;
} {
  const data = calldata.slice(10);

  const getWord = (offset: number) => data.slice(offset * 2, (offset + 32) * 2);
  const getNumber = (offset: number) => parseInt(getWord(offset), 16);

  const targetsOffset = getNumber(0);
  const valuesOffset = getNumber(32);
  const calldatasOffset = getNumber(64);
  const predecessor = ("0x" + getWord(96)) as `0x${string}`;
  const salt = ("0x" + getWord(128)) as `0x${string}`;

  const targetsLen = getNumber(targetsOffset);
  const targets: `0x${string}`[] = [];
  for (let i = 0; i < targetsLen; i++) {
    targets.push(
      ("0x" + getWord(targetsOffset + 32 + i * 32).slice(24)) as `0x${string}`
    );
  }

  const valuesLen = getNumber(valuesOffset);
  const values: bigint[] = [];
  for (let i = 0; i < valuesLen; i++) {
    values.push(BigInt("0x" + getWord(valuesOffset + 32 + i * 32)));
  }

  const calldatasLen = getNumber(calldatasOffset);
  const calldatas: `0x${string}`[] = [];
  const calldatasBase = calldatasOffset + 32;
  for (let i = 0; i < calldatasLen; i++) {
    const itemOffset = calldatasBase + getNumber(calldatasBase + i * 32);
    const itemLen = getNumber(itemOffset);
    const itemData = data.slice(
      (itemOffset + 32) * 2,
      (itemOffset + 32 + itemLen) * 2
    );
    calldatas.push(("0x" + itemData) as `0x${string}`);
  }

  return { targets, values, calldatas, predecessor, salt };
}

/**
 * Simulate a timelock batch execution by converting schedule to execute
 * and setting up the appropriate storage overrides
 */
export async function simulateTimelockBatch(params: {
  timelockAddress: string;
  calldata: string;
  chain: ChainType;
}): Promise<SimulationWithLink> {
  const { org, project, accessToken } = getTenderlySettings();

  if (!accessToken) {
    throw new Error("Tenderly access token required for timelock simulation");
  }

  const calldata = params.calldata;
  const isScheduleBatch = calldata.startsWith(FUNCTION_SELECTORS.scheduleBatch);
  const isSchedule = calldata.startsWith(FUNCTION_SELECTORS.schedule);

  if (!isScheduleBatch && !isSchedule) {
    throw new Error("Calldata must be a schedule or scheduleBatch call");
  }

  const executeBatchCalldata = calldata
    .replace(FUNCTION_SELECTORS.schedule, FUNCTION_SELECTORS.execute)
    .replace(FUNCTION_SELECTORS.scheduleBatch, FUNCTION_SELECTORS.executeBatch);

  const decoded = decodeScheduleBatchCalldata(calldata);
  const operationId = hashOperationBatchOz(
    decoded.targets,
    decoded.values,
    decoded.calldatas,
    decoded.predecessor,
    decoded.salt
  );

  const simTimestamp = Math.floor(Date.now() / 1000) + 1;
  const storageObj: Record<string, string> = {
    [`_timestamps[${operationId}]`]: simTimestamp.toString(),
  };

  const networkId = getNetworkId(params.chain);
  const fromAddress = params.timelockAddress;

  const encodedStorage = await encodeStorageOverrides(
    networkId,
    params.timelockAddress,
    storageObj
  );

  const endpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/simulate`;

  const requestBody: TenderlySimulationRequest = {
    network_id: networkId,
    from: fromAddress,
    to: params.timelockAddress,
    input: executeBatchCalldata,
    value: "1000000000000000",
    gas: 30000000,
    save: true,
    save_if_fails: true,
    block_header: {
      timestamp: "0x" + simTimestamp.toString(16),
    },
    state_objects: {
      [fromAddress]: { balance: "1000000000000000" },
      [params.timelockAddress]: { storage: encodedStorage },
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Key": accessToken,
    },
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
    link: getSimulationLink(data.simulation.id),
    success: data.simulation.status,
  };
}
