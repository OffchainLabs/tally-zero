"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { l2ChainId } from "@/config/chains";
import { useEnsureChain } from "@/hooks/use-ensure-chain";
import type { TimelockOperationInfo } from "@/hooks/use-timelock-operation";
import {
  computeOperationIds,
  encodeTimelockExecution,
  findKnownSalt,
  hasRetryableCalls,
  matchEntryPoint,
  timelockExecutionValue,
  type TimelockExecution,
} from "@/lib/timelock-execution";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useAccount,
  useEstimateGas,
  usePublicClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";

interface ExecuteTimelockButtonProps {
  /** A discovered single operation, or an operation's full call list */
  operation: TimelockOperationInfo | TimelockExecution;
  onSuccess?: () => void;
}

function toExecution(
  operation: TimelockOperationInfo | TimelockExecution
): TimelockExecution {
  if ("calls" in operation) return operation;
  return {
    operationId: operation.operationId,
    timelockAddress: operation.timelockAddress,
    calls: [
      {
        target: operation.target,
        value: operation.value,
        data: operation.data,
      },
    ],
    predecessor: operation.predecessor,
  };
}

export function ExecuteTimelockButton({
  operation: input,
  onSuccess,
}: ExecuteTimelockButtonProps) {
  const { isConnected } = useAccount();
  const [customSalt, setCustomSalt] = useState("");

  // Keyed on content, so a caller rebuilding the object each render does not
  // re-run the hashing and the gas estimate.
  const executionKey = JSON.stringify(toExecution(input));
  const execution = useMemo(
    () => JSON.parse(executionKey) as TimelockExecution,
    [executionKey]
  );
  const chainId = execution.chainId ?? l2ChainId();
  const { ensure } = useEnsureChain(chainId);
  const client = usePublicClient({ chainId });

  const knownSalt = useMemo(() => findKnownSalt(execution), [execution]);

  const needsCustomSalt = !knownSalt;

  const { validatedSalt, saltValidationError } = useMemo(() => {
    if (!needsCustomSalt || !customSalt) {
      return { validatedSalt: null, saltValidationError: null };
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(customSalt)) {
      return {
        validatedSalt: null,
        saltValidationError:
          "Salt must be a valid bytes32 (0x followed by 64 hex characters)",
      };
    }
    const entryPoint = matchEntryPoint(execution, customSalt);
    if (entryPoint) {
      return {
        validatedSalt: { salt: customSalt, entryPoint },
        saltValidationError: null,
      };
    }
    const ids = computeOperationIds(execution, customSalt);
    const computedId = ids.execute ?? ids.executeBatch;
    return {
      validatedSalt: null,
      saltValidationError: `Salt produces operation ID ${computedId.slice(0, 18)}... which doesn't match expected ${execution.operationId.slice(0, 18)}...`,
    };
  }, [needsCustomSalt, customSalt, execution]);

  const effectiveSalt = validatedSalt ?? knownSalt;

  const encoded = useMemo(
    () =>
      effectiveSalt
        ? encodeTimelockExecution(
            execution,
            effectiveSalt.salt,
            effectiveSalt.entryPoint
          )
        : undefined,
    [effectiveSalt, execution]
  );

  // Retryable tickets created by an L1 timelock are paid at execution time.
  const needsPricing = hasRetryableCalls(execution);
  const { data: value, error: valueError } = useQuery({
    queryKey: ["timelock-execution-value", chainId, executionKey],
    queryFn: () => timelockExecutionValue(execution, client!),
    enabled: !!client,
    staleTime: needsPricing ? 30_000 : Infinity,
  });

  const prepared =
    encoded && value !== undefined ? { ...encoded, value } : undefined;

  const {
    error: estimateError,
    isError: isEstimateError,
    isLoading: isEstimating,
  } = useEstimateGas({
    to: prepared?.to,
    data: prepared?.data,
    value: prepared?.value,
    chainId,
    query: { enabled: !!prepared && isConnected },
  });

  const {
    data: txHash,
    isPending: isSending,
    sendTransaction,
    error: sendError,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
      chainId,
    });

  useEffect(() => {
    if (isConfirmed && txHash) {
      toast.success("Timelock operation executed successfully!");
      onSuccess?.();
    }
  }, [isConfirmed, txHash, onSuccess]);

  useEffect(() => {
    if (sendError) {
      toast.error(`Transaction failed: ${sendError.message}`);
    }
  }, [sendError]);

  const handleExecute = async () => {
    if (!prepared || isEstimateError) return;
    try {
      await ensure();
    } catch {
      return;
    }
    sendTransaction({
      to: prepared.to,
      data: prepared.data,
      value: prepared.value,
      chainId,
    });
  };

  if (!isConnected) {
    return (
      <div className="text-xs text-muted-foreground">
        Connect wallet to execute
      </div>
    );
  }

  if (needsCustomSalt && !validatedSalt) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-yellow-600 dark:text-yellow-400">
          Operation requires a non-zero salt
        </div>
        <div className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              type="text"
              placeholder="0x..."
              value={customSalt}
              onChange={(e) => setCustomSalt(e.target.value)}
              className="font-mono text-xs h-8"
            />
            {saltValidationError && (
              <div className="text-xs text-red-500">{saltValidationError}</div>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Expected operation ID: {execution.operationId.slice(0, 18)}...
        </div>
      </div>
    );
  }

  if (valueError) {
    return (
      <div className="text-xs text-red-500" title={valueError.message}>
        Cannot price the retryable tickets this execution creates
      </div>
    );
  }

  if (isEstimating) {
    return (
      <Button size="sm" disabled>
        <ReloadIcon className="h-3 w-3 mr-1 animate-spin" />
        Checking...
      </Button>
    );
  }

  if (isEstimateError && estimateError) {
    const errorMsg = estimateError.message.toLowerCase();
    if (
      errorMsg.includes("not ready") ||
      errorMsg.includes("operation is not ready")
    ) {
      return (
        <div className="text-xs text-yellow-600 dark:text-yellow-400">
          Operation not yet ready
        </div>
      );
    }
    if (
      errorMsg.includes("missing role") ||
      errorMsg.includes("accesscontrol")
    ) {
      return (
        <div className="text-xs text-muted-foreground">
          Execution restricted to authorized addresses
        </div>
      );
    }
    return (
      <div className="text-xs text-red-500" title={estimateError.message}>
        Cannot execute (simulation failed)
      </div>
    );
  }

  if (isSending || isConfirming) {
    return (
      <Button size="sm" disabled>
        <ReloadIcon className="h-3 w-3 mr-1 animate-spin" />
        {isConfirming ? "Confirming..." : "Executing..."}
      </Button>
    );
  }

  if (isConfirmed) {
    return (
      <Button size="sm" variant="outline" disabled>
        Executed ✓
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => void handleExecute()}
      disabled={!prepared || isEstimateError}
    >
      Execute Operation
    </Button>
  );
}
