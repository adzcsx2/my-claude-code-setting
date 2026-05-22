---
description: Review the health of the my-skills system and surface stale, disputed, inbox, and quarantine items.
argument-hint: "[--stale | --disputed | --inbox | --quarantine | --all]"
---

# My Review

Review the current state of `my-skills` and surface items that need human attention.

## Goal

Produce a focused review of packages and queues that may need:

- verification
- demotion
- archival
- promotion
- cleanup

## Required Reads

- `~/.claude/skills/my/INDEX.json`
- `~/.claude/skills/my/ERROR-INDEX.json`
- `~/.claude/skills/my/_meta/lifecycle.md`
- `~/.claude/state/my-skills/` queues when present

## Review Areas

- stale packages
- disputed packages
- long-lived candidates
- archived or rejected packages showing up unexpectedly
- inbox/quarantine candidates waiting for action

## Procedure

1. Read lifecycle rules.
2. Summarize official package states from `INDEX.json`.
3. If runtime queues exist, inspect:
   - `inbox/`
   - `quarantine/`
4. Group findings by action:
   - review now
   - safe to defer
   - archive/remove candidate

## Do Not

- Do not promote automatically
- Do not mutate lifecycle or indexes unless the user asks

## Output Format

```markdown
# My Review

## Summary
<short summary>

## Needs Attention
- `<slug or queue item>` — <reason>

## Safe to Defer
- `<slug or queue item>` — <reason>
```
