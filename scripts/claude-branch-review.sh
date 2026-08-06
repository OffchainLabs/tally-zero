#!/usr/bin/env sh
#
# Runs the `pre-push-review-branch` Claude Code skill against the current
# branch. Wired into .husky/pre-push, and runnable by hand via
# `pnpm review:branch`.
#
# Advisory by design: this script always exits 0 so a review verdict, an API
# hiccup, or a missing Claude Code install can never block a push.
#
# Escape hatches:
#   SKIP_CLAUDE_REVIEW=1 git push    skip the review for one push
#   git push --no-verify             skip every hook
#
# ---------------------------------------------------------------------------
# Threat model
# ---------------------------------------------------------------------------
# This agent reads attacker-influenceable input: branch diffs and, via
# `gh pr view`, pull request titles and bodies that anyone can author. Treat
# everything it reads as hostile text that may try to redirect it. The
# containment is the capability set below, not the skill's good intentions.
#
#   --setting-sources ""  Do NOT remove. Without it the run inherits
#                         .claude/settings.local.json, whose allowlist grants
#                         curl, python3, npm run, gh api and more. CLI
#                         --allowedTools ADDS to settings, it does not replace
#                         them, so omitting this silently grants code execution.
#   --strict-mcp-config   No --mcp-config is passed, so this loads zero MCP
#                         servers. Otherwise the repo's .mcp.json (playwright)
#                         would give the agent a browser and network egress.
#   no Write/Edit         The review is captured from stdout by this script.
#                         Granting Write would let injected instructions reach
#                         ~/.zshrc, .git/hooks/*, or this file itself.
#   no npx/test runners   `npx vitest`/`eslint` execute JS from the working
#                         tree, which is exactly the code under review. The
#                         pre-commit hook already runs the test suite.
#   no git fetch          `git fetch --upload-pack=<cmd>` executes commands, so
#                         this script performs the fetch itself, below.
#
# Residual risk, accepted knowingly: the allowed git subcommands are read
# oriented but not airtight (`git diff --output=<path>` can write a file). A
# hard boundary needs a sandbox or CI, not a local hook. See
# plans/plan-claude-skill-git-hook.md.

set -u

log() {
  printf '\033[2m[claude-review]\033[0m %s\n' "$1" >&2
}

if [ "${SKIP_CLAUDE_REVIEW:-}" = "1" ]; then
  log "SKIP_CLAUDE_REVIEW=1 is set, skipping branch review."
  exit 0
fi

if ! command -v claude >/dev/null 2>&1; then
  log "Claude Code CLI not found, skipping branch review."
  log "Optional install: https://docs.claude.com/en/docs/claude-code/setup"
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)
DEFAULT_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
[ -n "$DEFAULT_BRANCH" ] || DEFAULT_BRANCH=main

if [ "$BRANCH" = "HEAD" ]; then
  log "Detached HEAD, nothing to review. Skipping."
  exit 0
fi

if [ "$BRANCH" = "$DEFAULT_BRANCH" ]; then
  log "On the default branch ($DEFAULT_BRANCH), nothing to review against. Skipping."
  exit 0
fi

# Fetch here rather than granting the agent `git fetch`.
git fetch --quiet origin "$DEFAULT_BRANCH" 2>/dev/null ||
  log "Could not fetch origin/$DEFAULT_BRANCH, reviewing against the local ref."

# Read-only allowlist, enumerated rather than Bash(git:*), which would also
# permit push, reset and checkout -f in an unattended hook.
ALLOWED_TOOLS="Read,Grep,Glob,\
Bash(git diff:*),Bash(git log:*),Bash(git status:*),Bash(git show:*),\
Bash(git rev-parse:*),Bash(git merge-base:*),Bash(git symbolic-ref:*),\
Bash(git branch:*),Bash(git remote:*),\
Bash(gh pr view:*),Bash(gh pr list:*)"

OUT_FILE="code-review-$(printf '%s' "$BRANCH" | tr '/[:space:]' '--').md"

# macOS ships neither timeout nor gtimeout, so the wrapper is applied only when
# one is available. Without it the review runs unbounded.
TIMEOUT_CMD=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout 900"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout 900"
fi

log "Reviewing '$BRANCH' against '$DEFAULT_BRANCH'. This takes a few minutes."
log "Skip with: SKIP_CLAUDE_REVIEW=1 git push"

# shellcheck disable=SC2086
$TIMEOUT_CMD claude -p \
  "/pre-push-review-branch You have no file-writing tools in this run. Print the complete review markdown to stdout instead of writing it to a file." \
  --allowedTools "$ALLOWED_TOOLS" \
  --setting-sources "" \
  --strict-mcp-config \
  >"$OUT_FILE"
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  log "Review did not complete (exit $STATUS). Continuing with the push anyway."
  exit 0
fi

log "Review written to $OUT_FILE"
grep -iE '^\s*(##\s*Verdict|Pass|Fail)' "$OUT_FILE" | head -5 >&2

exit 0
