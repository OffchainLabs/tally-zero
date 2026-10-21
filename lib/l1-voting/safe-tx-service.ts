// The Safe Transaction Service path for a Safe delegate's claim: one owner proposes the Safe
// transaction with an off-chain EIP-712 signature, others add confirmations, and whoever executes
// gathers them from the service. Plain fetch against the service's v1 REST API; no SDK.

import { type Address, getAddress, type Hex } from "viem";

import { isLocalChainsEnabled } from "@/config/chains";
import { env } from "@/env";

import { execArgs, type OwnerSignature, type SafeTxState } from "./safe";

/** Safe's hosted services, by chain id */
export const DEFAULT_SAFE_TX_SERVICE_URLS: Readonly<Record<number, string>> = {
  42161: "https://safe-transaction-arbitrum.safe.global",
};

/**
 * The service for `chainId`, or null when there is none: `NEXT_PUBLIC_SAFE_TX_SERVICE_URL` when
 * set, else Safe's hosted one. The local chains have no hosted service, so they get one only when
 * the env names it.
 */
export function safeTxServiceUrl(
  chainId: number,
  configured: string | undefined = env.NEXT_PUBLIC_SAFE_TX_SERVICE_URL,
  local: boolean = isLocalChainsEnabled()
): string | null {
  const url =
    configured || (local ? null : DEFAULT_SAFE_TX_SERVICE_URLS[chainId]);
  return url ? url.replace(/\/+$/, "") : null;
}

/** A confirmation as the service lists it */
export interface SafeServiceConfirmation {
  owner: Address;
  signature: Hex;
  /** "EOA" (EIP-712), "ETH_SIGN", "APPROVED_HASH" or "CONTRACT_SIGNATURE" */
  signatureType: string;
  submissionDate?: string;
  transactionHash?: string | null;
}

export class SafeTxServiceError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SafeTxServiceError";
  }
}

type Fetch = typeof fetch;

async function request<T>(
  fetcher: Fetch,
  url: string,
  init?: { method: "POST"; body: unknown }
): Promise<T | null> {
  const response = await fetcher(url, {
    method: init?.method ?? "GET",
    headers: init ? { "Content-Type": "application/json" } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
  });
  if (response.status === 404 && !init) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SafeTxServiceError(
      `Safe Transaction Service ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      response.status
    );
  }
  // POSTs answer 201 with an empty body
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : null;
}

/** The `multisig-transactions` body for the claim transaction, signed by `sender` */
export function proposalBody(
  state: SafeTxState,
  sender: Address,
  signature: Hex,
  origin = "Tally Zero L1 voting registration"
) {
  const [
    to,
    value,
    data,
    operation,
    safeTxGas,
    baseGas,
    gasPrice,
    gasToken,
    refundReceiver,
  ] = execArgs(state.call);
  return {
    to: getAddress(to),
    value: value.toString(),
    data,
    operation,
    safeTxGas: safeTxGas.toString(),
    baseGas: baseGas.toString(),
    gasPrice: gasPrice.toString(),
    gasToken: getAddress(gasToken),
    refundReceiver: getAddress(refundReceiver),
    nonce: state.nonce.toString(),
    contractTransactionHash: state.safeTxHash,
    sender: getAddress(sender),
    signature,
    origin,
  };
}

export function safeTxServiceClient(baseUrl: string, fetcher: Fetch = fetch) {
  const api = `${baseUrl}/api/v1`;
  return {
    /** Proposes the transaction with the sender's signature as its first confirmation */
    async propose(
      state: SafeTxState,
      sender: Address,
      signature: Hex
    ): Promise<void> {
      await request(
        fetcher,
        `${api}/safes/${getAddress(state.safe)}/multisig-transactions/`,
        {
          method: "POST",
          body: proposalBody(state, sender, signature),
        }
      );
    },

    /** The confirmations so far; null when the service has never seen the transaction */
    async confirmations(
      safeTxHash: Hex
    ): Promise<SafeServiceConfirmation[] | null> {
      const page = await request<{ results: SafeServiceConfirmation[] }>(
        fetcher,
        `${api}/multisig-transactions/${safeTxHash}/confirmations/`
      );
      return page ? page.results : null;
    },

    /** Adds an owner's signature to a proposed transaction */
    async confirm(safeTxHash: Hex, signature: Hex): Promise<void> {
      await request(
        fetcher,
        `${api}/multisig-transactions/${safeTxHash}/confirmations/`,
        {
          method: "POST",
          body: { signature },
        }
      );
    },
  };
}

export type SafeTxServiceClient = ReturnType<typeof safeTxServiceClient>;

/**
 * The confirmations execution can use as ECDSA signatures. An APPROVED_HASH one is only good once
 * it is on chain, where `readSafeTx` already counts it; a contract signature is not supported.
 */
export function ecdsaConfirmations(
  confirmations: SafeServiceConfirmation[]
): OwnerSignature[] {
  return confirmations.flatMap((c): OwnerSignature[] => {
    if (c.signatureType === "EOA")
      return [
        { owner: getAddress(c.owner), signature: c.signature, kind: "EIP712" },
      ];
    if (c.signatureType === "ETH_SIGN")
      return [
        {
          owner: getAddress(c.owner),
          signature: c.signature,
          kind: "ETH_SIGN",
        },
      ];
    return [];
  });
}
