/**
 * VoteCast event ABI fragments for OpenZeppelin Governor contracts.
 *
 * Source: OpenZeppelin `IGovernor` interface
 * (https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/IGovernor.sol).
 * Both events follow the same canonical signatures across OZ Governor
 * deployments — Arbitrum's L2ArbitrumGovernor inherits IGovernor unchanged.
 *
 * Why this constant lives in the repo (not pulled from gov-tracker):
 * `@gzeoneth/gov-tracker` exports `GOVERNOR_ABI` (functions + ProposalCreated)
 * and `EVENT_TOPICS.VOTE_CAST` / `EVENT_TOPICS.VOTE_CAST_WITH_PARAMS` (just the
 * keccak256 topic hashes for filtering). Neither is sufficient to parse the
 * event payload, so we keep the parseable fragments here.
 *
 * Verification (cross-checked 2026-05-08):
 * - Topic hashes match `EVENT_TOPICS.VOTE_CAST` / `VOTE_CAST_WITH_PARAMS`
 *   in gov-tracker's `dist/constants.js`.
 * - `VoteCast` matches `data/OzGovernor_ABI.json` byte-for-byte
 *   (indexed voter, then proposalId/support/weight/reason).
 * - Confirmed against real onchain logs:
 *     - VoteCast on Core Governor (0xf07DeD9d…395B9), block 74006808.
 *     - VoteCastWithParams on Member Election Governor
 *       (0x467923B9…712C), block 200373813.
 *   In both, `topics[0]` matches `cast keccak` of the event signature and
 *   `voter` is the indexed param in `topics[1]`.
 *
 * Note: the Core and Treasury Governors only emit `VoteCast`; the Member
 * Election Governor emits `VoteCastWithParams`. Querying both filters from
 * a governor that doesn't emit the params variant is harmless (returns []).
 */
export const VOTE_CAST_ABI = [
  "event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)",
  "event VoteCastWithParams(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason, bytes params)",
] as const;
