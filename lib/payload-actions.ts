import { addressesEqual } from "@/lib/address-utils";
import { isCoreGovernor } from "@config/governors";
import {
  ADDRESSES,
  decodeRetryableTicket,
  getAddressLabel,
  type KnownChain,
} from "@gzeoneth/gov-tracker";
import { decodeFunctionData, parseAbi } from "viem";

const arbSysAbi = parseAbi([
  "function sendTxToL1(address destination, bytes data) payable returns (uint256)",
]);

const l1TimelockAbi = parseAbi([
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
]);

const upgradeExecutorAbi = parseAbi([
  "function execute(address target, bytes data) payable",
  "function executeCall(address target, bytes data) payable",
]);

export type PayloadActionSimulation =
  | {
      type: "call";
      target: string;
      calldata: string;
      value: string;
      chain: KnownChain;
      from?: string;
    }
  | {
      type: "retryable";
      l2Target: string;
      l2Calldata: string;
      l2Value: string;
      chain: "arb1" | "nova" | "unknown";
    };

export interface EffectivePayloadAction {
  target: string;
  value: string;
  calldata: string;
  chain: KnownChain;
  simulation: PayloadActionSimulation;
}

export interface NormalizedPayloadGroup {
  sourceIndex: number;
  originalTarget: string;
  originalValue: string;
  originalCalldata: string;
  isCanonicalRoute: boolean;
  routeChains: KnownChain[];
  actions: EffectivePayloadAction[];
}

export function canFlattenGovernancePayload(
  governorAddress: string | undefined
): boolean {
  return governorAddress !== undefined && isCoreGovernor(governorAddress);
}

interface ScheduledOperation {
  target: string;
  value: string;
  calldata: string;
}

function decodeScheduledOperations(
  calldata: string
): ScheduledOperation[] | null {
  try {
    const decoded = decodeFunctionData({
      abi: l1TimelockAbi,
      data: calldata as `0x${string}`,
    });

    if (decoded.functionName === "schedule") {
      const [target, value, data] = decoded.args;
      return [{ target, value: value.toString(), calldata: data }];
    }

    const [targets, values, payloads] = decoded.args;
    if (
      targets.length === 0 ||
      targets.length !== values.length ||
      targets.length !== payloads.length
    ) {
      return null;
    }

    return targets.map((target, index) => ({
      target,
      value: values[index].toString(),
      calldata: payloads[index],
    }));
  } catch {
    return null;
  }
}

function unwrapUpgradeExecutor(
  target: string,
  value: string,
  calldata: string,
  chain: KnownChain,
  simulation: PayloadActionSimulation
): EffectivePayloadAction {
  const targetLabel = getAddressLabel(target, chain);
  if (!targetLabel?.includes("UpgradeExecutor")) {
    return { target, value, calldata, chain, simulation };
  }

  try {
    const decoded = decodeFunctionData({
      abi: upgradeExecutorAbi,
      data: calldata as `0x${string}`,
    });
    const [actionTarget, actionCalldata] = decoded.args;
    return {
      target: actionTarget,
      value,
      calldata: actionCalldata,
      chain,
      simulation,
    };
  } catch {
    return { target, value, calldata, chain, simulation };
  }
}

function resolveScheduledOperation(
  operation: ScheduledOperation
): EffectivePayloadAction | null {
  if (addressesEqual(operation.target, ADDRESSES.RETRYABLE_TICKET_MAGIC)) {
    const retryable = decodeRetryableTicket(operation.calldata);
    if (!retryable) return null;

    const chain =
      retryable.chain === "arb1" || retryable.chain === "nova"
        ? retryable.chain
        : null;
    if (!chain) return null;

    const simulation: PayloadActionSimulation = {
      type: "retryable",
      l2Target: retryable.l2Target,
      l2Calldata: retryable.l2Calldata,
      l2Value: retryable.l2Value,
      chain,
    };
    return unwrapUpgradeExecutor(
      retryable.l2Target,
      retryable.l2Value,
      retryable.l2Calldata,
      chain,
      simulation
    );
  }

  const simulation: PayloadActionSimulation = {
    type: "call",
    target: operation.target,
    calldata: operation.calldata,
    value: operation.value,
    chain: "ethereum",
    from: ADDRESSES.L1_TIMELOCK,
  };
  return unwrapUpgradeExecutor(
    operation.target,
    operation.value,
    operation.calldata,
    "ethereum",
    simulation
  );
}

function tryNormalizeCanonicalRoute(
  sourceIndex: number,
  target: string,
  value: string,
  calldata: string
): NormalizedPayloadGroup | null {
  if (!addressesEqual(target, ADDRESSES.ARB_SYS)) return null;

  try {
    // ArbSys is payable, but the Outbox forwards this value to the L1
    // destination. Timelock schedule/scheduleBatch are nonpayable, so a
    // canonical scheduling message cannot carry an outer value.
    if (BigInt(value) !== BigInt(0)) return null;

    const arbSysCall = decodeFunctionData({
      abi: arbSysAbi,
      data: calldata as `0x${string}`,
    });
    const [destination, l1TimelockCalldata] = arbSysCall.args;
    if (!addressesEqual(destination, ADDRESSES.L1_TIMELOCK)) return null;

    const scheduledOperations = decodeScheduledOperations(l1TimelockCalldata);
    if (!scheduledOperations) return null;

    const actions = scheduledOperations.map(resolveScheduledOperation);
    if (actions.some((action) => action === null)) return null;

    const resolvedActions = actions as EffectivePayloadAction[];
    return {
      sourceIndex,
      originalTarget: target,
      originalValue: value,
      originalCalldata: calldata,
      isCanonicalRoute: true,
      routeChains: Array.from(
        new Set(resolvedActions.map((action) => action.chain))
      ),
      actions: resolvedActions,
    };
  } catch {
    return null;
  }
}

export function normalizePayloadActions({
  targets,
  values,
  calldatas,
  allowCanonicalRoutes = true,
}: {
  targets: string[];
  values: string[];
  calldatas: string[];
  allowCanonicalRoutes?: boolean;
}): NormalizedPayloadGroup[] {
  return targets.map((target, sourceIndex) => {
    const value = values[sourceIndex] || "0";
    const calldata = calldatas[sourceIndex] || "0x";
    const canonical = allowCanonicalRoutes
      ? tryNormalizeCanonicalRoute(sourceIndex, target, value, calldata)
      : null;
    if (canonical) return canonical;

    return {
      sourceIndex,
      originalTarget: target,
      originalValue: value,
      originalCalldata: calldata,
      isCanonicalRoute: false,
      routeChains: ["arb1"],
      actions: [],
    };
  });
}
