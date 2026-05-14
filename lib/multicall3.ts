/**
 * Multicall3 — canonical multicall contract deployed at the same address on
 * every supported chain (including Arbitrum One).
 *
 * Source: https://github.com/mds1/multicall and https://www.multicall3.com
 *
 * Security note: the Multicall3 deployer key was compromised (mined with
 * Profanity). The compromise affects new deployments under the original
 * deployer only; existing deployments are immutable bytecode and are safe.
 * Per the repo, only the Ancient8 deployment is known to be tampered. We
 * only call Multicall3 on Arbitrum One (canonical, pre-compromise deployment)
 * and only for read-only `aggregate3` of view functions, so no value or
 * signed messages flow through it.
 */

export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const MULTICALL3_AGGREGATE3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) external view returns ((bool success, bytes returnData)[] returnData)",
];
