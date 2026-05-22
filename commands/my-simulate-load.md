---
description: Simulate staged my-skills loading for a prompt and show which files would be read.
argument-hint: "[prompt text]"
---

# My Simulate Load

Simulate the `my-skills` staged retrieval/load pipeline without modifying any files.

## Goal

Given a prompt, show:

- Stage 0 candidates
- Stage 1 selected package
- Stage 2 core file
- Stage 3 optional follow-up file, if justified
- where loading stops

## Required Reads

- `~/.claude/skills/my/INDEX.json`
- `~/.claude/skills/my/ERROR-INDEX.json`
- selected package `SKILL.md`
- selected package `default_read_next` only if needed
- one exact `reference` or `examples` file only if justified

## Procedure

1. Run Stage 0 retrieval from machine indexes only.
2. Pick the best candidate from Stage 1 after reading candidate `SKILL.md` files.
3. If `default_read_next` is non-null, read it as Stage 2.
4. Only if Stage 2 reveals a concrete missing piece, read one exact Stage 3 file.
5. Stop expansion and report the stop reason.

## Do Not

- Do not preload all references
- Do not read README
- Do not expand more than one package
- Do not write files

## Output Format

```markdown
# My Simulate Load

## Prompt
<input>

## Stage 0
- `<slug>` — <reason>

## Stage 1
- selected: `<slug>` | no confident match

## Stage 2
- file: `<path or none>`

## Stage 3
- file: `<path or none>`

## Stop Reason
<reason>
```
