---
name: pre-push-review-branch
description: Review a git branch or GitHub pull request using software engineering best practices. Use when asked to review branch changes, review a PR, compare a branch against main/master/default, audit feature or test-only branches, check that a branch stuck to its stated purpose, or produce a written code review artifact. Always fetch and compare against the latest default branch via the merge-base, quote the PR description as the source of intent, classify every changed file, require appropriate tests for feature/bug-fix changes, flag logic changes in test-only or refactor branches, and write the review to a markdown file.
---

# Review Branch

## Overview

Review the current branch or requested pull request against the latest default
branch and write the review to a markdown file for manual inspection.

Prioritize correctness, behavioral regressions, maintainability, security,
performance, missing tests, and unexpected scope changes. Treat the pull request
description as the source of intent, then verify whether the code matches that
intent.

Two rules govern everything below:

- **Read the diff hunks, not the file list.** A suspicious-looking file can turn
  out to be a pure rename, and an innocuous-looking one can hide a behavior
  delta. Never classify a file you have not read.
- **Do not trust commit messages or the PR body as evidence.** They state
  intent. Only the diff states what happened. A commit titled "refactor" can
  contain a behavior change.

Read-only inspection only. Never run destructive git commands (`reset`,
`rebase`, `checkout -f`, force push), never create commits, never push, and
never open or modify the PR.

## When to invoke

- "Review this branch", "review the current branch", "do a branch review",
  "review PR #123", or similar.
- A request to confirm a branch stuck to its stated purpose, for example "this
  should only add tests, flag anything else".
- A request for a written code review artifact for a branch or PR.

If the user names a specific PR or commit range rather than the current branch,
follow the same procedure with the base/head refs adjusted accordingly.

## Workflow

Execute these steps in order. Do not skip a step because you think you already
know the answer; verify from the repository.

### 1. Identify the review target

- Current branch: `git rev-parse --abbrev-ref HEAD`. Use it unless the user
  names a branch or PR.
- Determine the default branch, preferring these sources in order: the PR base
  branch, `git symbolic-ref refs/remotes/origin/HEAD` (strip the `origin/`
  prefix), the hosting provider, a remote query.
- If none resolve, try `main`, then `master`, and state the fallback in the
  review file.
- If the detected default branch looks unexpected for the repository, confirm
  with the user before continuing.

### 2. Update the comparison base

- Fetch the latest default branch from the remote before reviewing
  (`git fetch origin <default>`).
- Compare against the fetched remote ref, not a stale local branch.
- If fetching is impossible because of permissions, network, or missing remotes,
  say so explicitly in the review file and use the best available local base.

### 3. Read the pull request description

- Use the hosting CLI/API when available:
  `gh pr view --json number,url,title,body,state,baseRefName,headRefName`.
- **Quote the stated intent verbatim** (title plus the relevant body lines) in
  the review, so the user can audit your interpretation without reopening the
  PR.
- Capture PR number, URL, title, base branch, head branch, and state.
- If there is no PR, or the body cannot be read, say so explicitly and infer
  intent from commit messages:
  `git log <base>..HEAD --format="%h %s%n%b"`.
- If neither a PR nor the commit messages state a clear purpose, ask the user to
  describe the branch's purpose before writing the review.

### 4. Compute the real diff

- Find the merge base: `git merge-base <base> HEAD`, and diff from there
  (`git diff <merge-base>..HEAD`, equivalently `git diff <base>...HEAD` with
  three dots). Do **not** use two-dot `git diff <base>..HEAD`: commits that
  landed on the default branch after this branch was cut would otherwise show up
  as spurious deletions, or their reverts as spurious additions, and get
  misattributed to the branch.
- Scope first: `git diff <merge-base>..HEAD --stat`.
- Then read each non-trivial file: `git diff <merge-base>..HEAD -- <path>`, with
  enough surrounding context to understand behavior. Open the full file when the
  hunk alone does not settle the question.
- Check whether the default branch has advanced:
  `git log <merge-base>..<base> --oneline`. If it has, note in the review that a
  rebase or merge is needed and whether the branch is missing anything relevant.
- Check uncommitted work separately with `git status --short`. Do not fold
  unrelated local changes into the branch review unless the user asks.
- Attribute changes to commits where useful:
  `git log <merge-base>..HEAD --oneline -- <path>`.
- Use exact file and line references for findings.

### 5. Classify each changed file

Assign every changed file a category. This is the mechanism that catches scope
creep, so do it for all files, not just the interesting ones.

| Category                               | Examples                                                                                               | Default verdict                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| New or updated tests                   | `*.test.*`, `*.spec.*`, `__tests__/**`, test helpers, test-only fixtures                               | Expected on any branch                                                                   |
| Test scaffolding                       | vitest/jest/playwright config, test scripts, test-only dev deps, setup files                           | Expected when tests are being added                                                      |
| Styling-only tweaks                    | changes confined to `className="..."`, `cn(...)`, CSS/token values                                     | Low risk, cosmetic                                                                       |
| Markup tag changes                     | `p` to `div`, `span` to `a`, with no logic change                                                      | Low risk, often fixes validity or semantics                                              |
| Pure abstraction refactor              | extract function/variable, rename, move import, split into wrapper plus inner, with no behavior change | Low risk                                                                                 |
| Docs/comments                          | markdown, JSDoc, inline comments                                                                       | Expected on docs branches                                                                |
| Dependency bump or advisory fix        | `package.json`, lockfiles, `audit-ci.jsonc`                                                            | Expected on dependency branches, **flag** elsewhere                                      |
| New feature, function, or behavior     | new code paths, new branches, new user-visible behavior, new public API                                | Expected on feature branches, **flag** on test-only/refactor/docs/dependency branches    |
| Bug fix or logic change                | altered conditionals, defaults, return values, error handling, ordering                                | Expected on bug-fix branches, **flag** otherwise                                         |
| Deletion of a feature, export, or file | removed exports, removed files, removed routes                                                         | Expected on cleanup branches, **flag** otherwise                                         |
| Config, infra, CI, generated artifacts | env handling, build config, workflows, migrations, generated output                                    | Read closely; **flag** anything with runtime or release impact not covered by the intent |

For the last five rows, read the hunks closely and do not be fooled by a
refactor-shaped wrapper that hides a behavior delta. The test for "pure
refactor" versus "behavior change": hold the before and after up to the same
runtime input, and ask whether anything observable differs, including what gets
called, in what order, with what arguments, returning what value, with what
timing or side effects. If yes on any axis, it is a behavior change.

When unsure whether something is low-risk refactor or behavior change, default
to flagging it and let the user adjudicate.

### 6. Classify branch intent and apply intent-specific expectations

Intent categories: feature/function change, bug fix, test-only, refactor,
tooling/dependency/chore, docs.

- **Feature, function, or new behavior:** expect unit, integration, or e2e tests
  covering the changed behavior in the same branch. Flag missing, shallow, or
  misplaced tests, and any new public API surface left untested, unless the PR
  description gives a convincing reason.
- **Bug fix:** expect a regression test that would have failed before the fix.
  Flag its absence.
- **Test-only:** the branch should contain only tests, test scaffolding, and any
  low-risk categories the user has authorized. Verify it does not change
  production logic, runtime configuration, public APIs, behaviorally meaningful
  fixtures or generated artifacts, or dependency versions in ways that alter
  behavior. Flag any logic or behavior change.
- **Refactor:** no observable behavior should change. Any altered conditional,
  default, or output is a flag unless the PR description explains it.
- **Dependency bump or chore:** no product logic should change.
- **Docs:** expect only markdown and comment changes.
- **All branch types:** flag changes outside the stated scope, even harmless
  ones, and say why they are out of scope.

When the user has given an explicit scope rule (for example "only Tailwind
classes and HTML tags may change"), honor that rule exactly. Anything outside it
is a flag, even if technically harmless.

### 7. Validate when practical

- Run the most relevant existing checks or tests for the changed area when
  feasible (lint, typecheck, the narrowest test target).
- Never invent test results. Keep observed failures separate from risks found by
  inspection.
- If tests were not run, explain why in the review file.

## Review Standards

Lead with findings, ordered by severity:

- **Critical:** data loss, security exposure, broken production workflows,
  irreversible migrations, release-blocking regressions.
- **High:** likely runtime failure, incorrect behavior, missing required
  coverage for important behavior, unsafe concurrency or state handling,
  incompatible API/schema changes.
- **Medium:** edge-case bugs, incomplete validation, maintainability issues with
  credible failure modes, tests that do not assert the intended behavior.
- **Low:** minor correctness risks, clarity issues that could cause future
  mistakes, small test gaps.

Each finding includes:

- Severity and a concise title.
- File and line reference where possible.
- What is wrong.
- Why it matters.
- A concrete suggested fix or verification step.

Avoid style-only comments unless they hide a real risk. If there are no
findings, say so plainly and still document residual risks, missing context, and
tests not run.

## Markdown Output

Always write the review to a markdown file in the repository root unless the
user gives another destination:

```text
code-review-<branch-name>.md
```

Sanitize the branch name by replacing slashes and whitespace with hyphens.

Use this structure:

```markdown
# Code Review: <branch-or-pr>

## Context

- Review target:
- Base branch:
- Merge base:
- Head:
- Comparison command:
- PR:
- Reviewer:
- Date:

## Stated Intent

<Verbatim PR title and the relevant body lines, or the commit-message summary if
no PR exists. Then one line: your reading of the intent category.>

## Review Scope

<The rule this review is judged against: the intent-derived default, plus any
exceptions the user explicitly authorized.>

## Verdict

<One or two sentences: whether the branch appears ready, and the main reason.
Then Pass or Fail against the scope rule, with a bulleted list of flagged items.>

## Findings

### <Severity>: <Title>

- Location:
- Issue:
- Impact:
- Recommendation:

## Files Changed

<Totals (files, insertions, deletions), then one line per file: path, lines
touched, category from the classification table, and Expected / Within scope /
FLAG.>

## Existing-Code Changes

<One subsection per changed existing file that matters: lines touched,
commit(s), what changed in behavior terms rather than syntax, and a verdict with
justification.>

## New Files

<Brief rundown; confirm each genuinely serves the stated intent.>

## Test Expectations

- Branch intent:
- Expected tests:
- Tests added or changed:
- Gaps:

## Unexpected Changes

- <Changes outside the stated intent, or "None found.">

## Validation

- Commands run:
- Results:
- Not run:

## Notes

- <Branch-behind-default and rebase status, dependency surprises, assumptions,
  unavailable context, follow-up questions.>

## Recommended Actions

- <Concrete next steps: split the PR, rebase, add a specific missing test, etc.>
```

If there are no findings, write `No blocking findings found.` under
`## Findings`.

## Final Response

After writing the file, tell the user in a few short sentences:

- The file path.
- Pass or fail against the scope rule, and the top one to three flags inline, so
  they know the outcome without opening the file.
- The comparison base used, and whether PR context was available.
- Which validation commands ran, or why they were not run.
