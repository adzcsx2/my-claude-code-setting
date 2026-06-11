#!/bin/bash
# Block git commit messages containing Co-Authored-By
# Reads PreToolUse event JSON from stdin

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Only inspect git commit commands
if ! echo "$COMMAND" | grep -qE '^\s*git\s+commit'; then
  exit 0
fi

# Check for Co-Authored-By in the message (via -m flag or HEREDOC/FILE)
if echo "$COMMAND" | grep -q 'Co-Authored-By'; then
  jq -n --arg cmd "$COMMAND" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "禁止提交包含 Co-Authored-By 的 commit message。请移除后重试。"
    }
  }'
  exit 0
fi

exit 0
