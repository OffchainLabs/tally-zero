/**
 * Error handling utilities
 *
 * Provides functions for safely extracting error messages
 * and converting unknown error types to Error objects.
 */

/**
 * Converts an unknown error type to an Error object.
 * Use this when you need to store or rethrow an Error.
 *
 * @param error - The unknown error to convert
 * @returns An Error object with the error message
 *
 * @example
 * catch (err) {
 *   setError(toError(err));
 * }
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(String(error));
}

/**
 * Extracts a user-friendly error message from various error types.
 * Handles Error objects, strings, ethers.js errors, and unknown types.
 *
 * @param error - The error to extract a message from
 * @param context - Optional context to include in the fallback message
 * @returns The extracted error message string
 */
export function getErrorMessage(error: unknown, context?: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return context ? `Failed to ${context}` : "An error occurred";
}

/**
 * Extracts a user-friendly message from a contract simulation error.
 * Parses common Solidity revert reasons and wagmi/viem error structures.
 *
 * @param error - The simulation error from useSimulateContract
 * @returns A user-friendly error message
 */
export function getSimulationErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";

  const errorStr = String(error);

  // Check for common voting-related revert reasons
  if (
    errorStr.includes("GovernorVotingSimple: vote already cast") ||
    errorStr.includes("vote already cast")
  ) {
    return "You have already voted on this proposal.";
  }

  if (
    errorStr.includes("Governor: vote not currently active") ||
    errorStr.includes("vote not currently active")
  ) {
    return "Voting is not currently active for this proposal.";
  }

  if (errorStr.includes("below threshold") || errorStr.includes("threshold")) {
    return "Your voting power is below the required threshold.";
  }

  // Check for generic contract errors
  if (errorStr.includes("execution reverted")) {
    // Try to extract the reason
    const reasonMatch = errorStr.match(/reason="([^"]+)"/);
    if (reasonMatch) {
      return `Transaction would fail: ${reasonMatch[1]}`;
    }
    return "Transaction simulation failed. You may not be eligible to vote.";
  }

  // Check for connection/account errors
  if (errorStr.includes("connector not connected")) {
    return "Please connect your wallet to vote.";
  }

  // Fallback to generic message
  if (error instanceof Error) {
    // Shorten long error messages
    const msg = error.message;
    if (msg.length > 100) {
      return "Unable to simulate vote. Please check your wallet connection.";
    }
    return msg;
  }

  return "Unable to prepare vote transaction.";
}

/**
 * Extracts a user-friendly message from a proposal-cancel simulation error.
 * Maps common OZ Governor revert reasons for `cancel(...)` to readable text.
 *
 * @param error - The simulation error from useSimulateContract on the cancel call
 * @returns A user-friendly error message
 */
export function getProposalCancelSimulationErrorMessage(
  error: unknown
): string {
  if (!error) return "Unable to prepare cancellation transaction.";

  const errorMessage = getErrorMessage(error);
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("only proposer")) {
    return "Only the proposal creator can cancel this proposal.";
  }

  if (
    normalized.includes("too late to cancel") ||
    normalized.includes("proposal not pending") ||
    normalized.includes("pending")
  ) {
    return "Proposal cancellation is only available before voting starts.";
  }

  if (
    normalized.includes("unknown proposal") ||
    normalized.includes("nonexistent proposal")
  ) {
    return "Proposal data does not match the on-chain proposal. Cannot cancel.";
  }

  const reasonMatch =
    errorMessage.match(/reason="([^"]+)"/) ??
    errorMessage.match(/reverted with reason string '([^']+)'/) ??
    errorMessage.match(/reverted with the following reason:\s*\n?([^\n]+)/i) ??
    errorMessage.match(/reverted:\s*([^\n]+)/i);
  if (reasonMatch?.[1]) {
    return `Transaction would fail: ${reasonMatch[1].trim()}`;
  }

  return "Unable to prepare cancellation transaction.";
}

/**
 * Detects wallet/provider errors that mean the user rejected the request
 * (MetaMask 4001, viem ACTION_REJECTED, common wallet error strings).
 * Use this to suppress error toasts for intentional cancellations.
 *
 * @param error - An error from wagmi/viem wallet interactions
 * @returns true if the error represents a user-initiated rejection
 */
export function isUserRejectedError(error: unknown): boolean {
  if (!error) return false;

  const message = getErrorMessage(error).toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  return (
    code === "4001" ||
    code === "ACTION_REJECTED" ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request") ||
    message.includes("request rejected") ||
    message.includes("denied transaction signature")
  );
}
