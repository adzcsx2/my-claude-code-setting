---
description: Promote a reviewed candidate from inbox or quarantine into the official my-skills package set.
argument-hint: "[candidate id | path] [--dry-run]"
---

# My Promote

Promote a candidate package into the official `skills/my/` set only after validation.

## Goal

Move a candidate from runtime review queues into the official package tree safely.

## Required Reads

- `~/.claude/state/my-skills/inbox/` or `quarantine/`
- `~/.claude/skills/my/_meta/criteria.md`
- `~/.claude/skills/my/_meta/template.md`
- `~/.claude/skills/my/_meta/lifecycle.md`
- `~/.claude/skills/my/_meta/skill-lint-rules.md`

## Validation Requirements

Before promotion, verify:

1. package passes admission criteria
2. frontmatter is valid
3. package structure matches `package_type`
4. no blocking lint errors remain
5. sensitive content is not leaking

## Procedure

1. Resolve the candidate in `inbox/` or `quarantine/`.
2. Validate structure and metadata.
3. Choose official target path under `skills/my/<category>/`.
4. Promote with lifecycle set appropriately.
5. Rebuild indexes after promotion.
6. Emit a manifest entry for undo.

## Runtime Helper

When you want a deterministic promote path, use:

```bash
node ~/.claude/scripts/my-skills/promote.js "<candidate path or id>" --dry-run
```

Apply the promotion after review:

```bash
node ~/.claude/scripts/my-skills/promote.js "<candidate path or id>"
```

Use `--allow-quarantine` only when you have explicitly reviewed a quarantined draft.

## Dry Run

If `--dry-run` is supplied:

- show target path
- show expected lifecycle
- show index impact
- do not write files

## Do Not

- Do not promote automatically from queues without explicit intent
- Do not skip lint and lifecycle checks

## Output Format

```markdown
# My Promote

## Candidate
<id or path>

## Validation
- <pass/fail checks>

## Target
`<official package path>`

## Result
<promoted or dry-run summary>
```
