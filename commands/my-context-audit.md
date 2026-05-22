---
description: Audit package size, load depth, and structure problems across my-skills.
argument-hint: "[--brief | --detailed]"
---

# My Context Audit

Audit whether `skills/my/` still obeys the context and loading contracts.

## Goal

Find packages that are becoming too expensive or structurally messy before they
degrade retrieval quality and context efficiency.

## Required Reads

- `~/.claude/skills/my/INDEX.json`
- `~/.claude/skills/my/_meta/context-budgets.md`
- `~/.claude/skills/my/_meta/load-contract.md`
- `~/.claude/skills/my/_meta/skill-lint-rules.md`
- relevant package files only as needed

## What to Check

- oversized `SKILL.md`
- oversized `PLAYBOOK.md`
- unnecessary `references/`
- README duplication
- packages whose normal path is too deep
- sibling atoms that should become a cookbook

## Procedure

1. Use `INDEX.json` as the official package set.
2. Inspect package structure against `_meta` contracts.
3. Report:
   - blocking issues
   - warnings
   - consolidation candidates

## Do Not

- Do not mutate package files
- Do not auto-convert structures

## Output Format

```markdown
# My Context Audit

## Blocking
- `<slug>` — <reason>

## Warnings
- `<slug>` — <reason>

## Consolidation Candidates
- `<slug or group>` — <reason>
```
