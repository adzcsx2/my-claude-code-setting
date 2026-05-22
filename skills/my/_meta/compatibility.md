# Compatibility

## Purpose

Define how `skills/my/` handles stack drift, version drift, and review pressure
over time.

This file answers:

- when a package should be considered stale
- how stack/version hints should be used
- how much precision is required for compatibility metadata

---

## Core Rule

Packages should be specific enough to be useful, but not so specific that minor
version changes invalidate them immediately.

Use:

- `stack_hint` for important stack/platform clues
- lifecycle review when major drift happens

---

## Review Triggers

Review a package when:

1. a major framework/platform version changes
2. a package starts failing in real use
3. retrieval still matches but execution assumptions feel outdated
4. long time has passed without validation

---

## Metadata Guidance

Use `stack_hint` to capture:

- platform
- major framework/runtime/tooling versions when relevant

Examples:

- `Kotlin, Android SDK 34`
- `Next.js 15, React 19`
- `PostgreSQL 16, Prisma 6`

Do not force excessive precision for low-risk packages.

---

## Stale Handling

`stale` means:

- not recently reviewed
- still potentially useful
- should not be treated as fresh truth

It does not automatically mean "wrong".

---

## Compatibility Policy

1. prefer broad-but-honest stack hints
2. mark lifecycle stale instead of overfitting version numbers
3. re-verify before removing useful but aging packages
4. use `disputed` when the issue is trust, not just age

---

## Multi-Device Note

Usage metrics do not need perfect cross-device precision.

The primary compatibility concern is package validity, not exact hit count sync.
