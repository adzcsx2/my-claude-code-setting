---
description: Search official my-skills packages by keyword, error fingerprint, or slug.
argument-hint: "[keyword | error phrase | slug] [--include-ecc]"
---

# My Find

Search `skills/my/` for relevant packages without expanding full package contents by default.

## Goal

Given a keyword, phrase, error fragment, or slug-like input, find the most relevant
personal Skill packages from the current indexes.

## Required Reads

- `~/.claude/skills/my/INDEX.json`
- `~/.claude/skills/my/ERROR-INDEX.json`
- `~/.claude/skills/my/INDEX.md` only for human-readable fallback presentation

## Procedure

1. Normalize the input.
2. If it looks like an error phrase, consult `ERROR-INDEX.json` first.
3. Otherwise search `INDEX.json` by:
   - slug
   - trigger terms
   - description
4. Return ranked `my/` matches.
5. Only include `ecc` if `--include-ecc` is explicitly requested or if stated as a fallback.

## Do Not

- Do not read every package body
- Do not read README files
- Do not mutate any index

## Output Format

```markdown
# My Find

## Query
<input>

## Matches
1. `<slug>` — <summary>
2. `<slug>` — <summary>

## Notes
- <optional fallback note>
```
