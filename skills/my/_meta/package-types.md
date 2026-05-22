# Package Types

## Purpose

Define the allowed `package_type` values for `skills/my/`, their intended use,
their default file structure, and their upgrade/downgrade rules.

This file is the source of truth for:

- which package shape a Skill may use
- when a Skill should stay minimal
- when a Skill must be upgraded to multi-file form
- what `default_read_next` is allowed to point to

Related contracts:

- `context-budgets.md`
- `load-contract.md`
- `template.md`

---

## Global Rules

1. Every Skill MUST declare exactly one `package_type`.
2. Do not pick a package type based on aesthetics. Pick it based on:
   - retrieval precision
   - loading cost
   - maintenance cost
3. Default to the smallest type that can express the knowledge correctly.
4. Do not add `README.zh-CN.md`, `references/`, or `examples/` by default.
5. If a Skill has a second execution layer, it SHOULD be `PLAYBOOK.md`.
6. `README.zh-CN.md` is human-facing only and MUST NOT participate in auto-load.

---

## Type: atom

### Use For

- one bug pattern
- one root cause
- one high-value fix
- one tightly scoped debugging playbook

### Default Shape

Minimal form:

```text
<skill-slug>/
└── SKILL.md
```

Expanded form:

```text
<skill-slug>/
├── SKILL.md
└── PLAYBOOK.md
```

### Required Characteristics

- narrow trigger conditions
- low ambiguity
- low context cost
- one main idea only

### `default_read_next`

- `null` for single-file atoms
- `PLAYBOOK.md` only when a second layer is truly needed

### Upgrade Triggers

Upgrade `atom -> cookbook` when:

- 3 or more sibling atoms share the same topic and tags
- the same fix pattern appears with multiple variants
- the directory would otherwise accumulate many tiny skills

Upgrade `atom -> capability` when:

- the knowledge depends on a larger system or tool surface
- reference facts become necessary
- one fix is no longer enough to solve the category

### Anti-Patterns

- a 200-line "atom" containing many unrelated subcases
- adding `references/` without `PLAYBOOK.md`
- adding `README.zh-CN.md` just to restate the same content

---

## Type: cookbook

### Use For

- several closely related small cases
- one topic with multiple recurring variants
- replacing many tiny atoms with one organized package

### Default Shape

```text
<skill-slug>/
├── SKILL.md
└── PLAYBOOK.md
```

Optional:

```text
<skill-slug>/
├── SKILL.md
├── PLAYBOOK.md
└── examples/
```

### Required Characteristics

- one topic, multiple cases
- strong internal coherence
- should reduce retrieval noise, not increase it

### `default_read_next`

- SHOULD be `PLAYBOOK.md`

### Internal Organization

Preferred organization inside `PLAYBOOK.md`:

- shared symptoms
- routing hints
- `Case A / Case B / Case C`
- common mistakes
- escalation rules

### Upgrade Triggers

Upgrade `cookbook -> capability` when:

- the topic now depends on system docs, APIs, or command references
- the package needs a fact layer (`references/`)
- case volume stops being the main complexity driver

Downgrade `cookbook -> atom` when:

- only one case remains relevant
- other cases were archived or moved

### Anti-Patterns

- cookbook used as a dumping ground for unrelated bugs
- 20 tiny cases with no routing hints
- examples used as hidden reference docs

---

## Type: capability

### Use For

- a complex CLI or SDK
- an internal platform
- a multi-step operational workflow
- any capability that needs a stable core playbook plus facts

### Default Shape

```text
<skill-slug>/
├── SKILL.md
├── PLAYBOOK.md
└── references/
```

Optional:

```text
<skill-slug>/
├── SKILL.md
├── PLAYBOOK.md
├── references/
├── examples/
└── README.zh-CN.md
```

### Required Characteristics

- machine entry is thin
- core execution lives in `PLAYBOOK.md`
- factual detail lives in `references/`
- examples are optional and only for output-sensitive skills

### `default_read_next`

- SHOULD be `PLAYBOOK.md`

### Reference Layer Rules

1. `references/` MUST contain task-oriented filenames.
2. `references/` MUST be read by exact path, never as a whole directory preload.
3. If all relevant facts fit into `PLAYBOOK.md`, do not create `references/`.

### Human README Rules

Add `README.zh-CN.md` only when at least one of these is true:

- the package will be maintained manually over time
- the package is large enough that a human overview is helpful
- there is onboarding value for future-you

### Anti-Patterns

- capability with a fat `SKILL.md` and no real `PLAYBOOK.md`
- reference files that duplicate the playbook
- README used as runtime documentation

---

## Type: router

### Use For

- topic routing
- standards library entrypoints
- themed reference hubs
- broad domains where subtopics should be chosen deliberately

### Default Shape

```text
<skill-slug>/
├── SKILL.md
└── references/
```

Optional:

```text
<skill-slug>/
├── SKILL.md
├── references/
└── README.zh-CN.md
```

### Required Characteristics

- should not try to solve the whole topic inline
- should route to the right subtopic quickly
- should minimize accidental broad loads

### `default_read_next`

- SHOULD usually be `null`
- routing should point to exact sub-files from `SKILL.md`

### Anti-Patterns

- router that secretly behaves like a capability package
- router with no routing logic, only a long list of links
- router with a giant overview file that gets auto-loaded

---

## Decision Matrix

Choose the type by answering these questions in order:

1. Is this one fixable problem with one main idea?
   - Yes -> `atom`
2. Is it one topic with several closely related recurring cases?
   - Yes -> `cookbook`
3. Does it describe a real system/tool/workflow with stable steps and facts?
   - Yes -> `capability`
4. Is its main job to route into subtopics rather than execute directly?
   - Yes -> `router`

If more than one seems true, prefer the smaller type first.

---

## Allowed Files by Type

### atom

- required: `SKILL.md`
- allowed: `PLAYBOOK.md`
- avoid by default: `references/`, `examples/`, `README.zh-CN.md`

### cookbook

- required: `SKILL.md`
- recommended: `PLAYBOOK.md`
- optional: `examples/`
- avoid by default: `README.zh-CN.md`

### capability

- required: `SKILL.md`, `PLAYBOOK.md`
- optional: `references/`, `examples/`, `README.zh-CN.md`

### router

- required: `SKILL.md`
- recommended: `references/`
- optional: `README.zh-CN.md`
- avoid by default: `PLAYBOOK.md` unless the router also contains a thin shared procedure

---

## Migration Rules

### Promote Structure

Move upward only when one of these becomes true:

- entry file keeps growing
- retrieval precision drops
- too many sibling skills overlap
- reference facts are now required

### Simplify Structure

Move downward when:

- the second layer is rarely used
- reference material became obsolete
- several files now repeat the same content

### Invariant

A more complex package is not automatically a better package.
The best package is the smallest one that keeps retrieval precise and loading cheap.
