---
description: Test my-skills retrieval candidates against a prompt without writing files.
argument-hint: "[prompt text]"
---

# My Test

Test retrieval only. Do not write or modify any files.

## Goal

Given a prompt, simulate Stage 0 retrieval and return the most relevant `skills/my/`
packages with short reasons.

## Inputs

- Free-form prompt text

## Required Reads

- `~/.claude/skills/my/INDEX.json`
- `~/.claude/skills/my/ERROR-INDEX.json`

## Procedure

1. Normalize the input prompt.
2. Match against `ERROR-INDEX.json` first when error-like phrases are present.
3. Match against `INDEX.json` trigger terms and descriptions.
4. Rank `my/` candidates only.
5. Return top matches with:
   - slug
   - why it matched
   - lifecycle
   - source warning if `source: backfill`

## Do Not

- Do not read package bodies
- Do not read README files
- Do not mutate indexes
- Do not call subagents by default

## Output Format

```markdown
# My Test

## Prompt
<input>

## Top Matches
1. `<slug>` — <reason>
2. `<slug>` — <reason>

## Notes
- <optional note>
```
