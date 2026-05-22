---
description: Show current health summary for the my-skills system.
argument-hint: "[--brief | --detailed]"
---

# My Health

Summarize the current health of `my-skills`.

## Goal

Provide a low-noise snapshot of:

- official package count and lifecycle mix
- presence of runtime queues
- index freshness
- notable risk signals

## Required Reads

- `~/.claude/skills/my/INDEX.json`
- `~/.claude/skills/my/ERROR-INDEX.json`
- `~/.claude/state/my-skills/` when present

## Suggested Health Checks

- total official packages
- count by lifecycle
- count by source (`realtime` vs `backfill`)
- whether runtime queues exist and how large they are
- whether machine indexes exist and look parseable

## Procedure

1. Read machine indexes.
2. Summarize official package health.
3. If runtime state exists, summarize queue sizes.
4. Report warnings only when actionable.

## Output Format

```markdown
# My Health

## Summary
- packages: <n>
- by lifecycle: <summary>
- queues: <summary>

## Warnings
- <if any>
```
