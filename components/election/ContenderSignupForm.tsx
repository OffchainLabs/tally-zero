"use client";

import { useEffect, useMemo } from "react";
import {
  useAccount,
  useEstimateGas,
  useReadContract,
  useSendTransaction,
  useSignTypedData,
} from "wagmi";

import { ReloadIcon } from "@radix-ui/react-icons";
import { CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  prepareContenderRegistration,
  readGovernorName,
  readIsContender,
} from "@gzeoneth/gov-tracker";

import { Button } from "@/components/ui/Button";
import { useElectionContracts } from "@/hooks/use-election-contracts";
import { getSimulationErrorMessage } from "@/lib/error-utils";

interface ContenderSignupFormProps {
  proposalId: string;
}

export function ContenderSignupForm({
  proposalId,
}: ContenderSignupFormProps): React.ReactElement {
  const { address, isConnected } = useAccount();
  const { nomineeGovernorAddress, chainId } = useElectionContracts();
  const governorAddress = nomineeGovernorAddress;

  const { data: governorName } = useReadContract({
    ...readGovernorName(governorAddress, chainId),
    query: { staleTime: Infinity },
  });

  const { data: isAlreadyContender, refetch: refetchContender } =
    useReadContract({
      ...readIsContender(proposalId, address ?? "0x", governorAddress, chainId),
      query: { enabled: isConnected && !!address },
    });

  const registration = useMemo(() => {
    if (!governorName) return undefined;
    return prepareContenderRegistration(
      governorName as string,
      proposalId,
      governorAddress,
      chainId
    );
  }, [governorName, proposalId, governorAddress, chainId]);

  const {
    data: signature,
    signTypedData,
    isPending: isSigning,
    reset: resetSignature,
  } = useSignTypedData();

  const prepared = useMemo(() => {
    if (!signature || !registration) return undefined;
    return registration.buildTransaction(signature);
  }, [signature, registration]);

  const { error: estimateError, isError: isEstimateError } = useEstimateGas({
    to: prepared?.to,
    data: prepared?.data,
    query: { enabled: !!prepared },
  });

  const simulationErrorMessage = useMemo(() => {
    if (!isEstimateError || !estimateError) return null;
    return getSimulationErrorMessage(estimateError);
  }, [isEstimateError, estimateError]);

  const {
    data: txHash,
    isPending: isWriting,
    isSuccess,
    sendTransaction,
  } = useSendTransaction();

  useEffect(() => {
    if (txHash) {
      toast("Successfully registered as contender!");
      refetchContender();
      resetSignature();
    }
  }, [txHash, refetchContender, resetSignature]);

  function handleSign(): void {
    if (!registration) return;

    const td = registration.typedData;
    signTypedData({
      domain: {
        ...td.domain,
        verifyingContract: td.domain.verifyingContract as `0x${string}`,
      },
      types: td.types,
      primaryType: td.primaryType,
      message: {
        proposalId: BigInt(td.message.proposalId),
      },
    });
  }

  function handleSubmit(): void {
    if (!prepared || isEstimateError) return;
    sendTransaction({
      to: prepared.to,
      data: prepared.data,
    });
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Wallet className="h-4 w-4" />
        Connect your wallet to register as a contender
      </div>
    );
  }

  if (isAlreadyContender) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-500 p-4">
        <CheckCircle2 className="h-4 w-4" />
        You are already registered as a contender
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        Sign a message to register as a contender for this Security Council
        election. This requires an EIP-712 signature.
      </p>

      {simulationErrorMessage && (
        <p className="text-sm text-red-500 dark:text-red-400">
          {simulationErrorMessage}
        </p>
      )}

      {isSuccess ? (
        <Button variant="secondary" disabled>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Registered
        </Button>
      ) : isWriting ? (
        <Button disabled>
          <ReloadIcon className="h-4 w-4 mr-2 animate-spin" />
          Submitting...
        </Button>
      ) : prepared ? (
        <Button onClick={handleSubmit} disabled={isEstimateError}>
          Submit Registration
        </Button>
      ) : isSigning ? (
        <Button disabled>
          <ReloadIcon className="h-4 w-4 mr-2 animate-spin" />
          Signing...
        </Button>
      ) : (
        <Button onClick={handleSign} disabled={!registration}>
          Register as Contender
        </Button>
      )}
    </div>
  );
}
