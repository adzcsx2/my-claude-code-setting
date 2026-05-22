# Taxonomy

## Purpose

Define the top-level classification boundaries for `skills/my/`.

Top-level categories are intentionally few to keep retrieval and maintenance simple.

---

## Allowed Categories

- `universal`
- `web`
- `android`
- `backend`

Do not add a new top-level category casually.

---

## Category Definitions

### `universal`

Use when the pattern transfers cleanly across multiple stacks or platforms.

Examples:

- debugging heuristics
- logging patterns
- failure triage playbooks
- context/load governance

### `web`

Use when the pattern depends on browser/frontend/web build/runtime behavior.

Examples:

- hydration mismatch
- CSS/layout/browser rendering issues
- client/server render divergence

### `android`

Use when the pattern depends on Android platform/runtime/tooling specifics.

Examples:

- Activity/Fragment lifecycle
- foldable behavior
- Gradle/AGP specifics
- adb/device workflows

### `backend`

Use when the pattern depends on server-side systems, databases, processes, APIs,
queues, or concurrency behavior.

Examples:

- migrations
- service startup order
- DB query pitfalls
- worker/retry behavior

---

## Classification Rules

1. Classify by problem domain, not programming language.
2. Put language/framework details in `stack_hint`, not in top-level category.
3. If a pattern truly spans multiple domains, prefer `universal`.
4. If two categories seem possible, choose the one that best matches trigger language.

---

## Anti-Patterns

- top-level categories by language (`python`, `typescript`, etc.)
- top-level categories by team or project
- adding categories for one or two packages only

---

## Escalation Rule

If a future need seems to justify a new top-level category, record it first in an
ADR/decision file and validate that existing categories cannot absorb it cleanly.
