#!/bin/bash
# Block dangerous git operations: remote branch deletion and force push
# Reads PreToolUse event JSON from stdin

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Only inspect git push commands
if ! echo "$COMMAND" | grep -qE '^\s*git\s+push'; then
  exit 0
fi

DANGER_REASON=""

# Check for remote branch deletion
# git push origin --delete <branch>
# git push origin -d <branch>
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(--delete|-d)\b'; then
  DANGER_REASON="删除远程分支"
fi

# Check for force push (including --force-with-lease)
# git push --force / git push -f / git push --force-with-lease
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(--force|-f|--force-with-lease)\b'; then
  DANGER_REASON="强制推送 (force push)"
fi

# Check for delete remote branch using :branch syntax
# git push origin :branch
if echo "$COMMAND" | grep -qE 'git\s+push\s+\S+\s+:[^/\s]'; then
  DANGER_REASON="删除远程分支 (:branch 语法)"
fi

if [ -n "$DANGER_REASON" ]; then
  jq -n --arg reason "$DANGER_REASON" --arg cmd "$COMMAND" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "禁止操作: \($reason)。请用户手动执行: \($cmd)"
    }
  }'
  exit 0
fi

exit 0
