---
description: Lint one my-skills package against package, lifecycle, and context contracts.
argument-hint: "[skill slug]"
---

# My Lint Skill

Lint one official `skills/my/` package against the current contracts.

## Goal

Check whether a package is structurally valid and promotion-safe.

## Required Reads

- target package files
- `~/.claude/skills/my/_meta/template.md`
- `~/.claude/skills/my/_meta/package-types.md`
- `~/.claude/skills/my/_meta/lifecycle.md`
- `~/.claude/skills/my/_meta/context-budgets.md`
- `~/.claude/skills/my/_meta/skill-lint-rules.md`

## Procedure

1. Resolve the package slug under `skills/my/`.
2. Check frontmatter validity.
3. Check package shape against `package_type`.
4. Check runtime path depth against load contract.
5. Check file sizes against context budgets.
6. Report errors, warnings, and infos by lint rule id.

## Do Not

- Do not mutate the package
- Do not promote or demote automatically

## Output Format

```markdown
# My Lint Skill

## Package
`<slug>`

## Errors
- `LINT-###` — <reason>

## Warnings
- `LINT-###` — <reason>

## Infos
- `LINT-###` — <reason>
```
