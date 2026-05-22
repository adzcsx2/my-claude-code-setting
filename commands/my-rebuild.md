---
description: Rebuild human and machine indexes for skills/my from official package metadata.
argument-hint: "[--dry-run]"
---

# My Rebuild

Rebuild the official `my-skills` indexes from package metadata on disk.

## Goal

Make the indexes consistent with the official package set under `skills/my/`.

## Required Reads

- `~/.claude/skills/my/**/SKILL.md`
- `~/.claude/skills/my/_meta/template.md`
- `~/.claude/skills/my/_meta/lifecycle.md`

## Outputs

- `~/.claude/skills/my/INDEX.md`
- `~/.claude/skills/my/ERROR-INDEX.md`
- `~/.claude/skills/my/INDEX.json`
- `~/.claude/skills/my/ERROR-INDEX.json`

## Procedure

1. Scan official package directories only.
2. Exclude:
   - `_meta/`
   - `_reports/`
   - `_archive/` from normal active retrieval output
3. Parse frontmatter and package paths.
4. Rebuild the four index files mechanically.
5. Report what changed.

## Invariants

- Do not patch indexes incrementally
- Do not read runtime queue items as official packages
- Do not include README in index generation

## Dry Run

If `--dry-run` is supplied:

- compute changes
- report diffs
- do not write files

## Output Format

```markdown
# My Rebuild

## Summary
<what would change or changed>

## Updated Files
- `INDEX.md`
- `ERROR-INDEX.md`
- `INDEX.json`
- `ERROR-INDEX.json`
```
