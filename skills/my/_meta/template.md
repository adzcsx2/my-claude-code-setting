# Template

## Purpose

Define the canonical authoring templates for `skills/my/`.

This file standardizes:

- frontmatter shape
- required sections
- file responsibilities
- package-specific defaults

Related contracts:

- `package-types.md`
- `context-budgets.md`
- `load-contract.md`
- `lifecycle.md`

---

## Global Authoring Rules

1. Every Skill lives in its own directory.
2. Every Skill MUST contain `SKILL.md`.
3. `SKILL.md` is the machine entry and must stay lean.
4. If a second execution layer exists, it SHOULD be `PLAYBOOK.md`.
5. `README.zh-CN.md` is optional and human-facing only.
6. Do not create `references/` or `examples/` until there is a clear need.

---

## Canonical Frontmatter

Use this as the baseline:

```yaml
---
name: <skill-slug>
description: >
  <Third-person WHAT + WHEN description with trigger terms.>
category: <universal|web|android|backend>
package_type: <atom|cookbook|capability|router>
load_strategy: progressive
context_tier: <tiny|small|medium>
lifecycle: candidate
quality_score: null
source: realtime
source_session: null
stack_hint: "<stack versions or platform hints>"
tags: []
default_read_next: null
optional_reads: []
---
```

---

## `SKILL.md` Template

Use this structure by default:

```markdown
---
name: <skill-slug>
description: >
  <Third-person WHAT + WHEN description with trigger terms.>
category: <category>
package_type: <type>
load_strategy: progressive
context_tier: <tier>
lifecycle: candidate
quality_score: null
source: realtime
source_session: null
stack_hint: "<stack hint>"
tags: []
default_read_next: null
optional_reads: []
---

# <Title>

## When to use

## When NOT to use

## Quick routing

## Read next
```

### Section Guidance

#### `When to use`

Must answer:

- what problem this package solves
- what user phrases or errors should trigger it

#### `When NOT to use`

Must exclude:

- nearby but different problems
- cases better handled by another package or ECC skill

#### `Quick routing`

May include:

- quick decision bullets
- exact conditions for choosing a sub-path

#### `Read next`

Must point to:

- `none` for single-file atoms
- `PLAYBOOK.md` for most multi-file packages
- exact reference file for routers when appropriate

---

## `PLAYBOOK.md` Template

Use only when a second layer is justified.

```markdown
# Playbook: <Title>

## Goal

## Decision path

## Steps

## Common mistakes

## Escalate to references when
```

### Guidance

- Keep the procedural flow here
- Do not re-copy long trigger text from `SKILL.md`
- Do not turn it into an API dump

---

## `references/*.md` Template

Use for fact-heavy material only.

```markdown
# <Reference Title>

## Use this file when

## Facts / Rules

## Edge cases

## Failure modes
```

Rules:

- each file should answer one focused need
- use exact filenames tied to tasks or failure modes
- never rely on directory-wide preloading

---

## `examples/*.md` Template

Use only when examples materially improve behavior.

```markdown
# <Example Set Title>

## Good example

## Bad example

## Notes
```

Rules:

- examples must teach patterns
- examples must not become hidden reference files

---

## `README.zh-CN.md` Template

Use only for complex or long-lived packages.

```markdown
# <技能名>

## 作用

## 目录结构

## 维护说明

## 最近变更
```

Rules:

- do not duplicate `SKILL.md`
- do not duplicate `PLAYBOOK.md`
- do not assume runtime loading

---

## Package-Specific Defaults

### atom

- required: `SKILL.md`
- recommended second file: `PLAYBOOK.md` only if needed
- `default_read_next`: `null` unless `PLAYBOOK.md` exists
- `optional_reads`: `[]`

### cookbook

- required: `SKILL.md`
- recommended: `PLAYBOOK.md`
- `default_read_next`: `PLAYBOOK.md`
- optional: `examples/`

### capability

- required: `SKILL.md`, `PLAYBOOK.md`
- `default_read_next`: `PLAYBOOK.md`
- optional: `references/`, `examples/`, `README.zh-CN.md`

### router

- required: `SKILL.md`
- optional: `references/`
- `default_read_next`: usually `null`

---

## Description Rules

The `description` field is critical for retrieval.

It must:

1. be in third person
2. include both WHAT and WHEN
3. include trigger terms
4. avoid vague wording

Good:

```yaml
description: >
  Diagnose React hydration mismatches and server/client render divergence.
  Use when the user mentions hydration warnings, text mismatch, SSR/client drift,
  or content differences between server and browser.
```

Bad:

```yaml
description: Helps with frontend bugs.
```

---

## Template Invariants

1. `SKILL.md` is always present.
2. `default_read_next` must match real structure.
3. `optional_reads` must list exact files only.
4. README must remain outside runtime load paths.
5. Template convenience must not override package-type rules.
