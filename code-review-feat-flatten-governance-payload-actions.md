# Code Review: feat/flatten-governance-payload-actions

## Context

- Review target: `feat/flatten-governance-payload-actions` at `c8caee4eafc78f383dfb4b939af8c1e6cbd105db`
- Base branch: `origin/main` at `018225bba74781ce5202940c235ff650e2b7e815`
- Comparison: `origin/main...HEAD`, after fetching `origin/main` on 2026-08-05
- PR: No pull request was found for this branch, so no PR title, description, or URL was available.
- PR intent summary: Inferred from the two branch commits. The branch resolves structurally canonical Core Governor round-trip payloads into chain-aware final actions, retains the submitted transport route in a disclosure, and preserves the previous presentation for unrecognized payloads.

## Verdict

Not ready as written. The main flow works and the focused checks pass, but two canonical-route cases can produce a misleading final-action presentation: supported `executeCall` actions are not unwrapped, and route classification ignores the proposal's governor and outer call value.

## Findings

### Medium: `executeCall` actions remain wrapped at the UpgradeExecutor

- Location: `lib/payload-actions.ts:19`
- Issue: `upgradeExecutorAbi` contains only `execute(address,bytes)`, so `unwrapUpgradeExecutor` cannot unwrap `executeCall(address,bytes)`. `UpgradeExecRouteBuilder.createActionRouteData2` explicitly supports both action types, and the installed decoder already recognizes the `executeCall` selector. A read-only probe against the bundled governance cache reproduced this on proposal IDs `51852039695020109312343918128899814224888993575448130385109956762385891284115` and `112177996398925212273579485756315626637025938627124330171390356044681347897430`: each group was classified canonical, but the `executeCall` leg retained the UpgradeExecutor as its displayed target.
- Impact: For live and future proposals using the newer direct-call path, the UI does not foreground the actual final contract and calldata, which is the primary purpose of this feature. Mixed batches become especially inconsistent because `execute` legs are flattened while `executeCall` legs are not.
- Recommendation: Add `executeCall(address,bytes)` to the ABI and unwrap either function to the inner target/calldata while retaining the original executor call in `simulation`. Add direct-L1 and retryable tests for `executeCall`, including a mixed `execute`/`executeCall` batch.

### Medium: Canonical classification ignores execution origin and the outer ArbSys value

- Location: `components/payload/PayloadView.tsx:130`; `lib/payload-actions.ts:173`
- Issue: `PayloadView` has `governorAddress`, but normalization receives only targets, values, and calldatas. Consequently, any proposal—including a Treasury or arbitrary governor proposal—is flattened when its bytes structurally target ArbSys and the known L1 timelock. That is not a complete canonical route: `L1ArbitrumTimelock.schedule` and `scheduleBatch` accept messages only from the configured counterpart L2 Core Timelock. The resolver also receives the outer value but never requires it to be zero, even though `ArbSys.sendTxToL1` is nonpayable.
- Impact: An invalid or non-Core proposal can be presented as executable final actions with the failing transport details collapsed. This contradicts the stated compatibility goal that Treasury and arbitrary proposals keep the existing presentation unless they match a complete canonical constitutional route.
- Recommendation: Gate flattening on `isCoreGovernor(governorAddress)` at the presentation boundary and require the submitted ArbSys action value to be zero before returning `isCanonicalRoute: true`. Fall back to the raw action view otherwise. Add tests for Treasury/unknown governors and a nonzero outer value.

## Test Expectations

- Branch intent: Feature/function change affecting payload interpretation, rendering, chain context, and simulations.
- Expected tests: Unit coverage for every supported canonical route and fallback condition, plus component-level coverage for flattened numbering, route disclosure, chain labels, override re-normalization, fallback rendering, and simulation selection.
- Tests added or changed: Added `lib/payload-actions.test.ts` with three tests covering a mixed Ethereum/Arbitrum One/Nova batch, a single direct L1 schedule, and malformed/noncanonical fallback.
- Gaps: No `executeCall`, source-governor, nonzero outer-value, component-rendering, override-transition, or simulation-dispatch coverage was added.

## Unexpected Changes

- None found. The heading changes in `VoteModel` and `ProposalDetail`, plus the chain-aware decoder changes, align with the inferred feature intent.

## Validation

- Commands run:
  - `git fetch origin main`
  - `gh pr view --json title,body,baseRefName,headRefName,url,number`
  - `git diff --stat origin/main...HEAD`, `git diff --name-status origin/main...HEAD`, full changed-file diffs, and `git diff --check origin/main...HEAD`
  - `OPENSSL_CONF=/dev/null pnpm exec vitest --run lib/payload-actions.test.ts`
  - `OPENSSL_CONF=/dev/null pnpm exec tsc --noEmit`
  - `OPENSSL_CONF=/dev/null pnpm exec eslint` on all seven changed files
  - `OPENSSL_CONF=/dev/null pnpm exec prettier --check` on all seven changed files
  - A read-only `pnpm exec tsx -e` probe applying `normalizePayloadActions` to bundled proposals containing `executeCall`
- Results: Fetch succeeded; no PR exists for the branch; diff check passed; 1 focused test file and all 3 tests passed; TypeScript, focused ESLint, and Prettier checks passed. The bundled-data probe reproduced the first finding on two proposals.
- Not run: Full Vitest suite, production build, and interactive browser/visual validation.

## Notes

- The worktree contained the untracked file `lib/__scratch-verify.test.ts` before review. It was kept separate from the branch diff and was not modified.
- The canonical-route behavior was cross-checked against the sibling governance repository's `L1ArbitrumTimelock.sol` and `UpgradeExecRouteBuilder.sol`, as referenced by the branch commits.

## Follow-up Validation (2026-08-05)

- Both medium findings were confirmed.
- Correction to the second finding's rationale: `ArbSys.sendTxToL1` is payable. The zero-value restriction is still correct for this canonical route because Nitro's Outbox forwards the withdrawal value to the L1 destination, while `TimelockController.schedule` and `scheduleBatch` are nonpayable.
- `executeCall(address,bytes)` is now decoded alongside `execute(address,bytes)`. The original executor calldata remains the simulation input, while the displayed target and calldata are the final direct call.
- Canonical flattening is now enabled only for the configured Core Governor, and a nonzero outer `ArbSys.sendTxToL1` value forces the existing raw-action fallback.
- Regression coverage now includes mixed `execute`/`executeCall` batches across direct L1 and retryable routes, nonzero outer value, disabled normalization, and Core/Treasury/unknown governor classification.
- A read-only probe reran normalization for both proposal IDs cited above. Their `executeCall` legs now display final targets (`0x0000000000000000000000000000000000000070` and `0x1D62fFeB72e4c360CcBbacf7c965153b00260417`) while retaining selector `0xbca8c7b5` in simulation calldata.
- Follow-up verdict: the two blocking review findings are resolved. Component-level rendering and interactive visual coverage remain residual test gaps, not reproduced correctness failures.
