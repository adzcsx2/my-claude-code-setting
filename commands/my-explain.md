---
description: Explain why a my-skills package matches and what it would load next.
argument-hint: "[skill slug]"
---

# My Explain

Explain one package's retrieval intent and staged load behavior.

## Goal

Given a `skills/my/` slug, explain:

- what it is for
- when it should match
- when it should not match
- what file would load next

## Inputs

- package slug, for example: `universal/skill-description-self-test`

## Required Reads

- package `SKILL.md`
- package `PLAYBOOK.md` only if `default_read_next` points to it and explanation needs it

## Procedure

1. Resolve the slug to its directory under `~/.claude/skills/my/`.
2. Read `SKILL.md`.
3. Summarize:
   - description intent
   - `When to use`
   - `When NOT to use`
   - package type
   - lifecycle
   - `default_read_next`
4. If useful, mention which `optional_reads` exist.

## Do Not

- Do not scan unrelated packages
- Do not read README files
- Do not write files

## Output Format

```markdown
# My Explain

## Package
`<slug>`

## Match Intent
<summary>

## Exclusions
<summary>

## Load Path
- Stage 1: `SKILL.md`
- Stage 2: `<default_read_next or none>`
- Stage 3: <optional exact files if any>
```
