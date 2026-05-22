# Lifecycle

## Purpose

Define the lifecycle state model for `skills/my/`.

This file is the source of truth for:

- main lifecycle states
- orthogonal tags
- allowed transitions
- review triggers
- retrieval preference implications

Related contracts:

- `scoring.v1.md`
- `load-contract.md`
- `compatibility.md`

---

## Main State Model

Every Skill MUST have exactly one main lifecycle state:

- `candidate`
- `promoted`
- `verified`
- `battle-tested`
- `stale`
- `archived`
- `rejected`

These states are mutually exclusive.

---

## Orthogonal Tags

The following are tags, not main states:

- `disputed`
- `backfill`
- `confidential`

Tags may coexist with any valid main state.

### Tag Rules

#### `disputed`

Use when:

- the Skill caused a bad recommendation
- the user explicitly challenged the guidance
- repeated negative feedback suggests the package is risky

Removal rule:

- remove only after review and correction

#### `backfill`

Use when:

- the package originated from historical backfill rather than realtime observation

Removal rule:

- optional after explicit human review if you want to normalize mature backfill items

#### `confidential`

Use when:

- the package must not be committed or exported

Removal rule:

- only after explicit sanitization and review

---

## State Meanings

### `candidate`

- newly generated
- not yet trusted
- may come from realtime or backfill
- lowest official recommendation confidence

### `promoted`

- accepted into the official package set
- structurally valid
- still needs practical confirmation

### `verified`

- reviewed and confirmed by at least one successful real usage or explicit validation

### `battle-tested`

- repeatedly used successfully
- high confidence for retrieval ranking

### `stale`

- not recently reviewed
- may still be useful, but should not be treated as fresh truth

### `archived`

- retained for history
- not part of normal recommendation flow

### `rejected`

- intentionally not part of the official set
- should not be returned by normal retrieval

---

## Allowed Transitions

### Normal Forward Flow

- `candidate -> promoted`
- `promoted -> verified`
- `verified -> battle-tested`

### Review and Decay Flow

- `candidate -> stale`
- `promoted -> stale`
- `verified -> stale`
- `battle-tested -> stale`
- `stale -> verified`

### Removal / Retirement Flow

- `candidate -> rejected`
- `promoted -> rejected`
- `candidate -> archived`
- `promoted -> archived`
- `stale -> archived`

### Explicitly Disallowed

- `rejected -> promoted` without manual recreation or explicit override
- `archived -> battle-tested` directly
- `candidate -> battle-tested`

If a retired item must return, route it through review and re-promotion instead of
skipping intermediate states.

---

## Entry Rules

### New Realtime Skill

Default:

- state = `candidate`
- tags = none

### New Backfill Skill

Default:

- state = `candidate`
- tags include `backfill`

### Quarantined Draft

Quarantine is not a lifecycle state.

It is an inbox location / workflow queue.

When a quarantined package is accepted, it enters lifecycle as `candidate` or
`promoted`, depending on review policy.

---

## Retrieval Preference

Preferred ranking order:

1. `battle-tested`
2. `verified`
3. `promoted`
4. `candidate`
5. `stale`

Do not normally retrieve:

- `archived`
- `rejected`

Modifiers:

- `disputed` lowers preference
- `backfill` lowers preference unless no better match exists
- `confidential` may block export and sharing workflows

---

## Review Triggers

Trigger lifecycle review when any of the following occurs:

1. a Skill accumulates repeated negative feedback
2. a package is tagged `disputed`
3. a package remains `candidate` too long
4. a package becomes `stale`
5. framework/version drift suggests the content may no longer hold

Suggested review windows:

- `candidate`: review within 14-30 days
- `promoted`: review within 30-60 days
- `verified` / `battle-tested`: periodic review within 90-180 days

Use `compatibility.md` for stack-version-specific review triggers.

---

## Required Metadata Alignment

Each Skill frontmatter should align with this file:

```yaml
lifecycle: candidate
quality_score: null
source: realtime
tags: []
```

Notes:

- `quality_score` is not a lifecycle state
- `tags` may include `backfill`, `disputed`, `confidential`

---

## Audit Expectations

`/my-review` should surface at least:

- stale packages
- disputed packages
- long-lived candidates
- archived items pending possible cleanup

`/my-health` should summarize:

- count by lifecycle state
- count by important tags

---

## Invariants

1. One main lifecycle state only.
2. Quarantine is a workflow queue, not a lifecycle state.
3. `quality_score` is numeric evidence, not status.
4. Retrieval ranking must respect lifecycle.
5. Tags never replace the main lifecycle field.
