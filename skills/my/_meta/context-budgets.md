# Context Budgets

## Purpose

Define the context budget rules for `skills/my/`.

These budgets exist to keep the system useful when the number of Skills grows.
They apply to:

- authoring
- retrieval
- loading
- review
- refactoring

If a Skill becomes more expensive to load than its value justifies, it must be
restructured.

Related contracts:

- `package-types.md`
- `load-contract.md`
- `skill-lint-rules.md`

---

## Global Principles

1. Retrieval must be cheaper than execution.
2. Entry files must be cheaper than core playbooks.
3. Reference files must be cheaper than reading the whole package.
4. Human docs do not belong in the runtime load path.
5. If the same result can be achieved with fewer loaded files, prefer the cheaper path.

---

## Budget Tiers

`context_tier` expresses the expected cost of loading the package entry.

### `tiny`

Use for:

- single-file atoms
- narrow, high-precision skills

Expected shape:

- `SKILL.md` only, or
- `SKILL.md` with very small optional follow-up

Recommended size:

- `SKILL.md`: 40-120 lines

### `small`

Use for:

- atom with `PLAYBOOK.md`
- normal cookbook
- lightweight capability entry

Expected shape:

- thin `SKILL.md`
- one standard `PLAYBOOK.md`

Recommended size:

- `SKILL.md`: 80-180 lines
- `PLAYBOOK.md`: 80-220 lines

### `medium`

Use for:

- capability packages
- router packages with meaningful subtopic routing

Expected shape:

- `SKILL.md`
- `PLAYBOOK.md` or `references/`
- at most one extra read in the normal path

Recommended size:

- `SKILL.md`: 100-220 lines
- `PLAYBOOK.md`: 100-300 lines

Do not introduce a `large` tier at this stage. If a package wants to become
"large", it should probably be split.

---

## File Budgets

These are hard authoring limits unless explicitly exempted.

### `SKILL.md`

- recommended: 80-180 lines
- hard limit: 250 lines

If it exceeds 180 lines, review whether:

- execution steps belong in `PLAYBOOK.md`
- facts belong in `references/`
- examples belong in `examples/`

### `PLAYBOOK.md`

- recommended: 80-220 lines
- hard limit: 300 lines

If it exceeds 220 lines, review whether:

- the package is actually a `cookbook`
- a fact layer is missing
- shared procedure and edge cases should be separated

### `references/*.md`

- recommended: 80-250 lines
- hard limit: 400 lines

If a reference exceeds 250 lines, split by task or evidence type.

### `examples/*.md`

- recommended: 40-200 lines
- hard limit: 300 lines

Examples should demonstrate patterns, not act as a hidden playbook.

### `README.zh-CN.md`

- no runtime budget
- no hard line limit for now

Reason: it is human-facing only and excluded from the load path.

---

## Retrieval Budgets

### Candidate Count

- default `top-N`: 3
- preferred `top-N`: 1-2 for strong fingerprint matches

Never retrieve a long candidate list "just in case".

### ECC Fallback

- first pass: `my/` only
- second pass: include `ecc/` only when `my/` is weak or empty

### Injection Budget

The retrieval hook should inject:

- slug
- one-line reason
- source warning if `source: backfill`

It should NOT inject:

- full `SKILL.md`
- full error index entries
- README content

---

## Load Budgets by Stage

### Stage 0: Retrieval

Allowed reads:

- `INDEX.json`
- `ERROR-INDEX.json`

Budget:

- no body markdown reads
- no package expansion

### Stage 1: Entry

Allowed reads:

- `SKILL.md` of top-N candidates

Budget:

- at most `N` entry files
- `N <= 3`

### Stage 2: Core

Allowed reads:

- one `default_read_next`

Budget:

- only for the single best candidate
- default target is usually `PLAYBOOK.md`

### Stage 3: Reference

Allowed reads:

- one exact file from `references/` or `examples/`

Budget:

- one targeted follow-up read only
- no directory-wide preload

### Stage 4: Stop

Default rule:

- stop expanding unless new evidence appears

---

## Authoring Heuristics

Use these heuristics when deciding whether to split files.

### Move content out of `SKILL.md` when:

- a section becomes mostly procedural
- a section becomes mostly factual
- there are more than 2-3 substantial examples
- the entry file loses routing clarity

### Move content into `references/` when:

- it is mostly lookup material
- it is needed only after the core path is chosen
- it would distract from entry or core execution flow

### Move content into `examples/` when:

- output quality depends on pattern imitation
- positive/negative examples are valuable
- examples would otherwise dominate the playbook

---

## Package-Level Constraints

### atom

- prefer `tiny`
- usually no more than 2 runtime files

### cookbook

- prefer `small`
- many cases should live inside one coherent playbook, not many scattered files

### capability

- prefer `small` or `medium`
- runtime path should still be shallow

### router

- prefer `tiny` or `small`
- route first, do not auto-expand widely

---

## Audit Thresholds

These thresholds should be used by `/my-context-audit` and `/my-lint-skill`.

### Warning Thresholds

- `SKILL.md` > 180 lines
- `PLAYBOOK.md` > 220 lines
- any reference > 250 lines
- more than 1 normal-path reference read would be needed
- README duplicates runtime docs materially

### Hard Failure Thresholds

- `SKILL.md` > 250 lines
- `PLAYBOOK.md` > 300 lines
- any reference > 400 lines
- package requires loading more than 1 skill in Stage 2
- retrieval hook injects full markdown bodies

---

## Restructuring Rules

When a package exceeds budget, use this order:

1. reduce duplication
2. move procedures to `PLAYBOOK.md`
3. move facts to `references/`
4. move examples to `examples/`
5. upgrade package type
6. split into multiple packages

Do not solve budget problems by raising the budget first.

---

## Runtime Invariants

1. README never participates in auto-load.
2. `references/` is exact-path only.
3. One prompt expands at most one Skill package.
4. Budget exceptions must be explicit and rare.
5. The system should fail closed: if load cost becomes unclear, stop expanding.
