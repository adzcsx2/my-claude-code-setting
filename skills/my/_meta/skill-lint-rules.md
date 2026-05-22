# Skill Lint Rules

## Purpose

Define the structural and content lint rules for `skills/my/`.

These rules are used by:

- `/my-lint-skill`
- `/my-context-audit`
- manual package review

Related contracts:

- `template.md`
- `package-types.md`
- `context-budgets.md`
- `load-contract.md`
- `lifecycle.md`

---

## Severity Levels

- `error` — must be fixed before promotion
- `warn` — should be fixed or consciously accepted
- `info` — useful cleanup suggestion

---

## Rule Set

### LINT-001: Missing `SKILL.md`

- severity: `error`
- condition: package directory has no `SKILL.md`
- fix: create `SKILL.md` or delete invalid package directory

### LINT-002: Invalid `package_type`

- severity: `error`
- condition: `package_type` missing or outside `atom|cookbook|capability|router`
- fix: assign one valid type

### LINT-003: `default_read_next` does not exist

- severity: `error`
- condition: `default_read_next` points to a missing file
- fix: create the file or set `default_read_next: null`

### LINT-004: Single-file atom with non-empty `optional_reads`

- severity: `warn`
- condition: `package_type: atom`, `default_read_next: null`, but `optional_reads` is non-empty
- fix: either add a justified second layer or clear `optional_reads`

### LINT-005: `references/` exists without clear need

- severity: `warn`
- condition: `references/` exists but files duplicate `PLAYBOOK.md` or `SKILL.md`
- fix: merge duplicate content or split by focused fact need

### LINT-006: `README.zh-CN.md` duplicates runtime docs

- severity: `warn`
- condition: human README materially repeats `SKILL.md` or `PLAYBOOK.md`
- fix: reduce README to human navigation and maintenance info

### LINT-007: `SKILL.md` too large

- severity: `error`
- condition: `SKILL.md` exceeds hard limit from `context-budgets.md`
- fix: move procedures to `PLAYBOOK.md`, facts to `references/`, examples to `examples/`

### LINT-008: `PLAYBOOK.md` too large

- severity: `error`
- condition: `PLAYBOOK.md` exceeds hard limit
- fix: split by decision path or move facts to `references/`

### LINT-009: Reference file too large

- severity: `warn`
- condition: any `references/*.md` exceeds warning threshold
- severity escalates to `error` at hard limit
- fix: split by task, edge case, or evidence type

### LINT-010: Deep runtime path

- severity: `warn`
- condition: normal execution would require more than:
  - Stage 0 machine index
  - Stage 1 `SKILL.md`
  - Stage 2 one core file
  - Stage 3 one exact follow-up file
- fix: simplify load path

### LINT-011: Router behaving like capability

- severity: `warn`
- condition: `package_type: router` but `SKILL.md` contains heavy inline procedures
- fix: convert to `capability` or thin the entry file

### LINT-012: Capability missing `PLAYBOOK.md`

- severity: `error`
- condition: `package_type: capability` without `PLAYBOOK.md`
- fix: create a core playbook layer

### LINT-013: Lifecycle invalid

- severity: `error`
- condition: `lifecycle` missing or outside allowed values
- fix: align to `lifecycle.md`

### LINT-014: README in runtime load path

- severity: `error`
- condition: runtime contract or command logic would read README automatically
- fix: remove README from auto-load chain

### LINT-015: Directory-wide reference preload

- severity: `error`
- condition: package design assumes reading all of `references/` or `examples/`
- fix: route to exact files only

### LINT-016: Overlapping sibling atoms

- severity: `info`
- condition: 3+ sibling atoms share narrow topic/tags and should probably become a cookbook
- fix: review cookbook promotion

### LINT-017: Rejected or archived package still rankable

- severity: `error`
- condition: package metadata or index allows `archived` or `rejected` items into normal retrieval
- fix: correct index generation or retrieval filters

### LINT-018: Backfill package missing label

- severity: `error`
- condition: historical package lacks `source: backfill` or `backfill` tag/policy alignment
- fix: correct metadata before promotion

### LINT-019: Missing `When NOT to use`

- severity: `warn`
- condition: `SKILL.md` has no clear exclusion guidance
- fix: add neighboring non-trigger cases

### LINT-020: Description too vague

- severity: `error`
- condition: `description` lacks specific WHAT + WHEN trigger language
- fix: rewrite description for retrieval precision

---

## Promotion Gate Minimum

A package should not be promoted if any of these fire:

- `LINT-001`
- `LINT-002`
- `LINT-003`
- `LINT-007`
- `LINT-008`
- `LINT-012`
- `LINT-013`
- `LINT-014`
- `LINT-015`
- `LINT-017`
- `LINT-018`
- `LINT-020`

Warnings may still allow promotion if explicitly accepted.

---

## Context Audit Focus

`/my-context-audit` should emphasize:

1. oversized entry files
2. packages with unnecessary second/third layers
3. README duplication
4. heavy normal-path load chains
5. sibling overlap suggesting cookbook consolidation

---

## Invariants

1. The linter enforces contracts; it does not invent new package structure.
2. Runtime safety beats author convenience.
3. Package size problems should be solved by restructuring, not by raising limits first.
