#!/usr/bin/env bash
# PreToolUse hook: enforce "rebase onto origin/develop before pushing / opening a PR".
# Fires on `git push` Bash calls and on mcp__github__create_pull_request.
#
# - Already up to date with origin/develop -> allow, no change.
# - Behind, working tree clean, rebase succeeds cleanly:
#     - branch doesn't exist on the remote yet -> allow, the plain push
#       (fast-forward, new branch) still works as typed.
#     - branch already exists on the remote -> the rebase rewrote local
#       history, so the push as typed would be rejected as non-fast-forward.
#       We do NOT auto-rewrite the command to force-push (that's a
#       history-rewriting, hard-to-reverse action and needs a human to see
#       it happening) -- block with instructions to re-run with
#       --force-with-lease, matching the project's documented convention in
#       CLAUDE.md.
# - Rebase conflicts -> abort the rebase, block with instructions.
#
# Exit 0 = allow. Exit 2 = block, message on stdout (JSON) + stderr.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

DEFAULT_BRANCH="develop"
PROTECTED_BRANCHES=("main" "develop")

payload=$(cat)

block() {
  local reason="$1"
  printf '%s\n' "$reason" >&2
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": $(printf '%s' "$reason" | jq -Rs .)
  }
}
JSON
  exit 2
}

# Not a git repo (shouldn't happen here) -> nothing to enforce.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0

for protected in "${PROTECTED_BRANCHES[@]}"; do
  if [ "$current_branch" = "$protected" ]; then
    # Pushing main/develop directly isn't a PR-prep push (and bash-guard.py
    # already blocks it); nothing for this hook to rebase onto.
    exit 0
  fi
done

# Best-effort fetch. If the network/remote is unavailable, don't block the push
# on something we can't verify.
if ! git fetch origin "$DEFAULT_BRANCH" --quiet 2>/tmp/pre-push-rebase-fetch.log; then
  echo "pre-push-rebase: could not fetch origin/$DEFAULT_BRANCH, skipping rebase check" >&2
  exit 0
fi

origin_head=$(git rev-parse "origin/$DEFAULT_BRANCH" 2>/dev/null) || exit 0
merge_base=$(git merge-base HEAD "origin/$DEFAULT_BRANCH" 2>/dev/null) || exit 0

if [ "$merge_base" = "$origin_head" ]; then
  # Already contains the latest origin/develop -> already rebased/up to date.
  exit 0
fi

# Don't attempt a rebase on top of uncommitted local changes; that's not this
# hook's job and could clobber work-in-progress. Let the push proceed as-is.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "pre-push-rebase: working tree has uncommitted changes, skipping auto-rebase" >&2
  exit 0
fi

git fetch origin "$current_branch" --quiet 2>/dev/null
had_remote_branch=0
git rev-parse --verify -q "origin/$current_branch" >/dev/null 2>&1 && had_remote_branch=1

if ! git rebase "origin/$DEFAULT_BRANCH" >/tmp/pre-push-rebase-rebase.log 2>&1; then
  git rebase --abort >/dev/null 2>&1
  block "Rebase onto origin/$DEFAULT_BRANCH failed with conflicts. Resolve them manually: git fetch origin $DEFAULT_BRANCH && git rebase origin/$DEFAULT_BRANCH, fix conflicts, git add <files>, git rebase --continue, then git push --force-with-lease and open the PR."
fi

echo "pre-push-rebase: rebased $current_branch onto origin/$DEFAULT_BRANCH" >&2

# History was rewritten by the rebase. If this branch already existed on the
# remote, the push as typed is now a non-fast-forward push and will be
# rejected -- block and ask for an explicit --force-with-lease push instead
# of silently rewriting the command (force-pushing rewrites shared history
# and should happen with a human seeing it happen).
tool_name=$(printf '%s' "$payload" | jq -r '.tool_name // empty')
if [ "$tool_name" = "Bash" ] && [ "$had_remote_branch" = "1" ]; then
  command=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
  case "$command" in
    *--force-with-lease*|*--force*|*" -f"*|*" -f")
      # Already forcing; let it through.
      ;;
    *)
      block "Rebased $current_branch onto origin/$DEFAULT_BRANCH, which rewrote local history. The remote branch already has the old history, so this push would be rejected as non-fast-forward. Re-run with: git push --force-with-lease origin $current_branch"
      ;;
  esac
fi

exit 0
