"use client";

import { ADDRESSES } from "@gzeoneth/gov-tracker";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { toast } from "sonner";
import { type Hex, parseAbi } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { Button } from "@/components/ui/Button";
import { l2ChainId } from "@/config/chains";
import { useEnsureChain } from "@/hooks/use-ensure-chain";
import { getErrorMessage, isUserRejectedError } from "@/lib/error-utils";

export const ARB_RETRYABLE_TX_ABI = parseAbi([
  "function redeem(bytes32 ticketId) returns (bytes32)",
]);

export interface RedeemRetryableButtonProps {
  ticketId: string;
  /** Called once the redeem is mined, to re-read the stages */
  onRedeemed?: () => void;
}

/**
 * Manually redeems a retryable ticket whose auto-redeem failed, through the
 * ArbRetryableTx precompile on the Arbitrum chain. Anyone can redeem.
 */
export function RedeemRetryableButton({
  ticketId,
  onRedeemed,
}: RedeemRetryableButtonProps) {
  const chainId = l2ChainId();
  const { isConnected } = useAccount();
  const client = usePublicClient({ chainId });
  const { ensure } = useEnsureChain(chainId);
  const { writeContractAsync } = useWriteContract();
  const [isRedeeming, setIsRedeeming] = useState(false);

  const redeem = async () => {
    setIsRedeeming(true);
    try {
      await ensure();
      const hash = await writeContractAsync({
        address: ADDRESSES.ARB_RETRYABLE_TX,
        abi: ARB_RETRYABLE_TX_ABI,
        functionName: "redeem",
        args: [ticketId as Hex],
        chainId,
      });
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Redeem reverted on chain");
      }
      toast.success("Retryable ticket redeemed");
      onRedeemed?.();
    } catch (error) {
      if (!isUserRejectedError(error)) {
        toast.error(getErrorMessage(error, "redeem retryable"), {
          id: `redeem-${ticketId}`,
        });
      }
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 px-2 text-xs"
      data-testid="retryable-redeem"
      disabled={!isConnected || !client || isRedeeming}
      title={isConnected ? undefined : "Connect a wallet to redeem"}
      onClick={() => void redeem()}
    >
      {isRedeeming && <ReloadIcon className="h-3 w-3 mr-1 animate-spin" />}
      {isRedeeming ? "Redeeming..." : "Redeem"}
    </Button>
  );
}
